import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../support/load-shared.mjs'

const { calc, config } = globalThis.UG
const NB = ' '

// Ejemplo del traspaso: fx.UAH 41,6, fx.HKD 7,78, P2P 1078 y 3 % de recargo.
const HANDOFF = { fx: { UAH: 41.6, HKD: 7.78, USD: 1 }, p2p: 1078, settings: { ...config.DEFAULTS, sellerSurchargePct: 3 } }

test('conversión del ejemplo del traspaso: 1 799₴', () => {
  const rates = calc.deriveRates(HANDOFF)
  const c = calc.convertUah(1799, rates)
  assert.equal(c.hkd.toFixed(2), '336.45')
  assert.equal(c.usdt.toFixed(2), '44.54')
  assert.equal(c.ves.toFixed(2), '48016.87')
  assert.equal(c.usd.toFixed(2), '43.25')
})

test('tasas manuales: ₴ por HK$ y precio real de la tarjeta', () => {
  const rates = calc.deriveRates({ ...HANDOFF, settings: { ...config.DEFAULTS, uahPerHkdManual: 5, hkCardPriceUsdt: 13.5 } })
  assert.equal(rates.uahPerHkd, 5)
  assert.equal(rates.usdtPerHkd, 0.135)
  const c = calc.convertUah(500, rates)
  assert.equal(c.hkd, 100)
  assert.equal(c.usdt.toFixed(4), '13.5000')
})

test('sin tasas de mercado no hay conversión; sin P2P no hay bolívares', () => {
  assert.equal(calc.deriveRates({ fx: { UAH: 41 }, p2p: 1000 }), null)
  assert.equal(calc.convertUah(100, null), null)
  const rates = calc.deriveRates({ ...HANDOFF, p2p: null })
  const c = calc.convertUah(1799, rates)
  assert.equal(rates.vesPerUsdt, null)
  assert.equal(c.ves, null)
  assert.ok(c.usdt > 0)
})

test('formatos de cada moneda', () => {
  assert.equal(calc.formatUah(1799), `1${NB}799₴`)
  assert.equal(calc.formatUah(240), '240₴')
  assert.equal(calc.formatUah(1799.5), `1${NB}799,50₴`)
  assert.equal(calc.formatUah(-2000), `−2${NB}000₴`)
  assert.equal(calc.formatHkd(336.45), `HK$${NB}336.45`)
  assert.equal(calc.formatHkd(1234.5), `HK$${NB}1,234.50`)
  assert.equal(calc.formatHkd(381.33, 0), `HK$${NB}381`)
  assert.equal(calc.formatUsdt(44.54), `44,54${NB}USDT`)
  assert.equal(calc.formatUsdt(1234.567), `1.234,57${NB}USDT`)
  assert.equal(calc.formatVes(48016.87), `Bs${NB}48.016,87`)
  assert.equal(calc.formatVes(48016.87, 0), `Bs${NB}48.017`)
  assert.equal(calc.formatUsd(43.25), '$43.25')
  assert.equal(calc.formatRate(5.34704, 3), '5,347')
  assert.equal(calc.formatPercent(39.2), `+39${NB}%`)
  assert.equal(calc.formatPercent(-17.4), `−17${NB}%`)
  assert.equal(calc.formatPercent(0.3), `0${NB}%`)
  assert.equal(calc.formatNumber(-0.001), '0,00')
  assert.equal(calc.formatNumber(NaN), '—')
})

test('leer precios en ₴ del texto de Steam', () => {
  assert.equal(calc.parseUahText('1 799₴'), 1799)
  assert.equal(calc.parseUahText(`1${NB}799₴`), 1799)
  assert.equal(calc.parseUahText('240,00₴'), 240)
  assert.equal(calc.parseUahText('2 862₴'), 2862)
  assert.equal(calc.parseUahText('1.799,50 ₴'), 1799.5)
  assert.equal(calc.parseUahText('  1 799₴  '), 1799)
  assert.equal(calc.parseUahText('$59.99'), null)
  assert.equal(calc.parseUahText(''), null)
  assert.equal(calc.parseUahText(null), null)
})

test('promedio de los N primeros anuncios', () => {
  assert.equal(calc.averagePrice([1075, 1075, 1075.395, 1076, 1076.7, 2000], 5), (1075 + 1075 + 1075.395 + 1076 + 1076.7) / 5)
  assert.equal(calc.averagePrice([1000, NaN, 0, 1100], 5), 1050)
  assert.equal(calc.averagePrice([], 5), null)
})

test('tarjetas sugeridas: menor sobrante y luego menos tarjetas', () => {
  assert.deepEqual(calc.suggestCards(336.45).cards, [300, 40])
  assert.deepEqual(calc.suggestCards(44.88).cards, [50])
  const s = calc.suggestCards(381.33)
  assert.equal(s.total, 390)
  assert.deepEqual(s.cards, [300, 50, 40])
  assert.deepEqual(calc.suggestCards(1000).cards, [1000])
  assert.deepEqual(calc.suggestCards(40).cards, [40])
  assert.deepEqual(calc.suggestCards(1).cards, [40])
  assert.equal(calc.suggestCards(0), null)
  assert.equal(calc.suggestCards(-5), null)
})

test('comparación de regiones', () => {
  const fx = { USD: 1, UAH: 41.6, HKD: 7.78, KZT: 520 }
  const r = calc.compareRegions({
    uaUah: 1799,
    fx,
    entries: [
      { cc: 'us', name: 'Estados Unidos', status: 'priced', currency: 'USD', final: 5999 },
      { cc: 'kz', name: 'Kazajistán', status: 'priced', currency: 'KZT', final: 1800000 },
      { cc: 'ru', name: 'Rusia', status: 'unavailable' },
      { cc: 'hk', name: 'Hong Kong', status: 'priced', currency: 'HKD', final: 46800, formatted: 'HK$ 468.00' },
    ],
  })
  assert.equal(r.uaUsd.toFixed(2), '43.25')
  assert.deepEqual(r.rows.map((x) => x.cc), ['kz', 'us', 'hk', 'ru'])
  assert.deepEqual(r.cheaper.map((x) => x.cc), ['kz'])
  assert.equal(r.pricedCount, 3)
  assert.equal(Math.round(r.rows[1].delta), 39)
  assert.equal(r.rows[2].local, 'HK$ 468.00')
  assert.equal(r.rows[3].usd, null)
})

test('resumen para copiar', () => {
  const rates = calc.deriveRates(HANDOFF)
  const text = calc.summaryText(
    [
      { label: 'ELDEN RING', uah: 1799 },
      { label: 'Portal 2', uah: 240 },
      { label: 'Sin precio', uah: null },
    ],
    rates,
  )
  assert.equal(text, 'ELDEN RING 1 799₴ + Portal 2 240₴ = 2 039₴ ≈ HK$ 381 ≈ 50,5 USDT ≈ Bs 54.423')
  assert.equal(calc.summaryText([{ label: 'Portal 2', uah: 240 }], rates), 'Portal 2 240₴ ≈ HK$ 45 ≈ 5,9 USDT ≈ Bs 6.406')
  assert.equal(calc.summaryText([], rates), '')
  assert.ok(!text.includes(' '), 'el texto copiado no lleva espacios duros')
})

test('textos de tiempo y plurales', () => {
  const now = Date.parse('2026-11-13T12:00:00Z')
  assert.equal(calc.timeAgo(now - 20 * 1000, now), 'hace un momento')
  assert.equal(calc.timeAgo(now - 3 * 60 * 1000, now), `hace 3${NB}min`)
  assert.equal(calc.timeAgo(now - 2 * 3600 * 1000, now), `hace 2${NB}h`)
  assert.equal(calc.timeAgo(now - 72 * 3600 * 1000, now), 'hace 3 días')
  assert.equal(calc.pluralize(1, 'juego', 'juegos'), '1 juego')
  assert.equal(calc.pluralize(2, 'juego', 'juegos'), '2 juegos')
  assert.equal(calc.pluralize(0, 'juego', 'juegos'), '0 juegos')
  assert.match(calc.formatDateTime(Date.UTC(2026, 10, 12, 14, 32)), /^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/)
})

test('ajustes: valores por defecto, límites y regiones desconocidas', () => {
  assert.deepEqual(config.normalizeSettings(undefined), { ...config.DEFAULTS, regions: [...config.DEFAULTS.regions] })
  const s = config.normalizeSettings({ p2pAds: 50, p2pSide: 'X', sellerSurchargePct: '3,5', regions: ['US', 'xx', 'hk', 'hk'], storeInUah: 'sí' })
  assert.equal(s.p2pAds, 20)
  assert.equal(s.p2pSide, 'BUY')
  assert.equal(s.sellerSurchargePct, 3.5)
  assert.deepEqual(s.regions, ['us', 'hk'])
  assert.equal(s.storeInUah, true)
  assert.equal(config.normalizeSettings({ p2pAds: 0 }).p2pAds, 1)
  assert.equal(config.normalizeSettings({ p2pSide: 'SELL' }).p2pSide, 'SELL')
  assert.equal(config.regionName('ar'), 'Argentina')
})
