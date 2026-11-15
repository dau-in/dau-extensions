// Captures the README images from the live Steam store, with the extension
// installed: NieR:Automata on the game page, a NieR search and the UG list.
// Needs network and the installed Chrome. Usage: npm run docs
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { chromePath } from '../tests/support/chrome.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(ROOT, 'docs')
const PROFILE = join(tmpdir(), `ug-docs-${Date.now()}`)
const STORE = 'https://store.steampowered.com'
const AUTOMATA = '/app/524220/NieR_Automata/'
const REPLICANT = '/app/1113560/NieR_Replicant_ver122474487139/'

// Wide images are a 4:3 crop of a 1280 × 960 window, so the store keeps its
// own layout and every demo in the README has the same shape.
const WIDE = { x: 40, width: 1200, height: 900 }
const WINDOW = { width: 1280, height: 960 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = console.log

await mkdir(DOCS, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  pipe: true,
  enableExtensions: true,
  userDataDir: PROFILE,
  defaultViewport: WINDOW,
  args: ['--lang=en-US', `--window-size=${WINDOW.width},${WINDOW.height}`],
})

const id = await browser.installExtension(ROOT)
const EXT = `chrome-extension://${id}`
const sw = await (await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith(EXT))).worker()
log(`extension ${id}`)

const page = await browser.newPage()
await page.setViewport(WINDOW)
await page.setCookie({ name: 'Steam_Language', value: 'english', domain: 'store.steampowered.com', path: '/' })

// A viewport crop that keeps 4:3 whatever the page is scrolled to.
async function wide(target, file) {
  const y = await target.evaluate(() => Math.round(window.scrollY))
  await target.screenshot({ path: join(DOCS, file), clip: { ...WIDE, y } })
  log(`docs/${file}`)
}

// The receipt alone: the host is as wide as Steam's column, the paper is not.
async function receipt(target, file) {
  const clip = await target.evaluate(() => {
    const paper = document.querySelector('ug-extension-ui')?.shadowRoot?.querySelector('.ug-ticket')
    if (!paper) return null
    const r = paper.getBoundingClientRect()
    return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), width: Math.round(r.width), height: Math.round(r.height) }
  })
  await target.screenshot({ path: join(DOCS, file), clip })
  log(`docs/${file}`)
}

async function openGame(path) {
  await page.goto(`${STORE}${path}?cc=ua`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.bringToFront()
  await page.waitForFunction(
    () => {
      const hosts = [...document.querySelectorAll('ug-extension-ui')].filter((h) => h.shadowRoot?.querySelector('.ug-ticket'))
      return hosts.length > 0 && hosts.every((h) => !h.shadowRoot.querySelector('[aria-busy="true"]'))
    },
    { timeout: 90000, polling: 250 },
  )
  await sleep(1500)
}

// Presses "UG list" on the first receipt of the open page.
async function addFirst() {
  const pressed = await page.$$eval('ug-extension-ui', (hosts) => {
    const host = hosts.find((h) => h.shadowRoot?.querySelector('.ug-ticket'))
    const button = host && [...host.shadowRoot.querySelectorAll('button')].find((b) => b.textContent.trim() === 'UG list')
    if (!button || button.getAttribute('aria-pressed') === 'true') return false
    button.click()
    return true
  })
  log(`  UG list: ${pressed ? 'added' : 'already there'}`)
  await sleep(700)
}

// 1. The game page, with the receipt under the YoRHa Edition.
await openGame(AUTOMATA)
const first = await page.$('ug-extension-ui')
await first.evaluate((el) => el.scrollIntoView({ block: 'center' }))
await sleep(600)
await wide(page, 'hero.png')

// 2. The receipt alone.
await receipt(page, 'ticket.png')

// 3. The receipt with the region comparison open.
await first.evaluate((host) => host.shadowRoot.querySelector('.ug-regions summary').click())
await page.waitForFunction(
  () => Boolean(document.querySelector('ug-extension-ui')?.shadowRoot?.querySelector('.ug-regions table')),
  { timeout: 90000, polling: 250 },
)
await sleep(1200)
await receipt(page, 'regions.png')

// 4. Both NieR games on the UG list, for the popup.
await addFirst()
await openGame(REPLICANT)
await addFirst()

// 5. Search results: a stub next to every price.
const search = await browser.newPage()
await search.setViewport(WINDOW)
await search.setCookie({ name: 'Steam_Language', value: 'english', domain: 'store.steampowered.com', path: '/' })
await search.goto(`${STORE}/search/?term=NieR&cc=ua`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await search.bringToFront()
await search.waitForFunction(
  () => [...document.querySelectorAll('ug-extension-ui')].some((host) => host.shadowRoot?.querySelector('.ug-stub')),
  { timeout: 90000, polling: 250 },
)
await sleep(2000)
// Leave the result count and the first rows in frame.
await search.evaluate(() => {
  const rows = document.querySelector('#search_resultsRows')
  if (rows) window.scrollTo(0, rows.getBoundingClientRect().top + window.scrollY - 96)
})
await sleep(700)
await wide(search, 'search.png')

// 6. The popup with the list and a wallet balance.
const popup = await browser.newPage()
await popup.setViewport({ width: 420, height: 1200 })
await popup.goto(`${EXT}/src/popup/popup.html`, { waitUntil: 'load' })
await popup.bringToFront()
await popup.evaluate(() => chrome.storage.local.set({ wallet: 1000 }))
await popup.reload({ waitUntil: 'load' })
await popup.waitForFunction(() => document.querySelector('.ug-receipt__title')?.textContent === 'UG list', { timeout: 30000 })
await popup.waitForFunction(() => !document.querySelector('#app[aria-busy="true"]'), { timeout: 90000, polling: 250 })
await sleep(2500)
await (await popup.$('#app')).screenshot({ path: join(DOCS, 'popup.png') })
log('docs/popup.png')

// 7. Settings, in English and in Spanish.
const options = await browser.newPage()
await options.setViewport({ width: 900, height: 1200 })
await options.goto(`${EXT}/src/options/options.html`, { waitUntil: 'load' })
await options.bringToFront()
await options.waitForFunction(() => document.querySelector('#rates').children.length > 0, { timeout: 30000 })
if (!(await options.$eval('#suggestCards', (el) => el.checked))) {
  await options.click('#suggestCards')
  await options.waitForFunction(() => document.querySelector('#saved').textContent === 'Saved', { timeout: 10000 })
}
await sleep(500)
await options.screenshot({ path: join(DOCS, 'settings.png'), fullPage: true })
log('docs/settings.png')

await options.click('input[name="lang"][value="es"]')
await options.waitForFunction(() => document.querySelector('#saved').textContent === 'Guardado', { timeout: 10000 })
await sleep(500)
await options.screenshot({ path: join(DOCS, 'settings-spanish.png'), fullPage: true })
log('docs/settings-spanish.png')

const list = await sw.evaluate(async () => (await chrome.storage.local.get('list')).list)
log(`list: ${list.map((item) => item.name).join(', ')}`)

await browser.close()
log('done')
