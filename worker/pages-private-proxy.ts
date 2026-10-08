const SERVICE = 'https://jack-ye-oxjackye.realjackye.chatgpt.site';
const METHODS: Record<string, string[]> = {
  '/private/session': ['GET', 'POST', 'DELETE'],
  '/private/view': ['GET'],
};

function failure(error: string, status: number) {
  return new Response(JSON.stringify({ error }), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  }});
}

export async function proxyPrivateRequest(request: Request, send: typeof fetch = fetch): Promise<Response> {
  const incoming = new URL(request.url);
  const methods = METHODS[incoming.pathname];
  if (!methods) return failure('not_found', 404);
  if (!methods.includes(request.method)) return failure('method', 405);
  const write = request.method === 'POST' || request.method === 'DELETE';
  // Validate the browser's real origin before replacing it for the server hop.
  if (write && request.headers.get('origin') !== incoming.origin) return failure('origin', 403);
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'user-agent']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (write) headers.set('origin', SERVICE);
  const sessionCookie = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => /^private_access=[a-f0-9]{64}$/.test(value));
  if (sessionCookie) headers.set('cookie', sessionCookie);
  // Never relay unrelated cookies, authorization credentials or client-supplied IP headers.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await send(SERVICE + incoming.pathname, {
      method: request.method, headers, body: request.method === 'POST' ? request.body : undefined,
      redirect: 'manual', signal: controller.signal,
    });
    const type = upstream.headers.get('content-type') || '';
    const expectsJson = incoming.pathname === '/private/session' || !upstream.ok;
    if (upstream.status >= 300 && upstream.status < 400 || (expectsJson ? !type.includes('application/json') : !type.includes('text/html'))) {
      return failure('service_unavailable', 502);
    }
    const responseHeaders = new Headers({
      'content-type': type, 'cache-control': 'private, no-store, max-age=0',
      'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    });
    const session = upstream.headers.get('set-cookie');
    if (session?.startsWith('private_access=')) responseHeaders.set('set-cookie', session);
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) responseHeaders.set('retry-after', retryAfter);
    if (incoming.pathname === '/private/view') {
      responseHeaders.set('content-security-policy', "frame-ancestors 'self'; base-uri 'none'; object-src 'none'");
      responseHeaders.set('x-frame-options', 'SAMEORIGIN');
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return failure('service_unavailable', 502);
  } finally {
    clearTimeout(timeout);
  }
}
