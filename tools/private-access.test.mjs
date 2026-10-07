import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../worker/private-access.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { handlePrivateAccess } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const encoder = new TextEncoder();
const PASSWORD = '001337'; // Test-only PIN: leading zeros must remain significant.
const origin = 'https://example.test';
const page = '<!doctype html><html lang="zh"><body>PRIVATE_TEST_DOCUMENT</body></html>';
const salt = '0a'.repeat(16);
const material = await webcrypto.subtle.importKey('raw', encoder.encode(PASSWORD), 'PBKDF2', false, ['deriveBits']);
const hash = Buffer.from(await webcrypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, material, 256)).toString('hex');

// Exercise the actual SQL against SQLite using Python's standard library. The
// bridge only adapts D1's prepare/bind/first/run/batch methods; it does not model
// authentication behavior or emulate SQL using JavaScript conditionals.
const sqliteBridge = String.raw`
import sys,json,sqlite3
db=sqlite3.connect(':memory:')
db.row_factory=sqlite3.Row
db.executescript('''
CREATE TABLE private_access_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE private_access_sessions (token_hash TEXT PRIMARY KEY, revision TEXT NOT NULL, expires INTEGER NOT NULL);
''')
for line in sys.stdin:
    command=json.loads(line)
    try:
        result=[]
        with db:
            for item in command['queries']:
                cursor=db.execute(item['sql'],item['values'])
                row=cursor.fetchone() if item['first'] else None
                result.append(dict(row) if row is not None else None)
        print(json.dumps({'id':command['id'],'result':result}),flush=True)
    except Exception as error:
        print(json.dumps({'id':command['id'],'error':str(error)}),flush=True)
`;

function database(t) {
  const child = spawn('python', ['-u', '-c', sqliteBridge], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const pending = new Map();
  let nextId = 0, stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  createInterface({ input: child.stdout }).on('line', line => {
    const reply = JSON.parse(line), task = pending.get(reply.id);
    pending.delete(reply.id);
    if (reply.error) task.reject(new Error(reply.error)); else task.resolve(reply.result);
  });
  child.on('error', error => { for (const task of pending.values()) task.reject(error); pending.clear(); });
  child.on('exit', code => { for (const task of pending.values()) task.reject(new Error(`SQLite bridge exited ${code}: ${stderr}`)); pending.clear(); });
  t.after(() => child.stdin.end());
  const execute = queries => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, queries }) + '\n');
  });
  return {
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { this.values = values; return this; },
        async first() { return (await execute([{ sql: this.sql, values: this.values, first: true }]))[0]; },
        async run() { await execute([{ sql: this.sql, values: this.values, first: false }]); return {}; },
      };
      return statement;
    },
    batch(statements) { return execute(statements.map(statement => ({ sql: statement.sql, values: statement.values, first: false }))); },
  };
}

function environment(t) { return { DB: database(t), PRIVATE_ACCESS_CONFIG: JSON.stringify({ salt, hash }) }; }
function request(path = '/private/session', options = {}) {
  const { method = 'GET', password, body, cookie, ip = '192.0.2.1', requestOrigin = origin, headers = {} } = options;
  const allHeaders = { 'cf-connecting-ip': ip, ...headers };
  if (requestOrigin !== null && ['POST', 'DELETE'].includes(method)) allHeaders.origin = requestOrigin;
  if (cookie) allHeaders.cookie = cookie;
  let payload = body;
  if (password !== undefined) payload = JSON.stringify({ password });
  if (payload !== undefined && !Object.hasOwn(headers, 'content-type')) allHeaders['content-type'] = 'application/json';
  return new Request(origin + path, { method, headers: allHeaders, body: payload });
}
const access = (env, path, options) => handlePrivateAccess(request(path, options), env, page);
async function unlock(env, extra = {}) {
  const response = await access(env, '/private/session', { method: 'POST', password: PASSWORD, ...extra });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^private_access=[a-f0-9]{64}; Path=\/private; HttpOnly; SameSite=Strict; Max-Age=1800; Secure$/);
  return { response, cookie: cookie.split(';')[0] };
}

test('unrelated requests fall through, missing configuration fails closed, locked requests disclose no page or label', async t => {
  assert.equal(await access({}, '/'), null);
  assert.equal((await access({}, '/private/view')).status, 503);
  const env = environment(t);
  for (const path of ['/private/session', '/private/view']) {
    const response = await access(env, path);
    assert.equal(response.status, 401);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.doesNotMatch(await response.text(), /PRIVATE_TEST_DOCUMENT|资产终端|Terminal/);
  }
});

test('wrong, missing and numeric passwords fail; valid leading-zero string returns a usable session', async t => {
  const env = environment(t);
  for (const password of ['999999', 1337, '01337']) {
    assert.equal((await access(env, '/private/session', { method: 'POST', password })).status, 401);
  }
  assert.equal((await access(env, '/private/session', { method: 'POST', body: '{}' })).status, 401);
  const { response, cookie } = await unlock(env);
  const session = await response.json();
  assert.equal(session.unlocked, true);
  assert.equal(session.label.zh, '资产终端');
  const view = await access(env, '/private/view', { cookie });
  assert.equal(view.status, 200);
  assert.equal(await view.text(), page.replace('<html ', '<html data-private-embed '));
  assert.match(view.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(view.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal((await access(env, '/private/session', { cookie })).status, 200);
  const row = await env.DB.prepare('SELECT token_hash FROM private_access_sessions').first();
  assert.notEqual(row.token_hash, cookie.slice('private_access='.length));
});

test('logout revokes the token server-side, including replay from another tab', async t => {
  const env = environment(t), { cookie } = await unlock(env);
  const response = await access(env, '/private/session', { method: 'DELETE', cookie });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await access(env, '/private/view', { cookie })).status, 401);
  assert.equal((await access(env, '/private/session', { cookie })).status, 401);
});

test('expiry and configuration rotation invalidate existing sessions', async t => {
  const env = environment(t), start = Date.now();
  t.mock.method(Date, 'now', () => start);
  const { cookie } = await unlock(env);
  t.mock.method(Date, 'now', () => start + 1800000);
  assert.equal((await access(env, '/private/view', { cookie })).status, 401);
  t.mock.method(Date, 'now', () => start);
  env.PRIVATE_ACCESS_CONFIG = JSON.stringify({ salt, hash: 'f'.repeat(64) });
  assert.equal((await access(env, '/private/view', { cookie })).status, 401);
});

test('cross-origin and missing-origin writes are rejected without issuing or deleting a session', async t => {
  const env = environment(t), { cookie } = await unlock(env);
  for (const requestOrigin of ['https://attacker.test', 'null', null]) {
    assert.equal((await access(env, '/private/session', { method: 'POST', password: PASSWORD, requestOrigin })).status, 403);
    assert.equal((await access(env, '/private/session', { method: 'DELETE', cookie, requestOrigin })).status, 403);
  }
  assert.equal((await access(env, '/private/view', { cookie })).status, 200);
});

test('malformed and oversized streams fail closed, unsupported methods return 405', async t => {
  const env = environment(t);
  assert.equal((await access(env, '/private/session', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await access(env, '/private/session', { method: 'POST', body: 'x', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await access(env, '/private/session', { method: 'POST', body: ' '.repeat(257) })).status, 413);
  assert.equal((await access(env, '/private/session', { method: 'POST', body: '{}', headers: { 'content-length': '257' } })).status, 413);
  assert.equal((await access(env, '/private/session', { method: 'PUT' })).status, 405);
  assert.equal((await access(env, '/private/view', { method: 'POST' })).status, 405);
});

test('per-IP limit is persistent and concurrent attempts cannot exceed it; expiry permits login again', async t => {
  const env = environment(t), start = Date.now();
  t.mock.method(Date, 'now', () => start);
  const responses = await Promise.all(Array.from({ length: 10 }, () => access(env, '/private/session', { method: 'POST', password: '999999' })));
  assert.equal(responses.filter(response => response.status === 401).length, 5);
  assert.equal(responses.filter(response => response.status === 429).length, 5);
  const blocked = await access(env, '/private/session', { method: 'POST', password: PASSWORD });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '900');
  t.mock.method(Date, 'now', () => start + 900000);
  await unlock(env);
});

test('global limit constrains attempts spread across IP addresses', async t => {
  const env = environment(t);
  for (let index = 0; index < 60; index++) {
    assert.equal((await access(env, '/private/session', { method: 'POST', password: 'x', ip: `192.0.2.${index}` })).status, 401);
  }
  assert.equal((await access(env, '/private/session', { method: 'POST', password: PASSWORD, ip: '198.51.100.1' })).status, 429);
});

function frontendHarness(script) {
  class Element {
    constructor(id) { this.id = id; this.textContent = ''; this.value = ''; this.attributes = {}; this.style = {}; this.events = {}; this.children = []; this.hidden = true; this.disabled = false; }
    addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
    async dispatch(name) { await Promise.all((this.events[name] || []).map(callback => callback({ preventDefault() {} }))); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    focus() {}
    showModal() { this.open = true; }
    close() { this.open = false; for (const callback of this.events.close || []) callback(); }
    appendChild(child) { child.parent = this; this.children.push(child); }
    querySelector(name) { return this.children.find(child => child.id === name) || null; }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  }
  const ids = ['private-entry', 'private-dialog', 'private-panel', 'private-password', 'private-error', 'private-submit', 'private-title', 'private-cancel', 'private-form', 'private-lock', 'private-close'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  const timers = [], intervals = [], requests = [], replies = [], windowEvents = {};
  const classes = new Set();
  const document = {
    documentElement: { dataset: { lang: 'zh' } }, body: { classList: { add: x => classes.add(x), remove: x => classes.delete(x) } },
    getElementById: id => elements[id], createElement: name => new Element(name), querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 114 }) }), querySelectorAll: () => [], addEventListener() {},
  };
  elements['private-entry'].textContent = '••••••';
  let observeLanguage;
  vm.runInNewContext(script, {
    document, window: { addEventListener: (name, callback) => { windowEvents[name] = callback; } }, location: { protocol: 'https:' },
    Date, AbortController, MutationObserver: class { constructor(callback) { observeLanguage = callback; } observe() {} }, ResizeObserver: class { observe() {} },
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {}, setInterval: callback => intervals.push(callback),
    fetch: async (url, options) => { requests.push({ url, ...options }); assert.ok(replies.length, 'Unexpected network request'); return await replies.shift()(options); },
  });
  return { elements, timers, intervals, requests, classes, document,
    reply(status, data, headers = {}) { replies.push(() => new Response(JSON.stringify(data), { status, headers })); },
    deferReply() { let resolve; const promise = new Promise(done => { resolve = done; }); replies.push(() => promise); return (status, data) => resolve(new Response(JSON.stringify(data), { status })); },
    changeLanguage(lang) { document.documentElement.dataset.lang = lang; observeLanguage(); },
  };
}

test('real entry script reveals name and iframe only after success, then lock removes both', async () => {
  const script = await readFile(new URL('../public/assets/private-entry.js', import.meta.url), 'utf8');
  const app = frontendHarness(script), e = app.elements;
  assert.equal(app.requests.length, 0);
  assert.equal(e['private-entry'].textContent, '••••••');
  assert.equal(e['private-panel'].querySelector('iframe'), null);
  await e['private-entry'].dispatch('click');
  assert.equal(e['private-dialog'].open, true);
  e['private-password'].value = '999999';
  app.reply(401, { error: 'incorrect' });
  await e['private-form'].dispatch('submit');
  assert.equal(e['private-entry'].textContent, '••••••');
  assert.equal(e['private-panel'].querySelector('iframe'), null);
  assert.match(e['private-error'].textContent, /密码不正确/);
  e['private-password'].value = PASSWORD;
  app.reply(200, { unlocked: true, label: { zh: '资产终端', en: 'Terminal' }, expiresAt: Date.now() + 1800000 });
  await e['private-form'].dispatch('submit');
  assert.equal(JSON.parse(app.requests[1].body).password, PASSWORD);
  assert.equal(e['private-entry'].textContent, '资产终端');
  assert.equal(e['private-title'].textContent, '资产终端');
  assert.equal(e['private-panel'].querySelector('iframe').src, '/private/view');
  assert.equal(e['private-password'].value, '');
  assert.equal(e['private-panel'].hidden, false);
  assert.equal(e['private-dialog'].open, false);
  app.changeLanguage('en');
  assert.equal(e['private-entry'].textContent, 'Terminal');
  await e['private-close'].dispatch('click');
  assert.equal(e['private-panel'].hidden, true);
  assert.equal(e['private-entry'].textContent, 'Terminal');
  await e['private-entry'].dispatch('click');
  app.reply(200, { unlocked: false });
  await e['private-lock'].dispatch('click');
  assert.equal(app.requests.at(-1).method, 'DELETE');
  assert.equal(e['private-entry'].textContent, '••••••');
  assert.equal(e['private-title'].textContent, '');
  assert.equal(e['private-panel'].hidden, true);
  assert.equal(e['private-panel'].querySelector('iframe'), null);
});

test('canceling an in-flight login cannot reveal a late success response', async () => {
  const script = await readFile(new URL('../public/assets/private-entry.js', import.meta.url), 'utf8');
  const app = frontendHarness(script), e = app.elements;
  await e['private-entry'].dispatch('click');
  e['private-password'].value = PASSWORD;
  const finish = app.deferReply();
  const submitting = e['private-form'].dispatch('submit');
  await e['private-cancel'].dispatch('click');
  finish(200, { unlocked: true, label: { zh: '资产终端', en: 'Terminal' }, expiresAt: Date.now() + 1800000 });
  await submitting;
  assert.equal(e['private-entry'].textContent, '••••••');
  assert.equal(e['private-panel'].querySelector('iframe'), null);
  assert.equal(e['private-submit'].disabled, false);
});
