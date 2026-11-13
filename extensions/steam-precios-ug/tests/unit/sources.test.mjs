import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../support/load-shared.mjs'

const { sources } = globalThis.UG

test('Binance P2P: request and average', () => {
  const { url, init } = sources.p2pRequest({ side: 'SELL', rows: 50 })
  assert.equal(url, 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search')
  const body = JSON.parse(init.body)
  assert.equal(body.tradeType, 'SELL')
  assert.equal(body.rows, 20)
  assert.equal(body.fiat, 'VES')
  const json = { data: ['1069.000', '1070.000', 'x', '1071.000'].map((price) => ({ adv: { price } })) }
  const r = sources.parseP2P(json, 5)
  assert.equal(r.price, 1070)
  assert.equal(r.count, 3)
  assert.throws(() => sources.parseP2P({ data: null }, 5), /no ads/)
  assert.throws(() => sources.parseP2P({ data: [] }, 5), /no valid prices/)
})

test('exchange rates: the three sources', () => {
  const [er, pages, jsd] = sources.FX_SOURCES
  const a = sources.parseFx(er, { result: 'success', time_last_update_unix: 1763000000, rates: { USD: 1, UAH: 41.6, HKD: 7.78, KZT: 520 } })
  assert.equal(a.rates.UAH, 41.6)
  assert.equal(a.rates.KZT, 520)
  assert.equal(a.updatedAt, 1763000000000)
  const b = sources.parseFx(pages, { date: '2026-11-12', usd: { uah: 41.6, hkd: 7.78 } })
  assert.equal(b.rates.HKD, 7.78)
  assert.equal(b.rates.USD, 1)
  assert.equal(b.source, 'currency-api.pages.dev')
  assert.ok(sources.parseFx(jsd, { usd: { uah: 41, hkd: 7.8 } }))
  assert.throws(() => sources.parseFx(er, { result: 'error' }), /error/)
  assert.throws(() => sources.parseFx(pages, { usd: { uah: 41 } }), /no UAH or HKD/)
})

test('Steam appdetails: priced, free and unavailable', () => {
  // Real response from 2026-11-13 (cc=ua).
  const json = {
    620: { success: true, data: { price_overview: { currency: 'UAH', initial: 24000, final: 24000, discount_percent: 0, initial_formatted: '', final_formatted: '240₴' } } },
    1245620: { success: true, data: { price_overview: { currency: 'UAH', initial: 179900, final: 179900, discount_percent: 0, final_formatted: '1 799₴' } } },
    570: { success: true, data: [] },
    99999999: { success: false },
  }
  const r = sources.parseAppDetails(json, [620, 1245620, 570, 99999999, 1])
  assert.deepEqual(r[620], { status: 'priced', currency: 'UAH', initial: 24000, final: 24000, discountPercent: 0, formatted: '240₴' })
  assert.equal(r[1245620].final, 179900)
  assert.equal(r[570].status, 'free')
  assert.equal(r[99999999].status, 'unavailable')
  assert.equal(r[1].status, 'unavailable')
  assert.equal(sources.appDetailsUrl([620, 570], 'ua'), 'https://store.steampowered.com/api/appdetails?appids=620,570&cc=ua&filters=price_overview')
})

test('Steam packagedetails and bundles', () => {
  const pkg = { 440408: { success: true, data: { name: 'ELDEN RING', apps: [{ id: 1245620 }], price: { currency: 'UAH', initial: 179900, final: 107900, discount_percent: 40 } } } }
  const p = sources.parsePackage(pkg, 440408)
  assert.equal(p.status, 'priced')
  assert.equal(p.discountPercent, 40)
  assert.deepEqual(p.appIds, [1245620])
  assert.equal(sources.parsePackage({ 1: { success: false } }, 1).status, 'unavailable')
  assert.equal(sources.parsePackage({ 2: { success: true, data: { name: 'x' } } }, 2).status, 'free')

  const bundles = [{ bundleid: 232, name: 'Valve Complete Pack', formatted_orig_price: '3 180₴', formatted_final_price: '2 862₴', final_price: 0, appids: [240, 620] }]
  const b = sources.parseBundles(bundles, [232, 9])
  assert.equal(b[232].status, 'priced')
  assert.equal(b[232].final, 286200)
  assert.equal(b[232].initial, 318000)
  assert.equal(b[232].discountPercent, 10)
  assert.equal(b[9].status, 'unavailable')
})
