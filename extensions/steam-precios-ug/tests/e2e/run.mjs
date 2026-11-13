// Prueba de extremo a extremo: carga la extensión en Chrome, recorre la tienda
// real de Steam, el popup y los ajustes, simula errores de red y guarda
// capturas en tests/e2e/capturas/. Uso: npm run test:e2e
//
// Variables: CHROME_PATH (ejecutable), HEADFUL=1 (ver el navegador).
import { mkdir, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import { chromePath } from '../support/chrome.mjs'
import '../support/load-shared.mjs'

const { calc } = globalThis.UG
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SHOTS = join(ROOT, 'tests', 'e2e', 'capturas')
const PROFILE = join(tmpdir(), `ug-e2e-${Date.now()}`)
const STORE = 'https://store.steampowered.com'
const AXE = await readFile(join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')

await rm(SHOTS, { recursive: true, force: true })
await mkdir(SHOTS, { recursive: true })

// ---- Mini corredor ----------------------------------------------------------------

const results = []
async function step(name, fn) {
  const t0 = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - t0 })
    console.log(`  ✔ ${name} (${Date.now() - t0} ms)`)
  } catch (e) {
    results.push({ name, ok: false, error: e })
    console.log(`  ✖ ${name}\n      ${String(e?.message ?? e).split('\n').join('\n      ')}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- Navegador ----------------------------------------------------------------------

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: !process.env.HEADFUL,
  pipe: true,
  enableExtensions: true,
  userDataDir: PROFILE,
  defaultViewport: { width: 1280, height: 900 },
  args: ['--lang=es-ES', '--window-size=1280,900'],
})

const extensionErrors = []
const id = await browser.installExtension(ROOT)
const EXT = `chrome-extension://${id}`
const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith(EXT))
let worker = await swTarget.worker()
worker.on('console', (m) => m.type() === 'error' && extensionErrors.push(`[service worker] ${m.text()}`))

const sw = async (fn, ...args) => {
  try {
    return await worker.evaluate(fn, ...args)
  } catch (e) {
    // El service worker puede haberse dormido: se vuelve a buscar.
    const t = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith(EXT))
    worker = await t.worker()
    return worker.evaluate(fn, ...args)
  }
}

async function newPage({ width = 1280, height = 900 } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height })
  page.on('pageerror', (e) => {
    if (page.url().startsWith(EXT) || /chrome-extension:|UG\.|ug-/.test(e.stack ?? e.message)) extensionErrors.push(`[página ${page.url()}] ${e.message}`)
  })
  page.on('console', (m) => {
    const url = m.location()?.url ?? ''
    if (m.type() === 'error' && url.startsWith(EXT)) extensionErrors.push(`[consola ${url}] ${m.text()}`)
  })
  // Excepciones de cualquier contexto, también el mundo aislado del content script.
  const cdp = await page.createCDPSession()
  await cdp.send('Runtime.enable')
  cdp.on('Runtime.exceptionThrown', (e) => {
    const d = e.exceptionDetails
    const where = d.url ?? d.stackTrace?.callFrames?.[0]?.url ?? ''
    if (where.startsWith(EXT) || page.url().startsWith(EXT)) extensionErrors.push(`[excepción ${where}] ${d.exception?.description ?? d.text}`)
  })
  return page
}

// Contenido de los Shadow DOM de la extensión en la página.
const hostsText = (page) => page.$$eval('ug-extension-ui', (hosts) => hosts.map((h) => h.shadowRoot?.textContent ?? ''))

async function waitTickets(page, n) {
  await page.bringToFront()
  try {
    await page.waitForFunction(
      (n) => {
        const hosts = [...document.querySelectorAll('ug-extension-ui')].filter((h) => h.shadowRoot?.querySelector('.ug-ticket'))
        return hosts.length >= n && hosts.every((h) => !h.shadowRoot.querySelector('[aria-busy="true"]'))
      },
      { timeout: 30000, polling: 250 },
      n,
    )
  } catch (e) {
    const state = await page.$$eval('ug-extension-ui', (hs) => hs.map((h) => (h.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ').slice(-160)))
    throw new Error(`${e.message}\nURL: ${page.url()}\nTickets: ${JSON.stringify(state, null, 1)}`)
  }
}

async function shot(page, name, selector) {
  const path = join(SHOTS, `${name}.png`)
  if (selector) {
    const el = await page.$(selector)
    await el.scrollIntoView()
    await sleep(150)
    await el.screenshot({ path })
  } else await page.screenshot({ path })
  return path
}

async function resetStorage(extra = {}) {
  await sw(async (extra) => {
    await chrome.storage.local.clear()
    await chrome.storage.session.clear()
    await chrome.storage.local.set(extra)
    await syncStoreRule()
    await updateBadge()
  }, extra)
}

async function setSettings(patch) {
  await sw(async (patch) => {
    const s = await getSettings()
    await chrome.storage.local.set({ settings: { ...s, ...patch } })
    await syncStoreRule({ ...s, ...patch })
  }, patch)
}

async function axe(page, context) {
  await page.evaluate(AXE)
  const r = await page.evaluate(async (context) => {
    const res = await window.axe.run(context ?? document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return res.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)
  }, context)
  return r
}

// Edad para las fichas con verificación de edad.
async function steamCookies(page) {
  await page.setCookie(
    { name: 'birthtime', value: '315532801', domain: 'store.steampowered.com', path: '/' },
    { name: 'lastagecheckage', value: '1-January-1980', domain: 'store.steampowered.com', path: '/' },
    { name: 'wants_mature_content', value: '1', domain: 'store.steampowered.com', path: '/' },
    { name: 'Steam_Language', value: 'spanish', domain: 'store.steampowered.com', path: '/' },
  )
}

console.log(`\nExtensión cargada: ${id}\n`)

// =========================================================================================
// 1. Service worker y regla ?cc=ua
// =========================================================================================

await resetStorage()

await step('El service worker arranca con los ajustes por defecto y la regla ?cc=ua', async () => {
  const s = await sw(() => getSettings())
  assert.equal(s.storeInUah, true)
  assert.equal(s.p2pAds, 5)
  const rules = await sw(() => chrome.declarativeNetRequest.getDynamicRules())
  assert.ok(rules.length > 1, `reglas: ${rules.length}`)
})

await step('Las tasas se obtienen de Binance P2P y de la API de cambio', async () => {
  const r = await sw(() => getRates(true))
  assert.ok(r.p2p?.price > 10, `P2P: ${JSON.stringify(r.errors)}`)
  assert.ok(r.fx?.rates?.UAH > 10, `FX: ${JSON.stringify(r.errors)}`)
  assert.equal(r.p2p.stale, false)
})

// =========================================================================================
// 2. Ficha del juego
// =========================================================================================

const app = await newPage()
await steamCookies(app)
let rates

await step('La ficha sin ?cc=ua se redirige a ?cc=ua, sin bucles', async () => {
  const res = await app.goto(`${STORE}/app/1245620/`, { waitUntil: 'domcontentloaded' })
  assert.ok(res.ok(), `HTTP ${res.status()}`)
  const url = new URL(app.url())
  assert.equal(url.searchParams.get('cc'), 'ua', app.url())
  assert.ok(res.request().redirectChain().length <= 2, `redirecciones: ${res.request().redirectChain().length}`)
  const priceText = await app.$eval('.game_purchase_price, .discount_final_price', (el) => el.textContent)
  assert.match(priceText, /₴/)
})

await step('Hay un ticket por cada edición comprable', async () => {
  const editions = await app.$$eval('.game_area_purchase_game input[name="subid"], .game_area_purchase_game input[name="bundleid"]', (els) => els.length)
  assert.ok(editions >= 1, 'la ficha no tiene ediciones')
  await waitTickets(app, editions)
  const n = await app.$$eval('ug-extension-ui', (h) => h.filter((x) => x.shadowRoot?.querySelector('.ug-ticket')).length)
  assert.equal(n, editions)
})

await step('Las cifras del ticket coinciden con el cálculo (₴ → HK$ → USDT → Bs)', async () => {
  rates = await sw(() => getRates(false))
  const derived = calc.deriveRates({ fx: rates.fx.rates, p2p: rates.p2p.price, settings: rates.settings })
  const pageCents = await app.$eval('.game_area_purchase_game [data-price-final]', (el) => Number(el.getAttribute('data-price-final')))
  const c = calc.convertUah(pageCents / 100, derived)
  const [text] = await hostsText(app)
  for (const expected of [calc.formatUah(c.uah), calc.formatHkd(c.hkd), calc.formatUsdt(c.usdt), calc.formatVes(c.ves)]) {
    assert.ok(text.includes(expected), `falta «${expected}» en el ticket:\n${text.slice(0, 400)}`)
  }
  assert.ok(text.includes('Ukrainian Gang Extension'))
})

await step('La fuente Martian Mono carga dentro de la tienda', async () => {
  const faces = await app.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].filter((f) => f.family.includes('UG Martian Mono')).map((f) => f.status)
  })
  assert.ok(faces.includes('loaded'), `estados: ${faces.join(', ')}`)
})

await step('Captura: ticket en la ficha', async () => {
  await shot(app, '01-ficha-ticket', 'ug-extension-ui')
})

await step('«Lista UG» añade la edición a la lista y cambia de estado', async () => {
  const btn = await app.$('ug-extension-ui >>> .ug-btn[aria-pressed]')
  await btn.click()
  await app.waitForFunction(() => document.querySelector('ug-extension-ui').shadowRoot.querySelector('.ug-btn[aria-pressed]').getAttribute('aria-pressed') === 'true', { timeout: 5000 })
  const list = await sw(() => getList())
  assert.equal(list.length, 1)
  assert.equal(list[0].type, 'sub')
  assert.ok(list[0].name.length > 0)
  assert.ok(list[0].lastUah > 0)
  const badge = await sw(() => chrome.action.getBadgeText({}))
  assert.equal(badge, '1')
})

await step('Comparar regiones carga la tabla con Ucrania y las regiones elegidas', async () => {
  const summary = await app.$('ug-extension-ui >>> .ug-regions > summary')
  await summary.click()
  await app.waitForFunction(() => document.querySelector('ug-extension-ui').shadowRoot.querySelectorAll('.ug-table tbody tr').length >= 5, { timeout: 45000 })
  const rows = await app.evaluate(() => [...document.querySelector('ug-extension-ui').shadowRoot.querySelectorAll('.ug-table tbody tr')].map((r) => r.textContent))
  assert.ok(rows.some((r) => r.includes('Ucrania')), 'falta Ucrania')
  assert.ok(rows.some((r) => r.includes('Estados Unidos')), `falta Estados Unidos:\n${rows.join('\n')}`)
  const hint = await app.evaluate(() => document.querySelector('ug-extension-ui').shadowRoot.querySelector('.ug-regions__hint').textContent)
  assert.ok(/regiones|más barata|Desde/.test(hint), hint)
  await shot(app, '02-ficha-regiones', 'ug-extension-ui')
})

await step('Accesibilidad del ticket (axe, WCAG 2.2 AA)', async () => {
  const v = await axe(app, { include: [{ fromShadowDom: ['ug-extension-ui', '.ug-ticket'] }] })
  assert.deepEqual(v, [])
})

await step('Alto contraste de Windows: el ticket sigue teniendo bordes', async () => {
  await app.emulateMediaFeatures([{ name: 'forced-colors', value: 'active' }])
  await shot(app, '03-ficha-alto-contraste', 'ug-extension-ui')
  await app.emulateMediaFeatures([])
})

// =========================================================================================
// 3. Estados del ticket: descuento, sin datos, gratis, no disponible, error
// =========================================================================================

await step('Tienda sin ₴ (como con una VPN): el ticket sigue en grivnas desde la API', async () => {
  await setSettings({ storeInUah: false })
  await app.goto(`${STORE}/app/620/?cc=us`, { waitUntil: 'domcontentloaded' })
  assert.equal(new URL(app.url()).searchParams.get('cc'), 'us')
  await waitTickets(app, 1)
  const [text] = await hostsText(app)
  assert.match(text, /₴/)
  assert.match(text, /Bs/)
  await shot(app, '04-ficha-tienda-en-usd', 'ug-extension-ui')
})

await step('Estados: descuento, sin datos y gratis', async () => {
  const subs = await (async () => {
    await app.goto(`${STORE}/app/1245620/?cc=us`, { waitUntil: 'domcontentloaded' })
    await waitTickets(app, 3)
    return app.$$eval('.game_area_purchase_game input[name="subid"]', (els) => els.map((e) => Number(e.value)))
  })()
  assert.ok(subs.length >= 3, `ediciones: ${subs.length}`)
  const now = Date.now()
  await sw(
    async ({ subs, now }) => {
      await chrome.storage.session.set({
        [`price:ua:sub:${subs[0]}`]: { at: now, data: { status: 'priced', currency: 'UAH', initial: 499900, final: 299900, discountPercent: 40 } },
        [`price:ua:sub:${subs[1]}`]: { at: now, data: { status: 'unavailable' } },
        [`price:ua:sub:${subs[2]}`]: { at: now, data: { status: 'free' } },
        'price:ua:app:1245620': { at: now, data: { status: 'priced', currency: 'UAH', initial: 179900, final: 179900, discountPercent: 0 } },
      })
    },
    { subs, now },
  )
  await app.reload({ waitUntil: 'domcontentloaded' })
  await waitTickets(app, 3)
  const texts = await hostsText(app)
  assert.match(texts[0], /Descuento del 40/)
  assert.match(texts[0], /Precio normal/)
  assert.match(texts[1], /Sin precio de Ucrania/)
  assert.match(texts[2], /Gratis en Steam Ucrania/)
  const hosts = await app.$$('ug-extension-ui')
  for (const [i, name] of [[0, '05-estado-descuento'], [1, '06-estado-sin-datos'], [2, '07-estado-gratis']]) {
    await hosts[i].scrollIntoView()
    await hosts[i].screenshot({ path: join(SHOTS, `${name}.png`) })
  }
})

await step('Estado: no se vende en Ucrania', async () => {
  const subs = await app.$$eval('.game_area_purchase_game input[name="subid"]', (els) => els.map((e) => Number(e.value)))
  await sw(
    async ({ subs, now }) => {
      const set = { 'price:ua:app:1245620': { at: now, data: { status: 'unavailable' } } }
      for (const s of subs) set[`price:ua:sub:${s}`] = { at: now, data: { status: 'unavailable' } }
      await chrome.storage.session.set(set)
    },
    { subs, now: Date.now() },
  )
  await app.reload({ waitUntil: 'domcontentloaded' })
  await waitTickets(app, subs.length)
  const [text] = await hostsText(app)
  assert.match(text, /No se vende en Steam Ucrania/)
  await shot(app, '08-estado-no-disponible', 'ug-extension-ui')
})

await step('Estado: Steam no responde → error con «Reintentar» que funciona', async () => {
  await sw(() => chrome.storage.session.clear())
  const cdp = await swTarget.createCDPSession()
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*store.steampowered.com/api/*' }] })
  let blocked = true
  cdp.on('Fetch.requestPaused', (e) =>
    blocked ? cdp.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'InternetDisconnected' }) : cdp.send('Fetch.continueRequest', { requestId: e.requestId }),
  )
  await app.goto(`${STORE}/app/620/?cc=us`, { waitUntil: 'domcontentloaded' })
  await waitTickets(app, 1)
  let [text] = await hostsText(app)
  assert.match(text, /No se pudo obtener el precio en Ucrania/)
  await shot(app, '09-estado-error-steam', 'ug-extension-ui')
  blocked = false
  const retry = await app.$('ug-extension-ui >>> .ug-notice .ug-btn')
  await retry.click()
  await app.waitForFunction(() => /Bs/.test(document.querySelector('ug-extension-ui').shadowRoot.textContent), { timeout: 20000 })
  await cdp.send('Fetch.disable')
  await cdp.detach()
})

await step('Sin conexión con Binance: usa la última tasa y lo avisa', async () => {
  await sw(async () => {
    const c = (await chrome.storage.local.get('cache:p2p'))['cache:p2p']
    await chrome.storage.local.set({ 'cache:p2p': { ...c, fetchedAt: Date.now() - 3 * 3600 * 1000 } })
  })
  const cdp = await swTarget.createCDPSession()
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*p2p.binance.com*' }] })
  cdp.on('Fetch.requestPaused', (e) => cdp.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'InternetDisconnected' }))
  await app.reload({ waitUntil: 'domcontentloaded' })
  await waitTickets(app, 1)
  let [text] = await hostsText(app)
  assert.match(text, /Tasa de Binance de hace 3/)
  assert.match(text, /No se pudo actualizar/)
  assert.match(text, /Bs/)
  await shot(app, '10-estado-tasa-vieja', 'ug-extension-ui')

  await sw(() => chrome.storage.local.remove('cache:p2p'))
  await app.reload({ waitUntil: 'domcontentloaded' })
  await waitTickets(app, 1)
  ;[text] = await hostsText(app)
  assert.match(text, /Binance P2P no respondió/)
  assert.match(text, /HK\$/)
  await shot(app, '11-estado-sin-p2p', 'ug-extension-ui')
  await cdp.send('Fetch.disable')
  await cdp.detach()
  await sw(() => getRates(true))
})

await setSettings({ storeInUah: true })
await sw(() => chrome.storage.session.clear())

// =========================================================================================
// 4. Búsqueda: talones y tooltip
// =========================================================================================

const search = await newPage()
await steamCookies(search)

await step('Búsqueda: talón junto a cada precio de pago', async () => {
  await search.goto(`${STORE}/search/?term=portal`, { waitUntil: 'domcontentloaded' })
  assert.equal(new URL(search.url()).searchParams.get('cc'), 'ua')
  await search.waitForFunction(() => document.querySelectorAll('ug-extension-ui').length >= 10 && [...document.querySelectorAll('ug-extension-ui')].some((h) => h.shadowRoot?.querySelector('.ug-stub')), { timeout: 30000 })
  const paid = await search.$$eval('.search_result_row', (rows) => rows.filter((r) => Number(r.querySelector('.discount_block')?.getAttribute('data-price-final')) > 0).length)
  const stubs = await search.$$eval('ug-extension-ui', (h) => h.filter((x) => x.shadowRoot?.querySelector('.ug-stub') && !x.hidden).length)
  assert.equal(stubs, paid, `talones ${stubs} / filas de pago ${paid}`)
  const first = await search.$eval('ug-extension-ui', (h) => h.shadowRoot.textContent)
  assert.match(first, /Bs/)
  assert.match(first, /HK\$/)
  // Cada talón tiene que verse entero dentro de su fila (la fila recorta lo que se sale).
  const clipped = await search.$$eval('ug-extension-ui', (hosts) =>
    hosts
      .map((h) => {
        const stub = h.shadowRoot?.querySelector('.ug-stub')
        const row = h.closest('.search_result_row')
        if (!stub || !row || h.hidden) return null
        const s = stub.getBoundingClientRect()
        const r = row.getBoundingClientRect()
        return s.left >= r.left && s.right <= r.right + 0.5 && s.top >= r.top && s.bottom <= r.bottom + 0.5 ? null : `${stub.textContent.trim()} [${Math.round(s.left)}–${Math.round(s.right)} / ${Math.round(r.left)}–${Math.round(r.right)}]`
      })
      .filter(Boolean),
  )
  assert.deepEqual(clipped, [], 'talones recortados por la fila')
})

await step('Búsqueda: el tooltip aparece con el ratón y con el teclado', async () => {
  const stub = await search.$('ug-extension-ui >>> .ug-stub')
  await stub.hover()
  await search.waitForFunction(() => document.querySelector('ug-extension-ui').shadowRoot.querySelector('.ug-tip')?.matches(':popover-open'), { timeout: 3000 })
  await sleep(250)
  const row = await search.$('.search_result_row')
  const box = await row.boundingBox()
  await search.screenshot({ path: join(SHOTS, '12-busqueda-tooltip.png'), clip: { x: 0, y: Math.max(0, box.y - 20), width: 1280, height: 420 } })
  await search.mouse.move(5, 5)
  await search.waitForFunction(() => !document.querySelector('ug-extension-ui').shadowRoot.querySelector('.ug-tip')?.matches(':popover-open'), { timeout: 3000 })
  await search.keyboard.press('Shift')
  await search.evaluate(() => document.querySelector('.search_result_row').focus())
  await search.waitForFunction(() => document.querySelector('ug-extension-ui').shadowRoot.querySelector('.ug-tip')?.matches(':popover-open'), { timeout: 3000 })
  await search.keyboard.press('Escape')
  await search.waitForFunction(() => !document.querySelector('ug-extension-ui').shadowRoot.querySelector('.ug-tip')?.matches(':popover-open'), { timeout: 3000 })
})

await step('Búsqueda: las filas que carga el scroll infinito también llevan talón', async () => {
  const before = await search.$$eval('ug-extension-ui', (h) => h.length)
  for (let i = 0; i < 6; i++) {
    await search.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(1200)
  }
  await sleep(800)
  const rows = await search.$$eval('.search_result_row', (r) => r.length)
  const after = await search.$$eval('ug-extension-ui', (h) => h.length)
  if (rows > 50) assert.ok(after > before, `antes ${before}, después ${after}, filas ${rows}`)
})

await step('Captura: búsqueda con talones', async () => {
  await search.evaluate(() => window.scrollTo(0, 0))
  await sleep(300)
  const row = await search.$('.search_result_row')
  const box = await row.boundingBox()
  await search.screenshot({ path: join(SHOTS, '13-busqueda.png'), clip: { x: 0, y: Math.max(0, box.y - 10), width: 1280, height: 330 } })
})

// =========================================================================================
// 5. Popup
// =========================================================================================

const ctx = browser.defaultBrowserContext()
await ctx.overridePermissions(EXT, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write'])
const popup = await newPage({ width: 384, height: 900 })

await step('Popup: la lista muestra el juego, el total y las conversiones', async () => {
  await sw(async () => {
    const list = await getList()
    await setList([
      ...list,
      { key: 'app:620', type: 'app', id: 620, appId: 620, name: 'Portal 2', edition: 'Juego base', url: 'https://store.steampowered.com/app/620/', lastUah: 240, addedAt: Date.now() },
    ])
  })
  await popup.goto(`${EXT}/src/popup/popup.html`, { waitUntil: 'load' })
  await popup.waitForFunction(() => document.querySelector('#app').getAttribute('aria-busy') === 'false' && /Bs/.test(document.body.textContent), { timeout: 20000 })
  const text = await popup.$eval('#app', (el) => el.textContent)
  assert.match(text, /ELDEN RING/)
  assert.match(text, /Portal 2/)
  assert.match(text, /2 juegos/)
  assert.match(text, /Subtotal/)
  assert.match(text, /Total en bolívares/)
})

await step('Popup: el saldo calcula cuánto falta recargar y valida lo escrito', async () => {
  await popup.type('#wallet', '500')
  await popup.waitForFunction(() => /Falta recargar/.test(document.querySelector('#wallet-result').textContent))
  await popup.click('#wallet', { count: 3 })
  await popup.type('#wallet', 'abc')
  await popup.waitForFunction(() => !document.querySelector('#wallet-error').hidden)
  assert.equal(await popup.$eval('#wallet', (el) => el.getAttribute('aria-invalid')), '')
  await popup.click('#wallet', { count: 3 })
  await popup.type('#wallet', '999999')
  await popup.waitForFunction(() => /Te alcanza/.test(document.querySelector('#wallet-result').textContent))
  await popup.click('#wallet', { count: 3 })
  await popup.type('#wallet', '500')
  const stored = await sw(async () => (await chrome.storage.local.get('wallet')).wallet)
  assert.equal(stored, 500)
})

await step('Popup: «Copiar resumen» copia el texto para WhatsApp', async () => {
  await popup.click('.ug-btn--block')
  await popup.waitForFunction(() => document.querySelector('.ug-btn--block').textContent.includes('Copiado'))
  const clip = await popup.evaluate(() => navigator.clipboard.readText())
  assert.match(clip, /^ELDEN RING .+₴ \+ Portal 2 240₴ = .+₴ ≈ HK\$ \d+ ≈ [\d.,]+ USDT ≈ Bs [\d.]+$/, clip)
  await popup.screenshot({ path: join(SHOTS, '14-popup.png'), fullPage: true })
})

await step('Accesibilidad del popup (axe, WCAG 2.2 AA)', async () => {
  assert.deepEqual(await axe(popup), [])
})

await step('Popup: quitar un juego se puede deshacer', async () => {
  const before = (await sw(() => getList())).length
  await popup.click('.ug-remove')
  await popup.waitForFunction(() => !document.querySelector('.ug-snackbar').hidden)
  assert.equal((await sw(() => getList())).length, before - 1)
  assert.equal(await popup.evaluate(() => document.activeElement?.textContent), 'Deshacer')
  await popup.click('.ug-snackbar .ug-link')
  await popup.waitForFunction((n) => document.querySelectorAll('.ug-line--item').length === n, {}, before)
  assert.equal((await sw(() => getList())).length, before)
})

await step('Popup: vaciar la lista muestra el estado vacío', async () => {
  await popup.$$eval('.ug-toolbar .ug-link', (els) => els.find((e) => e.textContent.includes('Vaciar')).click())
  await popup.waitForFunction(() => /La lista está vacía/.test(document.body.textContent))
  assert.equal((await sw(() => getList())).length, 0)
  assert.equal(await sw(() => chrome.action.getBadgeText({})), '')
  await popup.screenshot({ path: join(SHOTS, '15-popup-vacio.png'), fullPage: true })
  await popup.click('.ug-snackbar .ug-link')
  await popup.waitForFunction(() => document.querySelectorAll('.ug-line--item').length === 2)
})

// =========================================================================================
// 6. Ajustes
// =========================================================================================

const options = await newPage({ width: 900, height: 1200 })

await step('Ajustes: cargan los valores y se guardan al cambiar', async () => {
  await options.goto(`${EXT}/src/options/options.html`, { waitUntil: 'load' })
  await options.waitForFunction(() => document.querySelector('#rates').children.length > 0, { timeout: 20000 })
  assert.equal(await options.$eval('#storeInUah', (el) => el.checked), true)
  assert.equal(await options.$eval('#p2pAds', (el) => el.value), '5')
  await options.click('#suggestCards')
  await options.waitForFunction(() => document.querySelector('#saved').textContent === 'Guardado')
  assert.equal((await sw(() => getSettings())).suggestCards, true)
  await options.click('#sellerSurchargePct', { count: 3 })
  await options.type('#sellerSurchargePct', '3,5')
  await options.$eval('#sellerSurchargePct', (el) => el.dispatchEvent(new Event('change', { bubbles: true })))
  await sleep(300)
  assert.equal((await sw(() => getSettings())).sellerSurchargePct, 3.5)
})

await step('Ajustes: un valor no válido se marca y no se guarda', async () => {
  await options.click('#p2pAds', { count: 3 })
  await options.type('#p2pAds', '99')
  await options.$eval('#p2pAds', (el) => el.dispatchEvent(new Event('change', { bubbles: true })))
  await options.waitForFunction(() => !document.querySelector('#p2pAds-error').hidden)
  assert.equal((await sw(() => getSettings())).p2pAds, 5)
  await options.click('#p2pAds', { count: 3 })
  await options.type('#p2pAds', '10')
  await options.$eval('#p2pAds', (el) => el.dispatchEvent(new Event('change', { bubbles: true })))
  await sleep(300)
  assert.equal((await sw(() => getSettings())).p2pAds, 10)
  await options.screenshot({ path: join(SHOTS, '16-ajustes.png'), fullPage: true })
})

await step('Accesibilidad de los ajustes (axe, WCAG 2.2 AA)', async () => {
  assert.deepEqual(await axe(options), [])
})

await step('Ajustes: sugerir tarjetas aparece en el ticket', async () => {
  await app.goto(`${STORE}/app/620/`, { waitUntil: 'domcontentloaded' })
  await waitTickets(app, 1)
  const [text] = await hostsText(app)
  assert.match(text, /Tarjetas sugeridas: .*HK\$/)
  assert.match(text, /3,5 % de recargo/)
  await shot(app, '17-ficha-tarjetas-sugeridas', 'ug-extension-ui')
})

await step('Ajustes: apagar los talones los quita de la búsqueda al momento', async () => {
  await options.bringToFront()
  await options.click('#listTags')
  await options.waitForFunction(() => document.querySelector('#saved').textContent === 'Guardado')
  await search.bringToFront()
  await search.waitForFunction(() => document.querySelectorAll('ug-extension-ui').length === 0, { timeout: 10000, polling: 250 })
  await options.bringToFront()
  await options.click('#listTags')
  await sleep(300)
  await search.bringToFront()
  await search.reload({ waitUntil: 'domcontentloaded' })
  await search.waitForFunction(() => document.querySelectorAll('ug-extension-ui').length > 5, { timeout: 30000, polling: 250 })
})

await step('Ajustes: apagar «Mostrar la tienda en ₴» quita la redirección', async () => {
  await options.bringToFront()
  await options.click('#storeInUah')
  await options.waitForFunction(() => document.querySelector('#saved').textContent === 'Guardado')
  await sleep(300)
  assert.equal((await sw(() => chrome.declarativeNetRequest.getDynamicRules())).length, 0)
  await app.goto(`${STORE}/app/620/`, { waitUntil: 'domcontentloaded' })
  assert.equal(new URL(app.url()).searchParams.get('cc'), null)
  await waitTickets(app, 1)
  const [text] = await hostsText(app)
  assert.match(text, /₴/)
  await options.bringToFront()
  await options.click('#storeInUah')
  await sleep(300)
  assert.ok((await sw(() => chrome.declarativeNetRequest.getDynamicRules())).length > 1)
})

// =========================================================================================
// 7. Pantalla estrecha y errores de consola
// =========================================================================================

await step('Pantalla estrecha (420 px): el ticket se adapta sin desbordarse', async () => {
  const narrow = await newPage({ width: 420, height: 900 })
  await steamCookies(narrow)
  await narrow.goto(`${STORE}/app/620/`, { waitUntil: 'domcontentloaded' })
  await waitTickets(narrow, 1)
  const overflow = await narrow.evaluate(() => {
    const t = document.querySelector('ug-extension-ui').shadowRoot.querySelector('.ug-ticket')
    const box = t.getBoundingClientRect()
    return [...t.querySelectorAll('*')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && !el.closest('.ug-watermark') && (r.right > box.right + 1 || r.left < box.left - 1)
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className.baseVal ?? el.className} «${el.textContent.slice(0, 30)}» ${Math.round(el.getBoundingClientRect().right)} > ${Math.round(box.right)}`)
  })
  assert.deepEqual(overflow, [])
  await shot(narrow, '18-ficha-estrecha', 'ug-extension-ui')
  await narrow.close()
})

await step('Ficha con DLC: talones en la lista de contenido descargable', async () => {
  const dlc = await newPage()
  await steamCookies(dlc)
  await dlc.goto(`${STORE}/app/1245620/`, { waitUntil: 'domcontentloaded' })
  const rows = await dlc.$$eval('.game_area_dlc_row', (r) => r.length)
  if (rows) {
    await dlc.waitForFunction(() => [...document.querySelectorAll('.game_area_dlc_row ug-extension-ui')].some((h) => h.shadowRoot?.querySelector('.ug-stub')), { timeout: 30000, polling: 250 })
    const section = await dlc.$('.game_area_dlc_section, #dlc_purchase_action')
    if (section) {
      await section.scrollIntoView()
      await sleep(300)
      await section.screenshot({ path: join(SHOTS, '19-ficha-dlc.png') })
    }
  }
  await dlc.close()
})

for (const [name, path] of [['Portada', '/'], ['Ofertas', '/specials']]) {
  await step(`${name}: la extensión no rompe la página`, async () => {
    const p = await newPage()
    await steamCookies(p)
    const res = await p.goto(`${STORE}${path}`, { waitUntil: 'domcontentloaded' })
    assert.ok(res.ok())
    await sleep(6000)
    const n = await p.$$eval('ug-extension-ui', (h) => h.length)
    const first = await p.$('ug-extension-ui')
    if (first) {
      await first.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await sleep(500)
    }
    await p.screenshot({ path: join(SHOTS, `20-${name.toLowerCase()}.png`) })
    console.log(`      (${n} talones en ${name.toLowerCase()})`)
    await p.close()
  })
}

await step('Sin errores de la extensión en consola', async () => {
  assert.deepEqual(extensionErrors, [])
})

await browser.close()
await rm(PROFILE, { recursive: true, force: true }).catch(() => {})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} de ${results.length} pasos correctos. Capturas en tests/e2e/capturas/`)
process.exitCode = failed.length ? 1 : 0
