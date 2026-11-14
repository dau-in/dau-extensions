// Settings, regions and constants. No DOM and no browser APIs: loaded by the
// service worker, the content script, the popup, the settings page and Node.
;(() => {
  const UG = (globalThis.UG ??= {})

  const MIN = 60 * 1000
  const HOUR = 60 * MIN

  // Region names in both languages: the settings page shows them and so does
  // the comparison table.
  const REGIONS = [
    { cc: 'us', en: 'United States', es: 'Estados Unidos' },
    { cc: 'hk', en: 'Hong Kong', es: 'Hong Kong' },
    { cc: 'ar', en: 'Argentina', es: 'Argentina' },
    { cc: 'tr', en: 'Turkey', es: 'Turquía' },
    { cc: 'kz', en: 'Kazakhstan', es: 'Kazajistán' },
    { cc: 'ru', en: 'Russia', es: 'Rusia' },
    { cc: 'br', en: 'Brazil', es: 'Brasil' },
    { cc: 'de', en: 'Germany', es: 'Alemania' },
    { cc: 'pl', en: 'Poland', es: 'Polonia' },
    { cc: 'gb', en: 'United Kingdom', es: 'Reino Unido' },
    { cc: 'mx', en: 'Mexico', es: 'México' },
    { cc: 'cl', en: 'Chile', es: 'Chile' },
    { cc: 'co', en: 'Colombia', es: 'Colombia' },
    { cc: 'pe', en: 'Peru', es: 'Perú' },
    { cc: 'in', en: 'India', es: 'India' },
    { cc: 'cn', en: 'China', es: 'China' },
    { cc: 'jp', en: 'Japan', es: 'Japón' },
    { cc: 'id', en: 'Indonesia', es: 'Indonesia' },
    { cc: 'ph', en: 'Philippines', es: 'Filipinas' },
    { cc: 'za', en: 'South Africa', es: 'Sudáfrica' },
    { cc: 'ca', en: 'Canada', es: 'Canadá' },
  ]

  const DEFAULTS = Object.freeze({
    p2pAds: 5,
    p2pSide: 'BUY',
    hkCardPriceUsdt: 0,
    sellerSurchargePct: 0,
    uahPerHkdManual: 0,
    regions: Object.freeze(['us', 'hk', 'ar', 'tr', 'kz', 'ru', 'br', 'de', 'pl']),
    storeInUah: true,
    listTags: true,
    regionCompare: true,
    suggestCards: false,
    lang: 'en',
  })

  // Steam Hong Kong gift card denominations, in HK$.
  const HK_DENOMINATIONS = Object.freeze([40, 50, 80, 100, 200, 300, 400, 500, 600, 750, 1000])

  const CACHE_MS = Object.freeze({
    p2p: 5 * MIN,
    fx: 6 * HOUR,
    price: 30 * MIN,
    region: 6 * HOUR,
  })

  // From this age on the UI warns that a rate is old.
  const STALE_MS = Object.freeze({
    p2p: 30 * MIN,
    fx: 36 * HOUR,
  })

  const num = (v, fallback) => {
    const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

  // Returns complete, valid settings from whatever was stored.
  function normalizeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {}
    const known = new Set(REGIONS.map((x) => x.cc))
    const regions = Array.isArray(r.regions)
      ? [...new Set(r.regions.map((x) => String(x).toLowerCase()).filter((x) => known.has(x)))]
      : [...DEFAULTS.regions]
    const bool = (v, d) => (typeof v === 'boolean' ? v : d)
    return {
      p2pAds: clamp(Math.round(num(r.p2pAds, DEFAULTS.p2pAds)), 1, 20),
      p2pSide: r.p2pSide === 'SELL' ? 'SELL' : 'BUY',
      hkCardPriceUsdt: clamp(num(r.hkCardPriceUsdt, 0), 0, 1000),
      sellerSurchargePct: clamp(num(r.sellerSurchargePct, 0), 0, 100),
      uahPerHkdManual: clamp(num(r.uahPerHkdManual, 0), 0, 1000),
      regions,
      storeInUah: bool(r.storeInUah, DEFAULTS.storeInUah),
      listTags: bool(r.listTags, DEFAULTS.listTags),
      regionCompare: bool(r.regionCompare, DEFAULTS.regionCompare),
      suggestCards: bool(r.suggestCards, DEFAULTS.suggestCards),
      lang: UG.i18n?.LANGUAGES.includes(r.lang) ? r.lang : DEFAULTS.lang,
    }
  }

  // Name of a region in the current UI language.
  const regionName = (cc) => {
    const region = REGIONS.find((r) => r.cc === cc)
    return region ? region[UG.i18n?.lang ?? 'en'] ?? region.en : cc.toUpperCase()
  }

  UG.config = { REGIONS, DEFAULTS, HK_DENOMINATIONS, CACHE_MS, STALE_MS, normalizeSettings, regionName }
})()
