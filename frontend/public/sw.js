/* AgroBolivia — funcionamiento sin conexión.
 * - La app completa (HTML, JS, CSS) queda guardada; si el servidor tarda más de 3,5 s, abre la copia guardada.
 * - Clima, ganado, boletín, señas, avisos, biblioteca, ubicaciones y cultivos: primero la red; si falla, la última copia guardada,
 *   marcada con la cabecera x-agb-offline y la fecha en que se guardó.
 * - No se guardan respuestas con sesión iniciada (datos personales) ni peticiones que no sean GET. */
const VERSION = 'agb-v2'
const SHELL = ['/favicon.svg', '/manifest.webmanifest', '/icon-192.png']
const LIST = '/__agb-assets.json'
const API_CACHEABLE = /^\/api\/(weather|notices|education|locations|crops|locate|ganado\/(noches|sequia|catalogo|boletin)|senas$|senas\/zona|pachagrama)/
// Datos públicos (iguales para todos): se guardan aunque haya sesión iniciada.
const API_PUBLIC = /^\/api\/(weather|education|locations|crops|locate|ganado\/(noches|sequia|catalogo|boletin)|senas$|pachagrama)/
const WAIT_MS = 3500  // si el servidor tarda más (señal débil o Render despertando), se abre la copia guardada

// Guarda index.html y TODOS los archivos de la app (también las pantallas que se cargan después),
// para que abra sin señal. Conserva la versión anterior por si una pestaña abierta todavía la usa.
async function refreshApp(cache, res) {
  try {
    res = res || await fetch('/index.html', { cache: 'no-store' })
    if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return
    const html = await res.clone().text()
    const entry = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1])
    const found = new Set(entry)
    // Pantallas que se cargan después («./Ganado-xxx.js») y fuentes que pide el CSS.
    for (const file of entry.filter(a => a.endsWith('.js') || a.endsWith('.css'))) {
      const code = await (await fetch(file)).text()
      for (const m of code.matchAll(/(?:assets\/|\.\/)([\w-]+(?:\.[\w-]+)*\.(?:js|css|woff2))/g)) found.add('/assets/' + m[1])
    }
    const assets = [...found]
    await Promise.all(assets.map(a => cache.match(a).then(hit => hit || cache.add(a))))
    await cache.put('/index.html', res)
    const prev = await cache.match(LIST).then(r => r ? r.json() : { now: [] }).catch(() => ({ now: [] }))
    const keep = new Set([...assets, ...prev.now])
    for (const k of await cache.keys()) {
      const path = new URL(k.url).pathname
      if (path.startsWith('/assets/') && !keep.has(path)) await cache.delete(k)
    }
    await cache.put(LIST, new Response(JSON.stringify({ now: assets }), { headers: { 'Content-Type': 'application/json' } }))
  } catch (e) { /* sin señal: se intenta en la próxima visita */ }
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(async c => { await c.addAll(SHELL).catch(() => {}); await refreshApp(c) }).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})

const OFFLINE_PAGE = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PACHA-AGRO</title><body style="font-family:system-ui,sans-serif;background:#FAF6EE;color:#1E4A2C;padding:32px;text-align:center">
<h1 style="font-size:28px">PACHA-AGRO</h1><p style="font-size:18px">No hay señal y la app todavía no quedó guardada en este celular.</p>
<p style="font-size:18px">Ábrala una vez con internet y espere a que cargue: después funcionará sin señal.</p>
<button onclick="location.reload()" style="font-size:18px;padding:12px 24px;border-radius:8px;border:0;background:#1E4A2C;color:#fff">Reintentar</button></body></html>`

async function navigate(event) {
  const cache = await caches.open(VERSION)
  const cached = await cache.match('/index.html')
  const net = fetch(event.request).then(res => {
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) event.waitUntil(refreshApp(cache, res.clone()))
    return res
  })
  if (!cached) return net.catch(() => new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  const quick = await Promise.race([net.catch(() => null), new Promise(r => setTimeout(() => r(null), WAIT_MS))])
  return quick || cached
}

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
    event.respondWith(navigate(event))
    return
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/img/')) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)) }
      return res
    })))
    return
  }
  if (API_CACHEABLE.test(url.pathname) && (API_PUBLIC.test(url.pathname) || !req.headers.get('Authorization'))) {
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
