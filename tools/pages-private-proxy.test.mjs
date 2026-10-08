import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../worker/pages-private-proxy.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { proxyPrivateRequest } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const origin = 'https://0xjackye.pages.dev';
const service = 'https://jack-ye-oxjackye.realjackye.chatgpt.site';
const cookie = 'private_access=' + 'ab'.repeat(32);
const request = (path, options = {}) => new Request(origin + path, options);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
const noSend = async () => assert.fail('Rejected request must not reach the upstream service');

async function expectFailure(response, status, error) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await response.json(), { error });
}

test('only the two private routes and their exact allowed methods are forwarded', async () => {
  for (const path of ['/private/other', '/private/session/extra', '/private/view/', '/assets/private-entry.js', '/']) {
    await expectFailure(await proxyPrivateRequest(request(path), noSend), 404, 'not_found');
  }
  for (const [path, method] of [['/private/session', 'PUT'], ['/private/session', 'OPTIONS'], ['/private/view', 'POST'], ['/private/view', 'DELETE'], ['/private/view', 'HEAD']]) {
    await expectFailure(await proxyPrivateRequest(request(path, { method }), noSend), 405, 'method');
  }
  for (const [path, method] of [['/private/session', 'GET'], ['/private/session', 'POST'], ['/private/session', 'DELETE'], ['/private/view', 'GET']]) {
    let calls = 0;
    const response = await proxyPrivateRequest(request(path + '?target=https://attacker.invalid/', { method, headers: { origin } }), async (url, options) => {
      calls++;
      assert.equal(url, service + path);
      assert.equal(options.method, method);
      assert.equal(options.redirect, 'manual');
      assert.ok(options.signal instanceof AbortSignal);
      return path.endsWith('/view') ? new Response('<!doctype html><p>protected</p>', { headers: { 'content-type': 'text/html; charset=utf-8' } }) : json({ unlocked: false }, 401);
    });
    assert.equal(calls, 1);
    assert.equal(response.status, path.endsWith('/view') ? 200 : 401);
  }
});

test('writes require the browser origin before the upstream origin is substituted', async () => {
  for (const method of ['POST', 'DELETE']) {
    for (const foreign of [undefined, 'null', 'https://attacker.invalid', origin + '.attacker.invalid', origin + '/']) {
      await expectFailure(await proxyPrivateRequest(request('/private/session', { method, headers: foreign === undefined ? {} : { origin: foreign } }), noSend), 403, 'origin');
    }
    let calls = 0;
    await proxyPrivateRequest(request('/private/session', { method, headers: { origin } }), async (url, options) => {
      calls++;
      assert.equal(options.headers.get('origin'), service);
      return json({ unlocked: false });
    });
    assert.equal(calls, 1);
  }
});

test('POST body is passed unchanged and only allowlisted headers and valid session cookie are forwarded', async () => {
  const body = JSON.stringify({ password: '001337' });
  const headers = {
    origin, cookie: 'other=not-forwarded; ' + cookie + '; platform_auth=not-forwarded',
    'content-type': 'application/json', accept: 'application/json', 'user-agent': 'private-proxy-test',
    authorization: 'Bearer not-forwarded', 'x-forwarded-for': '192.0.2.10',
    'cf-connecting-ip': '192.0.2.11', 'x-real-ip': '192.0.2.12', referer: origin + '/private',
    'oai-sites-authorization': 'Bearer not-forwarded', 'x-forwarded-host': 'attacker.invalid',
  };
  await proxyPrivateRequest(request('/private/session', { method: 'POST', headers, body }), async (url, options) => {
    assert.equal(await new Response(options.body).text(), body);
    assert.deepEqual(Object.fromEntries(options.headers), {
      accept: 'application/json', 'content-type': 'application/json', cookie,
      origin: service, 'user-agent': 'private-proxy-test',
    });
    return json({ unlocked: true });
  });
});

test('missing, malformed, similarly named, and uppercase tokens are not sent upstream', async () => {
  for (const value of ['', 'other=abc', 'private_access=abc', 'private_access=' + 'a'.repeat(63), 'private_access=' + 'A'.repeat(64), 'not_' + cookie, cookie + 'extra']) {
    await proxyPrivateRequest(request('/private/session', { headers: { cookie: value, origin: 'https://attacker.invalid' } }), async (url, options) => {
      assert.equal(options.headers.has('cookie'), false);
      assert.equal(options.headers.has('origin'), false);
      assert.equal(options.body, undefined);
      return json({ unlocked: false }, 401);
    });
  }
});

test('successful session preserves its host-only secure cookie and strips unrelated response headers', async () => {
  const setCookie = cookie + '; Path=/private; HttpOnly; SameSite=Strict; Max-Age=1800; Secure';
  const data = { unlocked: true, label: { zh: '资产终端', en: 'Terminal' }, expiresAt: Date.now() + 1800000 };
  const response = await proxyPrivateRequest(request('/private/session'), async () => json(data, 200, {
    'set-cookie': setCookie, 'cache-control': 'public, max-age=99999', 'access-control-allow-origin': '*',
    location: 'https://attacker.invalid/', 'x-internal-detail': 'not-forwarded',
  }));
  assert.deepEqual(await response.json(), data);
  assert.equal(response.headers.get('set-cookie'), setCookie);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  for (const header of ['access-control-allow-origin', 'location', 'x-internal-detail']) assert.equal(response.headers.has(header), false);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
});

test('authentication failures and rate-limit retry timing remain intact', async () => {
  for (const status of [400, 401, 403, 413, 415, 429, 503]) {
    const data = { error: status === 429 ? 'limited' : 'unavailable' };
    const response = await proxyPrivateRequest(request('/private/session'), async () => json(data, status, { 'retry-after': '720', 'set-cookie': 'platform_auth=not-forwarded' }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), data);
    assert.equal(response.headers.get('retry-after'), '720');
    assert.equal(response.headers.has('set-cookie'), false);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
});

test('locking preserves the expired private cookie and sends no DELETE request body', async () => {
  const expired = 'private_access=; Path=/private; HttpOnly; SameSite=Strict; Max-Age=0; Secure';
  const response = await proxyPrivateRequest(request('/private/session', { method: 'DELETE', headers: { origin, cookie } }), async (url, options) => {
    assert.equal(options.body, undefined);
    assert.equal(options.headers.get('cookie'), cookie);
    return json({ unlocked: false }, 200, { 'set-cookie': expired });
  });
  assert.equal(response.headers.get('set-cookie'), expired);
  assert.deepEqual(await response.json(), { unlocked: false });
});

test('view retains authenticated HTML and same-origin framing while locked view stays JSON 401', async () => {
  const html = '<!doctype html><html><body>Private test document</body></html>';
  const view = await proxyPrivateRequest(request('/private/view', { headers: { cookie } }), async (url, options) => {
    assert.equal(options.headers.get('cookie'), cookie);
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
  assert.equal(await view.text(), html);
  assert.match(view.headers.get('cache-control'), /no-store/);
  assert.equal(view.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(view.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  const locked = await proxyPrivateRequest(request('/private/view'), async (url, options) => {
    assert.equal(options.headers.has('cookie'), false);
    return json({ error: 'locked' }, 401);
  });
  await expectFailure(locked, 401, 'locked');
});

test('redirects are never followed or returned to the browser', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    let calls = 0;
    const response = await proxyPrivateRequest(request('/private/session'), async (url, options) => {
      calls++;
      assert.equal(options.redirect, 'manual');
      return new Response(null, { status, headers: { location: 'https://attacker.invalid/', 'content-type': 'application/json' } });
    });
    assert.equal(calls, 1);
    await expectFailure(response, 502, 'service_unavailable');
    assert.equal(response.headers.has('location'), false);
  }
});

test('HTML proxy errors, unexpected success types, and network errors become no-store JSON failures', async () => {
  for (const [path, status, type] of [
    ['/private/session', 200, 'text/html'], ['/private/session', 404, 'text/html'],
    ['/private/session', 502, 'text/plain'], ['/private/session', 200, ''],
    ['/private/view', 200, 'application/json'], ['/private/view', 503, 'text/html'],
  ]) {
    await expectFailure(await proxyPrivateRequest(request(path), async () => new Response('Unexpected upstream document', { status, headers: { 'content-type': type } })), 502, 'service_unavailable');
  }
  await expectFailure(await proxyPrivateRequest(request('/private/session'), async () => { throw new TypeError('Private network detail'); }), 502, 'service_unavailable');
});

test('an upstream that stalls is aborted after the configured timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const result = proxyPrivateRequest(request('/private/session'), async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }));
  t.mock.timers.tick(15000);
  await expectFailure(await result, 502, 'service_unavailable');
});
