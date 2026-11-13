// Ajustes, regiones y constantes. Sin DOM ni APIs del navegador: se carga en
// el service worker, el content script, el popup, los ajustes y en Node.
;(() => {
  const UG = (globalThis.UG ??= {})

  const MIN = 60 * 1000
  const HOUR = 60 * MIN

  const REGIONS = [
    { cc: 'us', name: 'Estados Unidos' },
    { cc: 'hk', name: 'Hong Kong' },
    { cc: 'ar', name: 'Argentina' },
    { cc: 'tr', name: 'Turquía' },
    { cc: 'kz', name: 'Kazajistán' },
    { cc: 'ru', name: 'Rusia' },
    { cc: 'br', name: 'Brasil' },
    { cc: 'de', name: 'Alemania' },
    { cc: 'pl', name: 'Polonia' },
    { cc: 'gb', name: 'Reino Unido' },
    { cc: 'mx', name: 'México' },
    { cc: 'cl', name: 'Chile' },
    { cc: 'co', name: 'Colombia' },
    { cc: 'pe', name: 'Perú' },
    { cc: 'in', name: 'India' },
    { cc: 'cn', name: 'China' },
    { cc: 'jp', name: 'Japón' },
    { cc: 'id', name: 'Indonesia' },
    { cc: 'ph', name: 'Filipinas' },
    { cc: 'za', name: 'Sudáfrica' },
    { cc: 'ca', name: 'Canadá' },
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
  })

  // Denominaciones de las tarjetas de Steam de Hong Kong, en HK$.
  const HK_DENOMINATIONS = Object.freeze([40, 50, 80, 100, 200, 300, 400, 500, 600, 750, 1000])

  const CACHE_MS = Object.freeze({
    p2p: 5 * MIN,
    fx: 6 * HOUR,
    price: 30 * MIN,
    region: 6 * HOUR,
  })

  // A partir de esta antigüedad la UI avisa de que una tasa es vieja.
  const STALE_MS = Object.freeze({
    p2p: 30 * MIN,
    fx: 36 * HOUR,
  })

  const num = (v, fallback) => {
    const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

  // Devuelve unos ajustes completos y válidos a partir de lo que haya guardado.
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
    }
  }

  const regionName = (cc) => REGIONS.find((r) => r.cc === cc)?.name ?? cc.toUpperCase()

  UG.config = { REGIONS, DEFAULTS, HK_DENOMINATIONS, CACHE_MS, STALE_MS, normalizeSettings, regionName }
})()
