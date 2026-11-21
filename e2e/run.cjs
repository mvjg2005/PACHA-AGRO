/**
 * Pruebas de extremo a extremo de AgroBolivia (Playwright, Chromium).
 * Requisitos: backend corriendo con el frontend compilado en http://localhost:8000 y SEED_DEMO=true.
 * Uso: node e2e/run.cjs [URL]
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.argv[2] || 'http://localhost:8000'
const ADMIN_PHONE = process.env.ADMIN_PHONE || '70000000'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin12345'
const OUT = path.join(__dirname, 'output')
fs.mkdirSync(OUT, { recursive: true })
const results = []

async function test(name, fn) {
  const t0 = Date.now()
  try { const info = await fn(); results.push({ name, ok: true, ms: Date.now() - t0, info }); console.log(`✔ ${name}${info ? ' — ' + info : ''}`) }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, error: e.message }); console.log(`✘ ${name}\n   ${e.message.split('\n')[0]}`) }
}
const assert = (c, m) => { if (!c) throw new Error(m) }

;(async () => {
  const browser = await chromium.launch()
  // Los service workers se bloquean por defecto: sus peticiones no pasan por page.route (las pruebas que simulan
  // respuestas dejarían de funcionar). La prueba de modo sin conexión los activa explícitamente.
  const phone = { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' }
  const newPage = async (opts = phone) => {
    const { fresh, ...rest } = opts
    const ctx = await browser.newContext({ serviceWorkers: 'block', ...rest })
    // La bienvenida aparece solo en la primera visita; la prueba de bienvenida usa `fresh`.
    if (!fresh) await ctx.addInitScript(() => localStorage.setItem('agb_onboarded', '1'))
    const p = await ctx.newPage()
    p.errors = []
    p.on('pageerror', e => p.errors.push(e.message))
    return p
  }
  const btn = (p, name) => p.getByRole('button', { name }).first()
  // Campo por el texto exacto de su etiqueta (los selectores incluyen el texto de sus opciones en el nombre accesible)
  const field = (p, label) => p.locator(`label:has(> span:text-is("${label}")) :is(input, select, textarea)`)
  const login = async (p, phoneNo) => {
    await p.goto(`${BASE}/#/ingresar`)
    await p.fill('input[autocomplete=tel]', phoneNo); await p.fill('input[type=password]', 'demo1234')
    await btn(p, /^Ingresar$/).click(); await p.waitForSelector('text=Comunidad Demo Challapata')
  }

  await test('Inicio: acceso a siembra y clima visible sin desplazarse (360×740)', async () => {
    const p = await newPage()
    await p.goto(BASE)
    const navTop = (await p.locator('.site-nav-mobile').boundingBox()).y
    for (const t of ['Consultar condiciones de siembra', 'Elegir municipio']) {
      const b = await p.getByRole('link', { name: new RegExp(t.replace(/[?¿]/g, '.')) }).first().boundingBox()
      assert(b && b.y + b.height * 0.5 < navTop, `"${t}" no es visible sobre la navegación`)
    }
    await p.screenshot({ path: `${OUT}/inicio-360.png` })
    assert(p.errors.length === 0, p.errors.join(';'))
  })

  await test('Siembra: consulta completa en 7 toques, sin registro', async () => {
    const p = await newPage()
    await p.goto(BASE)
    const t0 = Date.now(); let taps = 0
    const tap = async (l) => { await l.click(); taps++ }
    await tap(p.getByRole('link', { name: /Consultar condiciones de siembra/ }).first())
    for (const t of [/^Oruro$/, /Challapata/, /Quinua/, /Pandela/, /Sí, está húmedo/, /Depende de la lluvia/]) await tap(btn(p, t))
    await p.getByTestId('main-action').waitFor()
    const action = await p.getByTestId('main-action').boundingBox()
    const factors = await p.getByRole('heading', { name: 'Todos los factores' }).boundingBox()
    assert(action.y < factors.y, 'la acción principal debe preceder a los criterios')
    const status = await p.locator('section[aria-live]').first().innerText()
    assert(/favorables|precaución|desfavorables|insuficiente/.test(status), 'sin semáforo')
    assert(await p.locator('text=Fuente:').count() > 0, 'no muestra fuentes')
    assert(await p.getByTestId('sim-badge').count() === 0, 'consulta real no debe tener la etiqueta "Caso simulado"')
    const msg = decodeURIComponent((await p.getByTestId('share-whatsapp').getAttribute('href')).split('text=')[1])
    assert(msg.includes('Quinua en Challapata') && msg.includes('Orientación experimental'), 'mensaje incompleto: ' + msg)
    assert(!msg.includes('Caso simulado'), 'mensaje real no debe decir "Caso simulado"')
    await p.screenshot({ path: `${OUT}/siembra-resultado.png`, fullPage: true })
    return `${taps} toques, ${(Date.now() - t0) / 1000}s automatizado; resultado: ${status.split('\n').find(x => x.trim().length > 3)}`
  })

  await test('Siembra: cultivo sin reglas muestra "Información insuficiente" sin recomendar', async () => {
    const p = await newPage()
    await p.goto(`${BASE}/#/sembrar`)
    for (const t of [/^Oruro$/, /Challapata/, /Haba/, /Usnayo/, /Sí, está húmedo/, /Tengo riego/]) await btn(p, t).click()
    await p.waitForSelector('text=Información insuficiente')
    assert(await p.locator('text=Todos los factores').count() === 0, 'no debería mostrar criterios')
    assert(await p.locator('text=Faltan datos').count() === 1, 'debe decir que faltan datos')
  })

  await test('Clima: sin pronóstico se explica el problema y se puede reintentar', async () => {
    const p = await newPage()
    await p.route('**/api/weather?*', async route => {
      const r = await route.fetch(); const j = await r.json()
      j.forecast = { ...j.forecast, available: false, daily: [], error: 'Prueba: servicio de pronóstico caído.' }
      await route.fulfill({ response: r, json: j })
    })
    await p.addInitScript(() => localStorage.setItem('agb_municipality', 'or-oruro'))
    await p.goto(`${BASE}/#/clima`)
    await p.waitForSelector('text=No hay pronóstico disponible')
    assert(await btn(p, /Intentar de nuevo/).isVisible(), 'falta reintento')
    assert(await btn(p, /Ver demostración/).count() === 0, 'se ofrece clima simulado')
  })

  await test('Clima: error de red muestra mensaje comprensible y botón de reintento', async () => {
    const p = await newPage()
    await p.addInitScript(() => localStorage.setItem('agb_municipality', 'or-oruro'))
    await p.route('**/api/weather*', r => r.abort())
    await p.goto(`${BASE}/#/clima`)
    await p.waitForSelector('text=No hay conexión con AgroBolivia')
    assert(await btn(p, /Intentar de nuevo/).isVisible(), 'sin reintento')
  })

  await test('Registro: valida datos y crea cuenta', async () => {
    const p = await newPage()
    await p.goto(`${BASE}/#/registro`)
    await p.fill('input[autocomplete=name]', 'Ana Choque'); await p.fill('input[autocomplete=tel]', '123'); await p.fill('input[type=password]', 'clave123')
    await btn(p, /Crear cuenta/).click()
    await p.waitForSelector('text=celular de Bolivia')
    const num = '6' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0')
    await p.fill('input[autocomplete=tel]', num); await btn(p, /Crear cuenta/).click()
    await p.waitForSelector('text=Aún no pertenece a ninguna comunidad')
    return `cuenta ${num}`
  })

  await test('Permisos: la agricultora NO puede convocar reuniones ni ver solicitudes', async () => {
    const p = await newPage()
    await login(p, '70000002')
    await p.click('text=Comunidad Demo Challapata'); await p.waitForSelector('text=Planificación de siembra')
    assert(await p.locator('text=Convocar reunión').count() === 0, 've "Convocar reunión"')
    assert(await p.locator('text=Solicitudes').count() === 0, 've "Solicitudes"')
    const r = await p.evaluate(async () => (await fetch('/api/communities/1/meetings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('agb_token') }, body: JSON.stringify({ title: 'Falsa', place: 'x lugar', starts_at: '2030-01-01T10:00:00' }) })).status)
    assert(r === 403, `API devolvió ${r}`)
    await btn(p, /^Sí$/).click(); await p.waitForSelector('text=Respuesta guardada')
  })

  await test('Reuniones: el representante convoca una reunión y envía recordatorio (simulado)', async () => {
    const p = await newPage()
    await login(p, '70000001')
    await p.click('text=Comunidad Demo Challapata'); await btn(p, /Convocar reunión/).click()
    const d = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
    await p.fill('input[placeholder^="Ej. Planificar"]', 'Prueba e2e de reunión'); await p.fill('input[type=date]', d)
    await p.fill('input[placeholder^="Ej. Sede"]', 'Cancha comunal'); await btn(p, /Guardar/).click()
    await p.waitForSelector('text=Prueba e2e de reunión')
    await p.locator('div', { has: p.locator('text=Prueba e2e de reunión') }).getByRole('button', { name: /Recordar/ }).last().click()
    await p.waitForSelector('text=SIMULADOR (no se enviaron mensajes reales)')
  })

  await test('Reportes: observación queda marcada como comunitaria, no oficial', async () => {
    const p = await newPage()
    await login(p, '70000002')
    await p.click('text=Comunidad Demo Challapata'); await p.getByRole('tab', { name: /Reportes/ }).click()
    await btn(p, /Granizo/).click(); await btn(p, /Enviar reporte/).click()
    await p.waitForSelector('text=No es un aviso oficial')
  })

  await test('WhatsApp: simulador responde y el botón Enviar es visible', async () => {
    const p = await newPage()
    await p.goto(`${BASE}/#/whatsapp`)
    await p.locator('#chat').waitFor()  // la pantalla se carga de forma diferida
    assert(await p.locator('text=no está conectado').count() > 0, 'no avisa que es simulación')
    await p.fill('#chat', '¿Cuándo puedo sembrar quinua en Challapata?')
    const send = btn(p, /^Enviar$/); const b = await send.boundingBox()
    assert(b && b.x + b.width <= 360, 'Enviar fuera de pantalla')
    await send.click(); await p.waitForSelector('text=Quinua en Challapata')
  })

  await test('Aprender: lección con pregunta y fuentes', async () => {
    const p = await newPage()
    await p.goto(`${BASE}/#/aprender/heladas`)
    await btn(p, /despejada/).click(); await p.waitForSelector('text=¡Correcto!')
    assert(await p.locator('text=Fuentes:').count() === 1, 'sin fuentes')
  })

  await test('Adaptación móvil: sin desplazamiento horizontal en todas las pantallas (320 px)', async () => {
    const p = await newPage({ viewport: { width: 320, height: 640 }, isMobile: true })
    const bad = []
    for (const r of ['', 'sembrar', 'sembrar/comparar', 'clima', 'comunidad', 'whatsapp', 'aprender', 'aprender/granizo', 'aprender/biblioteca', 'aprender/biblioteca/ficha-cultivo-quinua', 'avisos', 'cobertura', 'privacidad', 'terminos', 'ingresar', 'registro']) {
      await p.goto(`${BASE}/#/${r}`); await p.waitForTimeout(600)
      const w = await p.evaluate(() => document.documentElement.scrollWidth)
      if (w > 320) bad.push(`${r || 'inicio'}:${w}`)
    }
    assert(bad.length === 0, `desborde en ${bad.join(', ')}`)
  })

  await test('Comparador: consulta real y formato adaptable en móvil, tableta y escritorio', async () => {
    for (const width of [360, 768, 1440]) {
      const p = await newPage({ viewport: { width, height: 900 } })
      await p.addInitScript(() => localStorage.setItem('agb_municipality', 'or-challapata'))
      await p.goto(BASE)
      assert(await p.getByRole('link', { name: 'Escritorio', exact: true }).count() === 0, 'la portada ofrece un modo de dispositivo')
      await p.getByRole('link', { name: /Comparar condiciones/ }).first().click()
      await p.getByText('Challapata, Oruro', { exact: true }).waitFor()
      const requests = []
      p.on('request', req => {
        if (req.url().endsWith('/api/recommendations') && req.method() === 'POST') requests.push(req.postDataJSON())
      })
      await btn(p, 'Comparar escenarios').click()
      await p.getByRole('table').waitFor()
      assert(requests.length === 2 && requests.every(r => r.mode === 'real' && r.municipality_id === 'or-challapata'), 'la consulta no usó el municipio y modo seleccionados')
      const cards = await p.locator('.compare-result').all()
      const [a, b] = await Promise.all(cards.map(card => card.boundingBox()))
      assert(width === 360 ? b.y > a.y : b.x > a.x, `distribución incorrecta a ${width}px`)
      assert(await p.evaluate(() => document.documentElement.scrollWidth) === width, `desborde a ${width}px`)
      await p.context().close()
    }
  })

  await test('Conexión lenta (≈400 kbps, 400 ms de latencia): inicio usable', async () => {
    const ctx = await browser.newContext(phone)
    await ctx.addInitScript(() => localStorage.setItem('agb_onboarded', '1'))
    const p = await ctx.newPage()
    const cdp = await ctx.newCDPSession(p)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 })
    let bytes = 0
    p.on('response', async r => { const l = Number(r.headers()['content-length'] || 0); bytes += l })
    const t0 = Date.now()
    await p.goto(BASE); await p.getByRole('link', { name: /Consultar condiciones de siembra/ }).first().waitFor()
    const ms = Date.now() - t0
    assert(ms < 8000, `tardó ${ms} ms`)
    return `acciones visibles en ${(ms / 1000).toFixed(1)} s`
  })

  // ---- Funciones adaptadas de PACHAAGRO ----

  await test('Avisos: públicos sin cuenta, filtrados por zona y marcados como no oficiales', async () => {
    const p = await newPage()
    await p.addInitScript(() => localStorage.setItem('agb_municipality', 'or-challapata'))
    await p.goto(`${BASE}/#/avisos`)
    await p.locator('main').getByText('Ejemplo: noches frías en el altiplano orureño').waitFor()
    assert(await p.locator('main').getByText('feria de semillas nativas en Cochabamba').count() === 0, 'muestra avisos de otra zona en "Mi zona"')
    assert(await p.getByText('no avisos oficiales', { exact: false }).count() > 0, 'falta aclaración de no oficial')
    await p.getByRole('tab', { name: /Todos/ }).click()
    await p.locator('main').getByText('feria de semillas nativas en Cochabamba').waitFor()
    await p.screenshot({ path: `${OUT}/avisos.png`, fullPage: true })
  })

  await test('Cultivos de interés: al marcar papa aparecen los avisos de papa', async () => {
    const p = await newPage()
    await login(p, '70000002')
    await p.goto(`${BASE}/#/perfil`)
    const papa = p.getByRole('button', { name: /Papa/ })
    if ((await papa.getAttribute('aria-pressed')) !== 'true') { await papa.click(); await p.getByText('Guardado').waitFor() }
    await p.goto(`${BASE}/#/avisos`)
    await p.locator('main').getByText('Revisión preventiva de riego antes de la campaña de papa').waitFor()
    await p.goto(`${BASE}/#/perfil`); await papa.click(); await p.getByText('Guardado').waitFor()  // deja el estado como estaba
  })

  await test('Editor: el administrador nombra editor y este publica un aviso segmentado', async () => {
    const admin = await newPage()
    await admin.goto(`${BASE}/#/ingresar`)
    await admin.fill('input[autocomplete=tel]', ADMIN_PHONE); await admin.fill('input[type=password]', ADMIN_PASSWORD)
    await btn(admin, /^Ingresar$/).click(); await admin.waitForURL(/comunidad/)
    const ed = await newPage()
    const num = '6' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0')
    const potosi = `Prueba e2e ${num}: aviso para Potosí`  // único por corrida
    await ed.goto(`${BASE}/#/registro`)
    await ed.fill('input[autocomplete=name]', 'Elena Editora'); await ed.fill('input[autocomplete=tel]', num); await ed.fill('input[type=password]', 'clave123')
    await btn(ed, /Crear cuenta/).click(); await ed.waitForURL(/comunidad/)
    assert((await ed.evaluate(async () => (await fetch('/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('agb_token') }, body: JSON.stringify({ title: 'Intento sin permiso', summary: 'No debería publicarse' }) })).status)) === 403, 'publicó sin ser editor')
    await admin.goto(`${BASE}/#/admin`)
    await admin.locator('li', { hasText: 'Elena Editora' }).getByRole('button', { name: 'Hacer editor' }).click()
    await admin.locator('li', { hasText: 'Elena Editora' }).getByRole('button', { name: 'Quitar editor' }).waitFor()
    await ed.reload(); await ed.goto(`${BASE}/#/admin`)
    await ed.getByText('Usted es editor de contenido.').waitFor()
    assert(await ed.getByText('Comunidades por aprobar').count() === 0, 'el editor ve secciones de administrador')
    await field(ed, 'Título').fill(potosi)
    await field(ed, 'Resumen (lo que llega por WhatsApp)').fill('Aviso de prueba solo para el departamento de Potosí.')
    await field(ed, '¿Para quién?').selectOption('departamento')
    await field(ed, 'Departamento').selectOption('potosi')
    await btn(ed, /Publicar aviso/).click(); await ed.getByText('Aviso publicado').waitFor()
    await ed.locator('div', { hasText: potosi }).getByRole('button', { name: /Enviar por WhatsApp/ }).last().click()
    await ed.getByText('SIMULADOR').waitFor()
    const pub = await newPage()
    await pub.addInitScript(() => localStorage.setItem('agb_municipality', 'pt-uyuni'))
    await pub.goto(`${BASE}/#/avisos`); await pub.locator('main').getByText(potosi).waitFor()
    const other = await newPage()
    await other.addInitScript(() => localStorage.setItem('agb_municipality', 'or-oruro'))
    await other.goto(`${BASE}/#/avisos`); await other.locator('main').getByText('Actualice sus cultivos de interés').waitFor()
    assert(await other.locator('main').getByText(potosi).count() === 0, 'aviso de Potosí visible en Oruro')
  })

  await test('Biblioteca: filtros por cultivo y tipo, detalle con fuente', async () => {
    const p = await newPage()
    await p.goto(`${BASE}/#/aprender/biblioteca`)
    await p.getByText('de 8 recursos').waitFor()
    await field(p, 'Cultivo').selectOption('papa')
    assert(await p.getByText('Ficha de cultivo: quinua').count() === 0, 'filtro de cultivo no aplica')
    await field(p, 'Cultivo').selectOption('quinua'); await field(p, 'Tipo').selectOption('cultivo')
    await p.getByText('Ficha de cultivo: quinua').click()
    await p.getByRole('heading', { name: 'Aspectos generales' }).waitFor()
    assert(await p.getByText('Fuente:').count() === 1, 'sin nota de fuente')
  })

  await test('Cobertura, privacidad y términos', async () => {
    const p = await newPage()
    await p.goto(`${BASE}/#/cobertura`)
    await p.getByText('Quinua: disponible').first().waitFor()
    const oruro = await p.locator('li', { has: p.getByRole('heading', { name: 'Oruro' }) }).innerText()
    assert(oruro.includes('Quinua: disponible') && !oruro.includes('Papa'), 'Oruro: estado de cultivos incorrecto: ' + oruro)
    const beni = await p.locator('li', { has: p.getByRole('heading', { name: 'Beni' }) }).innerText()
    assert(beni.includes('Aún sin reglas'), 'Beni no debería tener reglas')
    await btn(p, /Ver mapa de municipios/).click(); await p.locator('.leaflet-container').waitFor()
    await p.goto(`${BASE}/#/privacidad`); await p.getByRole('heading', { name: 'Qué datos pedimos' }).waitFor()
    await p.goto(`${BASE}/#/terminos`); await p.getByRole('heading', { name: 'Avisos no oficiales' }).waitFor()
  })

  // ---- Mejoras para uso real ----

  await test('GPS: «Usar mi ubicación» da el clima del punto exacto y el municipio más cercano', async () => {
    const p = await newPage({ ...phone, geolocation: { latitude: -18.95, longitude: -66.70 }, permissions: ['geolocation'] })
    const weatherReqs = []
    p.on('request', r => { if (r.url().includes('/api/weather?')) weatherReqs.push(r.url()) })
    await p.goto(`${BASE}/#/clima`)
    await p.getByTestId('gps-button').click()
    await p.getByText('Cerca de Challapata').waitFor()
    await p.getByRole('heading', { name: /Avisos oficiales/ }).waitFor()
    assert(weatherReqs.some(u => u.includes('lat=-18.95') && u.includes('lon=-66.7')), 'el clima no usó las coordenadas: ' + weatherReqs.join(' '))
    // Asistente de siembra: el GPS salta directo a elegir cultivo y envía las coordenadas
    const recs = []
    p.on('request', r => { if (r.url().endsWith('/api/recommendations')) recs.push(r.postDataJSON()) })
    await p.goto(`${BASE}/#/sembrar`)
    await p.getByTestId('gps-button').click()
    await p.getByText('¿Qué cultivo quiere sembrar?').waitFor()
    for (const t of [/Quinua/, /Pandela/, /Sí, está húmedo/, /Depende de la lluvia/]) await btn(p, t).click()
    await p.getByTestId('main-action').waitFor()
    assert(recs[0].lat === -18.95 && recs[0].lon === -66.7 && !recs[0].municipality_id, 'la recomendación no usó GPS')
    // Elegir un municipio a mano borra el GPS
    await p.goto(`${BASE}/#/clima`); await btn(p, /Cambiar/).click(); await btn(p, /^Oruro ≈/).click()  // abre en el departamento actual
    await p.getByText('Oruro, Oruro').waitFor()
    assert(await p.evaluate(() => localStorage.getItem('agb_gps')) === null, 'el GPS no se borró al elegir otro municipio')
  })

  await test('GPS: sin permiso se explica y se puede elegir de la lista', async () => {
    const p = await newPage({ ...phone, permissions: [] })
    await p.goto(`${BASE}/#/clima`)
    await p.getByTestId('gps-button').click()
    await p.getByText('No dio permiso para usar su ubicación').waitFor()
    assert(await btn(p, /^Oruro$/).isVisible(), 'no se puede elegir de la lista')
  })

  await test('Sin conexión: la app abre y muestra el último clima guardado con aviso', async () => {
    const ctx = await browser.newContext({ ...phone, serviceWorkers: 'allow' })
    await ctx.addInitScript(() => { localStorage.setItem('agb_municipality', 'or-oruro'); localStorage.setItem('agb_onboarded', '1') })
    const p = await ctx.newPage()
    await p.goto(`${BASE}/#/clima`)
    await p.evaluate(() => navigator.serviceWorker.ready)
    await p.reload(); await p.getByRole('heading', { name: /Avisos oficiales/ }).waitFor()  // ahora el service worker controla la página y guarda el clima
    await ctx.setOffline(true)
    await p.reload(); await p.getByRole('heading', { name: /Avisos oficiales/ }).waitFor()
    await p.getByTestId('offline-banner').waitFor()
    const banner = await p.getByTestId('offline-banner').innerText()
    assert(banner.includes('Mostrando datos guardados'), 'aviso incorrecto: ' + banner)
    await p.screenshot({ path: `${OUT}/sin-conexion.png` })
    await ctx.setOffline(false); await ctx.close()
    return banner.trim()
  })

  await test('Pronóstico desactualizado: se dice claramente y con su hora', async () => {
    const p = await newPage()
    await p.addInitScript(() => localStorage.setItem('agb_municipality', 'or-oruro'))
    await p.route('**/api/weather?*', async route => {
      const r = await route.fetch(); const j = await r.json()
      if (!j.forecast.available) j.forecast = { ...j.forecast, available: true, daily: [{ date: new Date().toISOString().slice(0, 10), tmin: 1, tmax: 15, precip_mm: 0, precip_prob: 5, weather_code: 1, storm: false }], current_temp: 8 }
      j.forecast.extra = { ...(j.forecast.extra || {}), stale: true, stale_fetched_at: '2026-11-21T08:00Z', error_now: 'límite' }
      await route.fulfill({ response: r, json: j })
    })
    await p.goto(`${BASE}/#/clima`)
    const t = await p.getByTestId('stale-forecast').innerText()
    assert(t.includes('No pudimos actualizar el pronóstico'), t)
  })

  await test('Cuenta: cambiar clave y eliminar la cuenta', async () => {
    const p = await newPage()
    const num = '6' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0')
    await p.goto(`${BASE}/#/registro`)
    await p.fill('input[autocomplete=name]', 'Rosa Prueba'); await p.fill('input[autocomplete=tel]', num); await p.fill('input[type=password]', 'clave123')
    await btn(p, /Crear cuenta/).click(); await p.waitForURL(/comunidad/)
    await p.goto(`${BASE}/#/perfil`)
    await field(p, 'Clave actual').fill('clave123'); await field(p, 'Clave nueva (mínimo 8)').fill('otraClave9'); await field(p, 'Repita la clave nueva').fill('otraClave9')
    await btn(p, /Guardar clave nueva/).click(); await p.getByText('Clave cambiada').waitFor()
    await btn(p, /Eliminar mi cuenta/).click()
    await field(p, 'Escriba su clave para confirmar').fill('otraClave9')
    await p.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await p.waitForURL(u => u.hash === '#/' || u.hash === '')
    const r = await p.evaluate(async n => (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: n, password: 'otraClave9' }) })).status, num)
    assert(r === 401, 'la cuenta eliminada todavía puede ingresar')
  })

  await test('Clave olvidada: el administrador da una clave temporal y la persona debe cambiarla', async () => {
    const u = await newPage()
    const num = '6' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0')
    await u.goto(`${BASE}/#/registro`)
    await u.fill('input[autocomplete=name]', 'Pedro Olvido'); await u.fill('input[autocomplete=tel]', num); await u.fill('input[type=password]', 'clave123')
    await btn(u, /Crear cuenta/).click(); await u.waitForURL(/comunidad/)
    const admin = await newPage()
    await admin.goto(`${BASE}/#/ingresar`)
    await admin.fill('input[autocomplete=tel]', ADMIN_PHONE); await admin.fill('input[type=password]', ADMIN_PASSWORD)
    await btn(admin, /^Ingresar$/).click(); await admin.waitForURL(/comunidad/)
    await admin.goto(`${BASE}/#/admin`)
    admin.once('dialog', d => d.accept())
    await admin.locator('li', { hasText: 'Pedro Olvido' }).getByRole('button', { name: 'Clave temporal' }).click()
    const temp = (await admin.getByTestId('temp-password').innerText()).match(/: (\S+)$/)[1]
    const p = await newPage()
    await p.goto(`${BASE}/#/ingresar`)
    await p.fill('input[autocomplete=tel]', num); await p.fill('input[type=password]', temp)
    await btn(p, /^Ingresar$/).click()
    await p.getByText('Cree su clave nueva').waitFor()
    await p.goto(`${BASE}/#/comunidad`); await p.getByText('Cree su clave nueva').waitFor()  // no puede saltarse el paso
    await field(p, 'Clave temporal').fill(temp); await field(p, 'Clave nueva (mínimo 8)').fill('nuevaClave7'); await field(p, 'Repita la clave nueva').fill('nuevaClave7')
    await btn(p, /Guardar clave nueva/).click()
    await p.getByText('Aún no pertenece a ninguna comunidad').waitFor()
  })

  await test('Portada estilo revista: artículos recomendados con categoría y enlace (móvil y escritorio)', async () => {
    for (const [width, cols] of [[360, 1], [1280, 3]]) {
      const p = await newPage({ viewport: { width, height: 900 } })
      await p.goto(BASE)
      await p.getByRole('heading', { name: 'Artículos recomendados' }).waitFor()
      const cards = p.getByTestId('article-card')
      await cards.first().waitFor()
      assert(await cards.count() === 6, `se esperaban 6 artículos, hay ${await cards.count()}`)
      const boxes = await Promise.all((await cards.all()).slice(0, 3).map(c => c.boundingBox()))
      const perRow = boxes.filter(b => Math.abs(b.y - boxes[0].y) < 2).length
      assert(perRow === cols, `a ${width}px hay ${perRow} por fila (esperado ${cols})`)
      assert(await p.evaluate(() => document.documentElement.scrollWidth) === width, `desborde a ${width}px`)
      if (width === 1280) {
        const first = cards.first()
        const title = (await first.locator('.article-title').innerText()).trim()
        assert((await first.locator('.article-band').innerText()).trim().length > 0, 'sin franja de categoría')
        await first.click()
        await p.getByRole('heading', { name: title }).waitFor()
      }
      await p.context().close()
    }
  })

  await test('Portada: acceso rápido por cultivo e indicadores con fuente', async () => {
    const p = await newPage({ viewport: { width: 1280, height: 900 } })
    await p.addInitScript(() => localStorage.setItem('agb_municipality', 'or-challapata'))
    await p.goto(BASE)
    const ind = p.getByTestId('indicators')
    await ind.waitFor({ timeout: 60000 })
    const t = await ind.innerText()
    assert(/NASA POWER|Open-Meteo/.test(t), 'los indicadores no muestran su fuente')
    assert(!/68 ?%|8\.5 hrs|3\.8 mm/.test(t), 'hay cifras fijas de ejemplo')
    await p.locator('.sow-card').getByRole('link', { name: 'Papa' }).click()
    await p.getByText('Consulta para papa').waitFor()
    await btn(p, /^La Paz$/).click(); await btn(p, /El Alto/).click()
    await p.getByText('¿Qué variedad de papa va a usar?').waitFor()  // se saltó la pregunta del cultivo
    await btn(p, /Atrás/).click()
    await p.getByText('¿Qué cultivo quiere sembrar?').waitFor()     // y se puede volver a ella
  })

  await test('Asesoría: respuesta, técnicos con WhatsApp y recursos (sin cuenta)', async () => {
    const p = await newPage()
    await p.addInitScript(() => localStorage.setItem('agb_municipality', 'or-challapata'))
    await p.goto(`${BASE}/#/asesoria/quinua`)
    await p.getByTestId('resource-card').first().waitFor()
    assert(await p.getByTestId('resource-card').count() >= 12, 'faltan recursos del directorio')
    await p.locator('textarea').fill('¿Va a caer helada? Quiero sembrar quinua')
    await btn(p, /^Preguntar$/).click()
    await p.getByTestId('advice-result').waitFor({ timeout: 60000 })
    const mode = await p.getByTestId('advice-mode').innerText()
    assert(/IA|básica/i.test(mode), 'no indica el modo de respuesta')
    const card = p.getByTestId('expert-card').first()
    assert((await card.innerText()).includes('Técnico de ejemplo'), 'no recomienda al técnico de la zona')
    const wa = await card.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')
    assert(wa.startsWith('https://wa.me/59170000003?text='), 'enlace de WhatsApp incorrecto: ' + wa)
    const sites = await p.getByTestId('advice-result').getByTestId('resource-card').allInnerTexts()
    assert(sites.some(t => t.includes('SENAMHI')), 'falta SENAMHI para una consulta de clima')
    // Desde el resultado de siembra se llega a la Asesoría con el cultivo
    await p.goto(`${BASE}/#/sembrar`)
    for (const t of [/^Oruro$/, /Challapata/, /Quinua/, /Pandela/, /Sí, está húmedo/, /Depende de la lluvia/]) await btn(p, t).click()
    await p.getByTestId('talk-expert').click()
    await p.waitForURL(/#\/asesoria\/quinua$/)
    assert(await p.evaluate(() => !document.body.innerText.includes('Consulte a su técnico')), 'quedó la advertencia antigua')
  })

  await test('Bienvenida: primera visita en 4 pasos, cultivos y municipio guardados', async () => {
    const p = await newPage({ ...phone, fresh: true })
    await p.goto(BASE)
    await p.getByTestId('onboarding').waitFor()
    await btn(p, /^Siguiente$/).click()
    await p.getByRole('button', { name: 'Quinua' }).click(); await p.getByRole('button', { name: 'Papa' }).click()
    await btn(p, /^Siguiente$/).click()
    await p.getByRole('radio', { name: /parcelas de cultivo/ }).click(); await btn(p, /^Siguiente$/).click()
    await p.getByTestId('onboarding').locator('select').selectOption('or-challapata')
    await btn(p, /^Empezar$/).click()
    await p.getByTestId('my-crops').waitFor()
    const txt = await p.getByTestId('my-crops').innerText()
    assert(txt.includes('Quinua') && txt.includes('Papa'), 'no muestra los cultivos elegidos')
    await p.reload(); await p.waitForTimeout(500)
    assert(!(await p.getByTestId('onboarding').count()), 'la bienvenida vuelve a aparecer')
    assert(p.errors.length === 0, p.errors.join(';'))
  })

  await test('Mi campo: calculadoras (ganancia, precio sin pérdida, mezcla) y recientes', async () => {
    const p = await newPage()
    await p.goto(`${BASE}/#/campo`)
    await p.getByTestId('diagnose-cta').waitFor()
    await p.getByRole('link', { name: /Ganancia estimada/ }).click()
    await p.getByLabel('Cosecha esperada', { exact: true }).fill('40')
    await p.getByLabel('Precio de venta', { exact: true }).fill('250')
    await p.getByLabel('Gastos totales', { exact: true }).fill('6000')
    await btn(p, /^Calcular$/).click()
    assert((await p.getByTestId('calc-result').innerText()).includes('4.000,00'), 'ganancia incorrecta (40 qq × 250 − 6000)')
    await p.getByTestId('calc-recent').waitFor()
    await p.goto(`${BASE}/#/campo/calculadora/precio/c=6000&y=1840`)
    await btn(p, /^Calcular$/).click()
    assert((await p.getByTestId('calc-result').innerText()).includes('150,00 por quintal'), 'precio sin pérdida incorrecto')
    await p.goto(`${BASE}/#/campo/calculadora/mezcla`)
    await p.getByLabel('Dosis de la etiqueta por hectárea', { exact: true }).fill('1')
    await p.getByLabel('Agua por hectárea (de la etiqueta)', { exact: true }).fill('200')
    await p.getByLabel('Superficie a aplicar', { exact: true }).fill('0,5')
    await btn(p, /^Calcular$/).click()
    const mix = await p.getByTestId('calc-result').innerText()
    assert(mix.includes('100 ml por mochila') && mix.includes('5 mochilas'), 'mezcla incorrecta: ' + mix)
    assert(await p.evaluate(() => document.documentElement.scrollWidth) <= 360, 'desborde horizontal')
    assert(p.errors.length === 0, p.errors.join(';'))
  })

  await test('Revisar una planta: foto (no se guarda), guía por síntomas, técnicos y fichas con audio', async () => {
    const p = await newPage()
    await p.addInitScript(() => localStorage.setItem('agb_municipality', 'or-challapata'))
    await p.goto(`${BASE}/#/campo`)
    const photo = path.join(OUT, 'foto-prueba.jpg')
    await p.screenshot({ path: photo, type: 'jpeg', quality: 80 })
    await p.goto(`${BASE}/#/campo/diagnostico`)
    await p.getByTestId('photo-input').setInputFiles(photo)
    await btn(p, /Ver posibles causas/).click()
    await p.getByTestId('diagnosis-result').waitFor({ timeout: 90000 })
    const out = await p.getByTestId('diagnosis-result').innerText()
    assert(/Guía por síntomas|Posibles causas/.test(out), 'sin resultado ni guía')
    assert(out.includes('PlantwisePlus') && out.includes('INIAF'), 'faltan recursos para identificar')
    assert(await p.getByTestId('expert-card').count() >= 1, 'no ofrece técnicos')
    await p.goto(`${BASE}/#/cultivos/papa`)
    await p.getByTestId('crop-sheet').waitFor()
    assert((await p.getByTestId('crop-sheet').innerText()).includes('Tizón tardío'), 'ficha sin problemas frecuentes')
    assert(await p.getByTestId('listen').count() >= 4, 'faltan botones de Escuchar')
    assert(p.errors.length === 0, p.errors.join(';'))
  })

  await test('Mis parcelas: crear, anotar gastos y cosecha, ver balance; privacidad entre cuentas', async () => {
    const p = await newPage()
    await p.goto(`${BASE}/#/campo/parcelas`)
    await p.getByRole('link', { name: 'Ingresar' }).first().waitFor()
    await login(p, '70000002')
    await p.goto(`${BASE}/#/campo/parcelas`)
    await p.waitForTimeout(800)
    if (await btn(p, /Agregar parcela/).count()) await btn(p, /Agregar parcela/).click()
    const form = p.getByTestId('plot-form')
    await form.getByLabel('Nombre de la parcela').fill('Parcela e2e')
    await form.getByLabel('Superficie', { exact: true }).fill('5000'); await form.getByLabel('Unidad de superficie').selectOption('m2')
    await btn(p, /Guardar parcela/).click()
    await p.getByTestId('plot-detail').waitFor()
    const rf = p.getByTestId('record-form')
    await field(p, 'Costo (Bs)').fill('450'); await btn(p, /Guardar en el cuaderno/).click()
    await p.getByTestId('record-list').waitFor()
    await field(p, 'Qué hizo').selectOption('cosecha'); await field(p, 'Cantidad').fill('10'); await field(p, 'Unidad').selectOption('qq')
    await btn(p, /Guardar en el cuaderno/).click()
    await p.waitForFunction(() => document.querySelector('[data-testid=plot-summary]').innerText.includes('10 qq'))
    const sum = await p.getByTestId('plot-summary').innerText()
    assert(sum.includes('450,00') && sum.includes('-450,00'), 'resumen incorrecto: ' + sum)
    assert((await p.locator('body').innerText()).includes('20 quintales por hectárea'), 'rendimiento por hectárea incorrecto')
    const url = p.url()
    const other = await newPage(); await login(other, '70000001')
    await other.goto(url); await other.getByRole('alert').waitFor()
    assert(!(await other.getByTestId('plot-detail').count()), 'otra cuenta puede ver la parcela')
    assert(p.errors.length === 0, p.errors.join(';'))
  })

  await test('Señas que se miden: saber local vs satélite, Pachagrama, confiabilidad y registro', async () => {
    const p = await newPage()
    await p.addInitScript(() => localStorage.setItem('agb_municipality', 'or-challapata'))
    await p.goto(`${BASE}/#/senas`)
    await p.getByTestId('two-knowledges').waitFor({ timeout: 90000 })
    await p.getByLabel('Campaña').selectOption('2015')   // El Niño 2015–2016
    await p.getByTestId('outcome-lluvia').waitFor({ timeout: 90000 })
    const rain = await p.getByTestId('outcome-lluvia').innerText()
    assert(/Año seco|Lluvia normal|Año lluvioso/.test(rain) && rain.includes('NASA POWER'), 'sin resultado medido: ' + rain)
    await p.getByTestId('pachagrama').locator('svg rect').first().waitFor({ timeout: 90000 })
    assert(await p.getByTestId('reliability').isVisible(), 'falta la sección de confiabilidad')
    assert(await p.getByTestId('sena-card').count() >= 6, 'faltan señas en el catálogo')
    // Registrar una seña de una campaña pasada
    const num = '6' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0')
    await p.goto(`${BASE}/#/registro`)
    await p.fill('input[autocomplete=name]', 'Prueba Señas'); await p.fill('input[autocomplete=tel]', num); await p.fill('input[type=password]', 'clave1234')
    await btn(p, /Crear cuenta/).click(); await p.waitForURL(/comunidad/)
    await p.goto(`${BASE}/#/senas`); await p.getByTestId('two-knowledges').waitFor({ timeout: 90000 })
    await p.getByTestId('sena-card').first().getByRole('button', { name: /Registré esta seña/ }).click()
    await p.getByTestId('sena-form').getByText('Pequeñas u opacas').click()
    await p.getByTestId('sena-form').locator('input[type=date]').fill('2026-06-24')
    await btn(p, /Guardar seña/).click()
    await p.getByText('Seña registrada').waitFor()
    await p.getByLabel('Campaña').selectOption('2025')
    await p.getByTestId('my-senas').waitFor({ timeout: 60000 })
    assert((await p.getByTestId('my-senas').innerText()).includes('Pequeñas u opacas'), 'no aparece la seña registrada')
    assert(await p.evaluate(() => document.documentElement.scrollWidth) <= 360, 'desborde horizontal')
    assert(p.errors.length === 0, p.errors.join(';'))
  })

  await browser.close()
  fs.writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify(results, null, 2))
  const failed = results.filter(r => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} pruebas e2e aprobadas`)
  process.exit(failed ? 1 : 0)
})()
