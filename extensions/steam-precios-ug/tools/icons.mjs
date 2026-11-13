// Renders icons/icon-{16,32,48,128}.png from the emblem (src/shared/icons.js)
// in Chrome. Usage: npm run icons
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import puppeteer from 'puppeteer-core'
import { chromePath } from '../tests/support/chrome.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
await import(pathToFileURL(join(root, 'src/shared/icons.js')).href)
const { emblem, smallMark } = globalThis.UG.icons

const fontUrl = (f) => pathToFileURL(join(root, 'fonts', f)).href
const html = `<!doctype html><html><head><style>
  @font-face { font-family: "UG Martian Mono"; src: url("${fontUrl('martian-mono-latin.woff2')}") format("woff2"); font-weight: 100 800; font-stretch: 75% 112.5%; }
  :root { --ug-paper: oklch(0.955 0.01 85); --ug-stamp: oklch(0.45 0.17 262); }
  html, body { margin: 0; background: transparent; }
  body { font-family: "UG Martian Mono", monospace; color: var(--ug-stamp); }
  .icon { display: block; }
  .big path.paper { fill: var(--ug-paper); }
</style></head><body>
  <svg id="i128" class="icon big" width="128" height="128" viewBox="4 4 112 112">
    <path class="paper" d="M14 30h92v20a10 10 0 0 0 0 20v20H14V70a10 10 0 0 0 0-20Z"/>
    ${emblem({ crop: false, ink: false }).replace(/^<svg[^>]*>/, '<g>').replace(/<\/svg>$/, '</g>')}
  </svg>
  <svg id="big" width="360" height="245" viewBox="11 27 98 66" style="margin:10px">${emblem({ crop: false, ink: true }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>
  ${[48, 32, 16]
    .map((s) =>
      smallMark('icon', { bars: s >= 48 })
        .replace('<svg class="icon"', `<svg id="i${s}" class="icon" width="${s}" height="${s}"`)
        .replace('fill="currentColor"/>', `fill="currentColor" style="stroke:var(--ug-paper);stroke-width:${s <= 16 ? 1.6 : 1.1}px;paint-order:stroke"/>`),
    )
    .join('')}
</body></html>`

// The page loads from a file so it can read the local font.
const tmp = join(root, 'tools', '.icons.html')
await writeFile(tmp, html)
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true })
try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const loaded = await page.evaluate(() => document.fonts.check('800 27px "UG Martian Mono"'))
  if (!loaded) throw new Error('Martian Mono did not load')
  await mkdir(join(root, 'icons'), { recursive: true })
  for (const s of [128, 48, 32, 16]) {
    const el = await page.$(`#i${s}`)
    const png = await el.screenshot({ omitBackground: true })
    await writeFile(join(root, 'icons', `icon-${s}.png`), png)
    console.log(`icons/icon-${s}.png`)
  }
  if (process.argv.includes('--preview')) {
    await page.setViewport({ width: 400, height: 300, deviceScaleFactor: 2 })
    await page.screenshot({ path: join(root, 'tools', '.icons-preview.png') })
  }
} finally {
  await browser.close()
  await rm(tmp, { force: true })
}
