// Conversions and formats. Pure: no DOM and no browser APIs.
//
//   ₴ per HK$     = fx.UAH / fx.HKD                    (or the manual value)
//   USDT per HK$  = (1 / fx.HKD) × (1 + surcharge)      (or the real price of the HK$100 card ÷ 100)
//   HK$           = ₴ / (₴ per HK$)
//   USDT          = HK$ × (USDT per HK$)
//   Bs            = USDT × P2P rate
;(() => {
  const UG = (globalThis.UG ??= {})

  const NBSP = ' '
  const MINUS = '−'

  // ---- Numbers ---------------------------------------------------------------

  const group = (intStr, sep) => intStr.replace(/\B(?=(\d{3})+(?!\d))/g, sep)

  // Formats a number with its own thousands and decimal separators.
  function formatNumber(n, { decimals = 2, thousands = '.', decimal = ',', trimZeros = false } = {}) {
    if (!Number.isFinite(n)) return '—'
    const negative = n < 0 && Math.abs(n) >= 0.5 * 10 ** -decimals
    let [int, dec = ''] = Math.abs(n).toFixed(decimals).split('.')
    if (trimZeros && /^0*$/.test(dec)) dec = ''
    const body = group(int, thousands) + (dec ? decimal + dec : '')
    return (negative ? MINUS : '') + body
  }

  // 1 799₴, 240₴, 1 799,50₴ (cents only when there are any)
  const formatUah = (uah) => formatNumber(uah, { decimals: 2, thousands: NBSP, decimal: ',', trimZeros: true }) + '₴'
  // HK$ 336.45
  const formatHkd = (hkd, decimals = 2) => `HK$${NBSP}` + formatNumber(hkd, { decimals, thousands: ',', decimal: '.' })
  // 44,54 USDT
  const formatUsdt = (usdt, decimals = 2) => formatNumber(usdt, { decimals, thousands: '.', decimal: ',' }) + `${NBSP}USDT`
  // Bs 48.016,87 or Bs 48.017
  const formatVes = (ves, decimals = 2) => `Bs${NBSP}` + formatNumber(ves, { decimals, thousands: '.', decimal: ',' })
  // $43.25
  const formatUsd = (usd) => '$' + formatNumber(usd, { decimals: 2, thousands: ',', decimal: '.' })
  // 5,347
  const formatRate = (n, decimals) => formatNumber(n, { decimals, thousands: '.', decimal: ',' })
  // +39 %, −17 %, 0 %
  function formatPercent(p) {
    if (!Number.isFinite(p)) return '—'
    const r = Math.round(p)
    if (r === 0) return `0${NBSP}%`
    return (r > 0 ? '+' : MINUS) + Math.abs(r) + `${NBSP}%`
  }

  // A price in another currency, for the region comparison. Dollar-like
  // currencies keep their prefix (US$, HK$, CA$…) so they are not confused.
  const DOLLAR_LIKE = new Set(['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'MXN', 'TWD', 'CLP', 'COP', 'ARS'])
  function formatMoney(amount, currency) {
    if (currency === 'HKD') return formatHkd(amount)
    if (currency === 'UAH') return formatUah(amount)
    try {
      const currencyDisplay = DOLLAR_LIKE.has(currency) ? 'symbol' : 'narrowSymbol'
      return new Intl.NumberFormat('es', { style: 'currency', currency, currencyDisplay }).format(amount)
    } catch {
      return `${formatNumber(amount)} ${currency}`
    }
  }

  // "1 799₴", "240,00₴", "1.799,50 ₴" → 1799, 240, 1799.5. Null without ₴.
  function parseUahText(text) {
    if (typeof text !== 'string' || !text.includes('₴')) return null
    const m = text.match(/(\d[\d\s  .,]*)\s*₴/)
    if (!m) return null
    let s = m[1].replace(/[\s  ]/g, '')
    const comma = s.lastIndexOf(',')
    const dot = s.lastIndexOf('.')
    const decimalAt = Math.max(comma, dot)
    if (decimalAt !== -1 && s.length - decimalAt - 1 === 2) {
      s = s.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + s.slice(decimalAt + 1)
    } else {
      s = s.replace(/[.,]/g, '')
    }
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  // ---- Rates and conversion ------------------------------------------------------

  // fx: USD-based rates ({ UAH: 41.6, HKD: 7.78, … }). p2p: Bs per USDT.
  // Returns null when an essential value is missing.
  function deriveRates({ fx, p2p, settings }) {
    const s = settings ?? UG.config.DEFAULTS
    const UAH = fx?.UAH
    const HKD = fx?.HKD
    if (!(UAH > 0) || !(HKD > 0)) return null
    const uahPerHkd = s.uahPerHkdManual > 0 ? s.uahPerHkdManual : UAH / HKD
    const usdtPerHkd = s.hkCardPriceUsdt > 0 ? s.hkCardPriceUsdt / 100 : (1 / HKD) * (1 + s.sellerSurchargePct / 100)
    const vesPerUsdt = p2p > 0 ? p2p : null
    return {
      uahPerHkd,
      usdtPerHkd,
      vesPerUsdt,
      uahPerUsd: UAH,
      manualUahPerHkd: s.uahPerHkdManual > 0,
      manualCard: s.hkCardPriceUsdt > 0,
      surchargePct: s.sellerSurchargePct,
    }
  }

  // ₴ → { uah, hkd, usdt, ves, usd }. ves is null without a P2P rate.
  function convertUah(uah, rates) {
    if (!rates || !Number.isFinite(uah)) return null
    const hkd = uah / rates.uahPerHkd
    const usdt = hkd * rates.usdtPerHkd
    const ves = rates.vesPerUsdt ? usdt * rates.vesPerUsdt : null
    return { uah, hkd, usdt, ves, usd: uah / rates.uahPerUsd }
  }

  // Average of the first N P2P ads.
  function averagePrice(prices, n) {
    const list = prices.filter((p) => Number.isFinite(p) && p > 0).slice(0, n)
    if (!list.length) return null
    return list.reduce((a, b) => a + b, 0) / list.length
  }

  // ---- Suggested cards ------------------------------------------------------

  // The combination of cards that covers the amount with the least left over
  // and, with equal leftovers, the fewest cards. Returns the denominations from
  // largest to smallest, or null if the amount is not valid.
  function suggestCards(hkd, denominations = UG.config.HK_DENOMINATIONS) {
    if (!(hkd > 0) || hkd > 50000) return null
    const target = Math.ceil(hkd - 1e-9)
    const max = Math.max(...denominations)
    const limit = target + max
    const count = new Array(limit + 1).fill(Infinity)
    const pick = new Array(limit + 1).fill(0)
    count[0] = 0
    for (let sum = 1; sum <= limit; sum++) {
      for (const d of denominations) {
        if (d <= sum && count[sum - d] + 1 < count[sum]) {
          count[sum] = count[sum - d] + 1
          pick[sum] = d
        }
      }
    }
    for (let sum = target; sum <= limit; sum++) {
      if (count[sum] !== Infinity) {
        const cards = []
        for (let s = sum; s > 0; s -= pick[s]) cards.push(pick[s])
        return { total: sum, cards: cards.sort((a, b) => b - a), spare: sum - hkd }
      }
    }
    return null
  }

  // ---- Region comparison ---------------------------------------------------

  // entries: [{ cc, status, currency, final (in cents), formatted }]
  // Returns the rows sorted from cheapest to most expensive, with unpriced
  // regions last, plus where Ukraine stands.
  function compareRegions({ uaUah, entries, fx }) {
    const uaUsd = fx?.UAH > 0 ? uaUah / fx.UAH : null
    const rows = entries.map((e) => {
      if (e.status !== 'priced') return { ...e, usd: null, delta: null }
      const rate = e.currency === 'USD' ? 1 : fx?.[e.currency]
      const amount = e.final / 100
      const usd = rate > 0 ? amount / rate : null
      return {
        ...e,
        amount,
        local: e.formatted || formatMoney(amount, e.currency),
        usd,
        delta: usd != null && uaUsd ? (usd / uaUsd - 1) * 100 : null,
      }
    })
    rows.sort((a, b) => (a.usd ?? Infinity) - (b.usd ?? Infinity))
    const cheaper = rows.filter((r) => r.usd != null && uaUsd != null && r.usd < uaUsd - 0.005)
    const priced = rows.filter((r) => r.usd != null)
    return { uaUsd, rows, cheaper, pricedCount: priced.length }
  }

  // ---- Text ----------------------------------------------------------------------

  const plural = new Intl.PluralRules('es')
  const pluralize = (n, one, other) => `${n} ${plural.select(n) === 'one' ? one : other}`

  // "hace 3 min", "hace 2 h", "hace 1 día" (3 min ago, 2 h ago, 1 day ago)
  function timeAgo(ts, now = Date.now()) {
    if (!Number.isFinite(ts)) return 'sin fecha'
    const s = Math.max(0, Math.round((now - ts) / 1000))
    if (s < 60) return 'hace un momento'
    const m = Math.round(s / 60)
    if (m < 60) return `hace ${m}${NBSP}min`
    const h = Math.round(m / 60)
    if (h < 48) return `hace ${h}${NBSP}h`
    return `hace ${pluralize(Math.round(h / 24), 'día', 'días')}`
  }

  const pad = (n) => String(n).padStart(2, '0')
  // 12/11/2026 14:32 in local time
  function formatDateTime(ts) {
    const d = new Date(ts)
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // Text for WhatsApp or Discord:
  // ELDEN RING 1 799₴ + Portal 2 240₴ = 2 039₴ ≈ HK$ 381 ≈ 50,5 USDT ≈ Bs 54.423
  function summaryText(items, rates) {
    const priced = items.filter((i) => Number.isFinite(i.uah))
    if (!priced.length) return ''
    const sp = (s) => s.replaceAll(NBSP, ' ')
    const total = priced.reduce((a, i) => a + i.uah, 0)
    const parts = priced.map((i) => `${i.label} ${sp(formatUah(i.uah))}`)
    let text = parts.join(' + ')
    if (priced.length > 1) text += ` = ${sp(formatUah(total))}`
    const c = convertUah(total, rates)
    if (c) {
      text += ` ≈ ${sp(formatHkd(c.hkd, 0))} ≈ ${sp(formatUsdt(c.usdt, 1))}`
      if (c.ves != null) text += ` ≈ ${sp(formatVes(c.ves, 0))}`
    }
    return text
  }

  UG.calc = {
    NBSP,
    MINUS,
    formatNumber,
    formatUah,
    formatHkd,
    formatUsdt,
    formatVes,
    formatUsd,
    formatRate,
    formatPercent,
    formatMoney,
    parseUahText,
    deriveRates,
    convertUah,
    averagePrice,
    suggestCards,
    compareRegions,
    pluralize,
    timeAgo,
    formatDateTime,
    summaryText,
  }
})()
