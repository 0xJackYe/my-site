interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface PrivateEnv {
  DB?: { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> };
  PRIVATE_ACCESS_CONFIG?: string;
}

const COOKIE = 'private_access';
const TTL = 30 * 60;
const WINDOW = 15 * 60;
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
const digest = async (value: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

function reply(body: string, status = 200, extra: Record<string, string> = {}) {
  return new Response(body, { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow, noarchive',
    ...extra,
  }});
}

function cookie(value: string, request: Request, age = TTL) {
  return `${COOKIE}=${value}; Path=/private; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

function token(request: Request) {
  const value = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export async function handlePrivateAccess(request: Request, env: PrivateEnv, page: string | (() => Promise<string>)): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/private/session' && url.pathname !== '/private/view') return null;
  try {
    const db = env.DB;
    const config = JSON.parse(env.PRIVATE_ACCESS_CONFIG || '{}');
    if (!db || !/^[a-f0-9]{32}$/.test(config.salt || '') || !/^[a-f0-9]{64}$/.test(config.hash || '')) {
      return reply('{"error":"unavailable"}', 503);
    }
    const now = Math.floor(Date.now() / 1000);
    const sessionToken = token(request);
    const tokenHash = sessionToken ? await digest(sessionToken) : null;
    const revision = await digest(config.salt + config.hash);
    const session = tokenHash ? await db.prepare('SELECT expires FROM private_access_sessions WHERE token_hash = ? AND revision = ? AND expires > ?').bind(tokenHash, revision, now).first<{ expires: number }>() : null;

    if (url.pathname === '/private/view') {
      if (request.method !== 'GET') return reply('{}', 405, { allow: 'GET' });
      if (!session) return reply('{"error":"locked"}', 401);
      const document = typeof page === 'function' ? await page() : page;
      return reply(document.replace('<html ', '<html data-private-embed '), 200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "frame-ancestors 'self'; base-uri 'none'; object-src 'none'",
        'x-frame-options': 'SAMEORIGIN',
      });
    }
    if (request.method === 'GET') {
      return session ? reply(JSON.stringify({ unlocked: true, label: { zh: '资产终端', en: 'Terminal' }, expiresAt: session.expires * 1000 })) : reply('{"unlocked":false}', 401);
    }
    if (!['POST', 'DELETE'].includes(request.method)) return reply('{}', 405, { allow: 'GET, POST, DELETE' });
    if (request.headers.get('origin') !== url.origin) return reply('{"error":"origin"}', 403);
    if (request.method === 'DELETE') {
      if (tokenHash) await db.prepare('DELETE FROM private_access_sessions WHERE token_hash = ?').bind(tokenHash).run();
      return reply('{"unlocked":false}', 200, { 'set-cookie': cookie('', request, 0) });
    }
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply('{"error":"format"}', 415);
    if (Number(request.headers.get('content-length') || 0) > 256) return reply('{"error":"size"}', 413);
    // Bound the actual stream too; Content-Length is untrusted.
    const reader = request.body?.getReader();
    if (!reader) return reply('{"error":"format"}', 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 256) { await reader.cancel(); return reply('{"error":"size"}', 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let password: unknown;
    try { password = JSON.parse(new TextDecoder().decode(bytes)).password; } catch { return reply('{"error":"format"}', 400); }

    await db.batch([
      db.prepare('DELETE FROM private_access_attempts WHERE expires <= ?').bind(now),
      db.prepare('DELETE FROM private_access_sessions WHERE expires <= ?').bind(now),
    ]);
    // Atomic persistent counters, shared across Worker instances. Do not trust X-Forwarded-For.
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    const keys = ['global', 'ip:' + await digest(config.salt + ip)];
    for (let i = 0; i < keys.length; i++) {
      const counter = await db.prepare('INSERT INTO private_access_attempts (key, count, expires) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count, expires').bind(keys[i], now + WINDOW).first<{ count: number; expires: number }>();
      if (!counter || counter.count > (i === 0 ? 60 : 5)) return reply('{"error":"limited"}', 429, { 'retry-after': String(Math.max(1, (counter?.expires || now + WINDOW) - now)) });
    }
    let valid = false;
    if (typeof password === 'string' && /^\d{6}$/.test(password)) {
      const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
      const hash = hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(config.salt), iterations: 100000, hash: 'SHA-256' }, material, 256));
      let difference = 0;
      for (let i = 0; i < hash.length; i++) difference |= hash.charCodeAt(i) ^ config.hash.charCodeAt(i);
      valid = difference === 0;
    }
    if (!valid) return reply('{"error":"incorrect"}', 401);
    const newToken = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
    await db.prepare('INSERT INTO private_access_sessions (token_hash, revision, expires) VALUES (?, ?, ?)').bind(await digest(newToken), revision, now + TTL).run();
    return reply(JSON.stringify({ unlocked: true, label: { zh: '资产终端', en: 'Terminal' }, expiresAt: (now + TTL) * 1000 }), 200, { 'set-cookie': cookie(newToken, request) });
  } catch {
    return reply('{"error":"unavailable"}', 503);
  }
}
