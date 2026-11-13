// Data source URLs and parsing of their responses. Pure: the service worker
// makes the requests; this file only builds and reads them.
;(() => {
  const UG = (globalThis.UG ??= {})

  class SourceError extends Error {
    constructor(source, message) {
      super(message)
      this.name = 'SourceError'
      this.source = source
    }
  }

  // ---- Binance P2P (USDT/VES) -------------------------------------------------
  // Not a documented API: it answers without CORS headers, which is why the
  // service worker makes the request.

  const P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search'

  function p2pRequest({ side = 'BUY', rows = 5 } = {}) {
    return {
      url: P2P_URL,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          asset: 'USDT',
          fiat: 'VES',
          tradeType: side,
          page: 1,
          rows: Math.min(20, Math.max(1, rows)),
          payTypes: [],
          publisherType: null,
        }),
      },
    }
  }

  function parseP2P(json, n) {
    const ads = Array.isArray(json?.data) ? json.data : null
    if (!ads) throw new SourceError('p2p', 'Binance returned no ads')
    const prices = ads.map((a) => Number(a?.adv?.price)).filter((p) => Number.isFinite(p) && p > 0)
    const price = UG.calc.averagePrice(prices, n)
    if (price == null) throw new SourceError('p2p', 'Binance returned no valid prices')
    return { price, prices: prices.slice(0, n), count: Math.min(n, prices.length) }
  }

  // ---- Exchange rates (USD base) ------------------------------------------------

  const upperKeys = (obj) => {
    const out = {}
    for (const [k, v] of Object.entries(obj ?? {})) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) out[k.toUpperCase()] = n
    }
    return out
  }

  const fromCurrencyApi = (json) => {
    const rates = upperKeys(json?.usd)
    const updatedAt = json?.date ? Date.parse(`${json.date}T00:00:00Z`) : null
    return { rates, updatedAt }
  }

  const FX_SOURCES = [
    {
      name: 'open.er-api.com',
      url: 'https://open.er-api.com/v6/latest/USD',
      parse: (json) => {
        if (json?.result && json.result !== 'success') throw new SourceError('fx', 'open.er-api.com returned an error')
        return { rates: upperKeys(json?.rates), updatedAt: json?.time_last_update_unix ? json.time_last_update_unix * 1000 : null }
      },
    },
    { name: 'currency-api.pages.dev', url: 'https://latest.currency-api.pages.dev/v1/currencies/usd.json', parse: fromCurrencyApi },
    {
      name: 'cdn.jsdelivr.net',
      url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
      parse: fromCurrencyApi,
    },
  ]

  function parseFx(source, json) {
    const { rates, updatedAt } = source.parse(json)
    if (!(rates.UAH > 0) || !(rates.HKD > 0)) throw new SourceError('fx', `${source.name} has no UAH or HKD`)
    rates.USD = 1
    return { rates, updatedAt, source: source.name }
  }

  // ---- Steam store ---------------------------------------------------------------

  const STORE = 'https://store.steampowered.com'

  // Several apps per request: only works with filters=price_overview.
  const appDetailsUrl = (ids, cc) => `${STORE}/api/appdetails?appids=${ids.join(',')}&cc=${cc}&filters=price_overview`
  // Packages one at a time: several at once return 400.
  const packageDetailsUrl = (id, cc) => `${STORE}/api/packagedetails/?packageids=${id}&cc=${cc}`
  const bundlesUrl = (ids, cc) => `${STORE}/actions/ajaxresolvebundles?bundleids=${ids.join(',')}&cc=${cc}&l=spanish`

  const priced = (p, extra = {}) => ({
    status: 'priced',
    currency: p.currency,
    initial: Number(p.initial),
    final: Number(p.final),
    discountPercent: Number(p.discount_percent) || 0,
    ...extra,
  })

  // → { [appid]: { status: 'priced' | 'free' | 'unavailable', … } }
  function parseAppDetails(json, ids) {
    const out = {}
    for (const id of ids) {
      const entry = json?.[id]
      if (!entry || entry.success !== true) {
        out[id] = { status: 'unavailable' }
      } else if (entry.data && !Array.isArray(entry.data) && entry.data.price_overview) {
        const p = entry.data.price_overview
        out[id] = priced(p, { formatted: p.final_formatted || '' })
      } else {
        out[id] = { status: 'free' }
      }
    }
    return out
  }

  function parsePackage(json, id) {
    const entry = json?.[id]
    if (!entry || entry.success !== true || !entry.data) return { status: 'unavailable' }
    const d = entry.data
    const appIds = Array.isArray(d.apps) ? d.apps.map((a) => a.id) : []
    if (!d.price) return { status: 'free', name: d.name, appIds }
    return priced(d.price, { name: d.name, appIds })
  }

  // A bundle's price comes from formatted_final_price: final_price is usually
  // 0 without a session. Only used with cc=ua, where the text is in ₴.
  function parseBundles(json, ids) {
    const out = {}
    const list = Array.isArray(json) ? json : []
    for (const id of ids) {
      const b = list.find((x) => String(x?.bundleid) === String(id))
      if (!b) {
        out[id] = { status: 'unavailable' }
        continue
      }
      const final = UG.calc.parseUahText(b.formatted_final_price ?? '')
      const initial = UG.calc.parseUahText(b.formatted_orig_price ?? '')
      if (final == null) {
        out[id] = { status: 'unavailable', name: b.name }
        continue
      }
      out[id] = {
        status: final === 0 ? 'free' : 'priced',
        currency: 'UAH',
        final: Math.round(final * 100),
        initial: Math.round((initial ?? final) * 100),
        discountPercent: initial && initial > final ? Math.round((1 - final / initial) * 100) : 0,
        name: b.name,
        appIds: b.appids ?? [],
      }
    }
    return out
  }

  UG.sources = {
    SourceError,
    P2P_URL,
    p2pRequest,
    parseP2P,
    FX_SOURCES,
    parseFx,
    appDetailsUrl,
    packageDetailsUrl,
    bundlesUrl,
    parseAppDetails,
    parsePackage,
    parseBundles,
  }
})()
