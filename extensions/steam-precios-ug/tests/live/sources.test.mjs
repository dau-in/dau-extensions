// Pruebas contra las fuentes reales. Necesitan conexión: npm run test:red
// Fallan si una API cambia de forma, que es justo lo que queremos saber.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../support/load-shared.mjs'

const { sources, calc } = globalThis.UG

async function json(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) })
  assert.ok(res.ok, `${url} respondió ${res.status}`)
  return res.json()
}

test('Binance P2P responde con precios USDT/VES plausibles', async () => {
  for (const side of ['BUY', 'SELL']) {
    const { url, init } = sources.p2pRequest({ side, rows: 5 })
    const r = sources.parseP2P(await json(url, init), 5)
    assert.ok(r.count >= 1, `${side}: sin anuncios`)
    assert.ok(r.price > 10 && r.price < 1e6, `${side}: precio raro ${r.price}`)
  }
})

for (const source of sources.FX_SOURCES) {
  test(`tasas de cambio: ${source.name}`, async () => {
    const r = sources.parseFx(source, await json(source.url))
    assert.ok(r.rates.UAH > 10 && r.rates.UAH < 200, `UAH raro: ${r.rates.UAH}`)
    assert.ok(r.rates.HKD > 5 && r.rates.HKD < 10, `HKD raro: ${r.rates.HKD}`)
    for (const c of ['EUR', 'KZT', 'BRL', 'PLN', 'RUB']) assert.ok(r.rates[c] > 0, `falta ${c}`)
  })
}

test('Steam appdetails en lote, cc=ua', async () => {
  const ids = [620, 1245620, 570]
  const r = sources.parseAppDetails(await json(sources.appDetailsUrl(ids, 'ua')), ids)
  assert.equal(r[620].status, 'priced')
  assert.equal(r[620].currency, 'UAH')
  assert.ok(r[1245620].final > 0)
  assert.equal(r[570].status, 'free')
})

test('Steam appdetails en otra región da su moneda', async () => {
  const r = sources.parseAppDetails(await json(sources.appDetailsUrl([620], 'us')), [620])
  assert.equal(r[620].currency, 'USD')
})

test('Steam packagedetails, de uno en uno', async () => {
  const r = sources.parsePackage(await json(sources.packageDetailsUrl(440408, 'ua')), 440408)
  assert.equal(r.status, 'priced')
  assert.equal(r.currency, 'UAH')
  assert.ok(r.appIds.includes(1245620))
})

test('Steam bundles: precio desde el texto en ₴', async () => {
  const r = sources.parseBundles(await json(sources.bundlesUrl([232], 'ua')), [232])
  assert.equal(r[232].status, 'priced')
  assert.ok(r[232].final > 0)
  assert.ok(calc.formatUah(r[232].final / 100).endsWith('₴'))
})
