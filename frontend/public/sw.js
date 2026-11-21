/* AgroBolivia — funcionamiento sin conexión.
 * - La app (HTML, JS, CSS) queda guardada para abrir sin señal.
 * - Clima, avisos, biblioteca, ubicaciones y cultivos: primero la red; si falla, la última copia guardada,
 *   marcada con la cabecera x-agb-offline y la fecha en que se guardó.
 * - No se guardan respuestas con sesión iniciada (datos personales), con coordenadas GPS en la URL
 *   ni peticiones que no sean GET. */
const VERSION = 'agb-v2'
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest']
const API_CACHEABLE = /^\/api\/(weather|notices|education|locations|crops|locate)/

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})

async function withHeaders(response, extra) {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(extra)) headers.set(k, v)
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers })
}

self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)) }
      return res
    })))
    return
  }
  const hasGps = url.searchParams.has('lat') || url.searchParams.has('lon')
  if (API_CACHEABLE.test(url.pathname) && !hasGps && !req.headers.get('Authorization')) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION)
      try {
        const res = await fetch(req)
        if (res.ok) await cache.put(req, await withHeaders(res.clone(), { 'x-agb-cached-at': new Date().toISOString() }))
        return res
      } catch (e) {
        const hit = await cache.match(req)
        if (hit) return withHeaders(hit, { 'x-agb-offline': '1' })
        return new Response(JSON.stringify({ detail: 'Sin conexión y sin datos guardados para esta consulta.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } })
      }
    })())
  }
})
