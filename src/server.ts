import handler from '@tanstack/react-start/server-entry'

export interface Env {
  /** Base URL the Worker uses to reach the TriCaster, e.g. https://tricaster.example.com */
  TRICASTER_URL?: string
  /** Optional "user:password" for TriCaster Basic auth (set as a secret). */
  TRICASTER_AUTH?: string
}

/**
 * Proxies /tc/v1/* to the TriCaster so the browser talks same-origin over HTTPS
 * (no mixed-content or CORS problems). WebSocket upgrades pass straight through.
 */
async function proxyToTriCaster(request: Request, env: Env): Promise<Response> {
  if (!env.TRICASTER_URL) {
    return new Response('TRICASTER_URL is not configured', { status: 503 })
  }
  const url = new URL(request.url)
  const path = url.pathname.slice('/tc'.length)
  if (!path.startsWith('/v1/')) return new Response('Not found', { status: 404 })

  const target = new URL(path + url.search, env.TRICASTER_URL)
  const headers = new Headers(request.headers)
  for (const h of ['host', 'cookie', 'origin', 'referer']) headers.delete(h)
  if (env.TRICASTER_AUTH) headers.set('authorization', `Basic ${btoa(env.TRICASTER_AUTH)}`)

  try {
    return await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    })
  } catch (err) {
    return new Response(`TriCaster unreachable: ${String(err)}`, { status: 502 })
  }
}

export default {
  fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/tc' || pathname.startsWith('/tc/')) return proxyToTriCaster(request, env)
    return handler.fetch(request)
  },
}
