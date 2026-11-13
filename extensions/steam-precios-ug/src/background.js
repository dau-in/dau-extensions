// Service worker: every network request, the cache, the Lista UG and the
// rule that adds ?cc=ua to the store.
importScripts('shared/config.js', 'shared/calc.js', 'shared/sources.js')

const { config, sources } = UG
const local = chrome.storage.local
const session = chrome.storage.session

const get = async (area, key) => (await area.get(key))[key]

async function getSettings() {
  return config.normalizeSettings(await get(local, 'settings'))
}

// ---- Network ------------------------------------------------------------------

async function fetchJson(source, url, init = {}) {
  let res
  try {
    res = await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000) })
  } catch (e) {
    throw new sources.SourceError(source, e?.name === 'TimeoutError' ? 'Timed out' : 'No connection')
  }
  if (!res.ok) throw new sources.SourceError(source, `HTTP ${res.status}`)
  try {
    return await res.json()
  } catch {
    throw new sources.SourceError(source, 'Invalid response')
  }
}

// Only one request in flight per key.
const inflight = new Map()
function once(key, fn) {
  if (!inflight.has(key)) inflight.set(key, fn().finally(() => inflight.delete(key)))
  return inflight.get(key)
}

// Runs tasks `limit` at a time.
async function pool(items, limit, fn) {
  const out = []
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const n = i++
      out[n] = await fn(items[n])
    }
  })
  await Promise.all(workers)
  return out
}

// ---- Rates --------------------------------------------------------------------

async function getP2P(settings, force) {
  const cached = await get(local, 'cache:p2p')
  const sameQuery = cached && cached.side === settings.p2pSide && cached.ads === settings.p2pAds
  if (!force && sameQuery && Date.now() - cached.fetchedAt < config.CACHE_MS.p2p) return { ...cached, stale: false }
  return once(`p2p:${settings.p2pSide}:${settings.p2pAds}`, async () => {
    try {
      const { url, init } = sources.p2pRequest({ side: settings.p2pSide, rows: Math.max(settings.p2pAds, 5) })
      const parsed = sources.parseP2P(await fetchJson('p2p', url, init), settings.p2pAds)
      const entry = { ...parsed, side: settings.p2pSide, ads: settings.p2pAds, fetchedAt: Date.now() }
      await local.set({ 'cache:p2p': entry })
      return { ...entry, stale: false }
    } catch (e) {
      if (cached) return { ...cached, stale: true, error: e.message }
      throw e
    }
  })
}

async function getFx(force) {
  const cached = await get(local, 'cache:fx')
  if (!force && cached && Date.now() - cached.fetchedAt < config.CACHE_MS.fx) return { ...cached, stale: false }
  return once('fx', async () => {
    let lastError
    for (const source of sources.FX_SOURCES) {
      try {
        const parsed = sources.parseFx(source, await fetchJson('fx', source.url))
        const entry = { ...parsed, fetchedAt: Date.now() }
        await local.set({ 'cache:fx': entry })
        return { ...entry, stale: false }
      } catch (e) {
        lastError = e
      }
    }
    if (cached) return { ...cached, stale: true, error: lastError?.message }
    throw lastError ?? new sources.SourceError('fx', 'No exchange rate source answered')
  })
}

async function getRates(force = false) {
  const settings = await getSettings()
  const [p2p, fx] = await Promise.allSettled([getP2P(settings, force), getFx(force)])
  return {
    settings,
    p2p: p2p.status === 'fulfilled' ? p2p.value : null,
    fx: fx.status === 'fulfilled' ? fx.value : null,
    errors: {
      p2p: p2p.status === 'rejected' ? p2p.reason?.message ?? 'Error' : null,
      fx: fx.status === 'rejected' ? fx.reason?.message ?? 'Error' : null,
    },
  }
}

// ---- Steam prices --------------------------------------------------------------

const priceKey = (cc, type, id) => `price:${cc}:${type}:${id}`

// items: [{ type: 'app' | 'sub' | 'bundle', id }] → { 'app:620': {...}, … }
async function getPrices(items, { cc = 'ua', force = false } = {}) {
  const ttl = cc === 'ua' ? config.CACHE_MS.price : config.CACHE_MS.region
  const unique = [...new Map(items.map((i) => [`${i.type}:${i.id}`, { type: i.type, id: Number(i.id) }])).values()].filter(
    (i) => ['app', 'sub', 'bundle'].includes(i.type) && Number.isInteger(i.id) && i.id > 0,
  )
  const keys = unique.map((i) => priceKey(cc, i.type, i.id))
  const cached = keys.length ? await session.get(keys) : {}
  const now = Date.now()
  const result = {}
  const missing = { app: [], sub: [], bundle: [] }
  for (const i of unique) {
    const c = cached[priceKey(cc, i.type, i.id)]
    if (!force && c && now - c.at < ttl) result[`${i.type}:${i.id}`] = c.data
    else missing[i.type].push(i.id)
  }

  const save = {}
  const put = (type, id, data) => {
    result[`${type}:${id}`] = data
    if (data.status !== 'error') save[priceKey(cc, type, id)] = { at: Date.now(), data }
  }
  const fail = (type, ids, e) => ids.forEach((id) => (result[`${type}:${id}`] = { status: 'error', message: e.message }))

  const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, k * n + n))

  await Promise.all([
    pool(chunks(missing.app, 25), 2, async (ids) => {
      try {
        const parsed = sources.parseAppDetails(await fetchJson('steam', sources.appDetailsUrl(ids, cc)), ids)
        for (const id of ids) put('app', id, parsed[id])
      } catch (e) {
        fail('app', ids, e)
      }
    }),
    pool(missing.sub, 3, async (id) => {
      try {
        put('sub', id, sources.parsePackage(await fetchJson('steam', sources.packageDetailsUrl(id, cc)), id))
      } catch (e) {
        fail('sub', [id], e)
      }
    }),
    cc === 'ua'
      ? pool(chunks(missing.bundle, 10), 2, async (ids) => {
          try {
            const parsed = sources.parseBundles(await fetchJson('steam', sources.bundlesUrl(ids, cc)), ids)
            for (const id of ids) put('bundle', id, parsed[id])
          } catch (e) {
            fail('bundle', ids, e)
          }
        })
      : Promise.resolve(missing.bundle.forEach((id) => put('bundle', id, { status: 'unsupported' }))),
  ])

  if (Object.keys(save).length) await session.set(save)
  return result
}

async function getRegionPrices({ type, id }) {
  const settings = await getSettings()
  const [fx, ...perRegion] = await Promise.all([
    getFx(false).catch(() => null),
    ...settings.regions.map(async (cc) => {
      const r = await getPrices([{ type, id }], { cc })
      // The region name goes last: package data carries its own name.
      return { ...r[`${type}:${id}`], cc, name: config.regionName(cc) }
    }),
  ])
  return { fx, entries: perRegion }
}

// ---- Lista UG ------------------------------------------------------------------------

async function getList() {
  const list = await get(local, 'list')
  return Array.isArray(list) ? list : []
}

async function setList(list) {
  await local.set({ list })
  await updateBadge(list)
  return list
}

async function updateBadge(list) {
  const list_ = list ?? (await getList())
  await chrome.action.setBadgeText({ text: list_.length ? String(list_.length) : '' })
  await chrome.action.setBadgeBackgroundColor({ color: '#2f4fb0' })
  await chrome.action.setBadgeTextColor?.({ color: '#ffffff' })
}

function cleanItem(raw) {
  const type = ['app', 'sub', 'bundle'].includes(raw?.type) ? raw.type : null
  const id = Number(raw?.id)
  if (!type || !Number.isInteger(id) || id <= 0) throw new Error('Invalid item')
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  return {
    key: `${type}:${id}`,
    type,
    id,
    appId: Number(raw.appId) || null,
    name: text(raw.name, 200) || `${type} ${id}`,
    edition: text(raw.edition, 200),
    months: Number.isInteger(raw.months) && raw.months > 0 ? raw.months : null,
    url: /^https:\/\/store\.steampowered\.com\//.test(raw.url ?? '') ? raw.url : null,
    lastUah: Number.isFinite(raw.lastUah) ? raw.lastUah : null,
    addedAt: Date.now(),
  }
}

// ---- Styles for the Shadow DOM ---------------------------------------------------------

let stylesText = null
async function getStyles() {
  if (!stylesText) stylesText = await (await fetch(chrome.runtime.getURL('src/shared/receipt.css'))).text()
  return stylesText
}

// ---- Store in ₴ (?cc=ua) ---------------------------------------------------------------

// Store pages only; never the API, the cart or the login page.
// One simple rule per section: a single regular expression covering all of
// them exceeds Chrome's memory limit for regex rules.
const STORE_PATHS = ['app/', 'sub/', 'bundle/', 'search/', 'specials', 'genre/', 'tags/', 'category/', 'publisher/', 'developer/', 'curator/', 'dlc/', 'explore/', 'charts/', 'sale/', 'franchise/']
const STORE_FILTERS = ['|https://store.steampowered.com/|', ...STORE_PATHS.map((p) => `|https://store.steampowered.com/${p}`)]
const RULE_IDS = STORE_FILTERS.map((_, i) => i + 1)

async function syncStoreRule(settings) {
  const s = settings ?? (await getSettings())
  const existing = (await chrome.declarativeNetRequest.getDynamicRules()).map((r) => r.id)
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [...new Set([...existing, ...RULE_IDS])],
    addRules: s.storeInUah
      ? STORE_FILTERS.map((urlFilter, i) => ({
          id: RULE_IDS[i],
          priority: 1,
          action: {
            type: 'redirect',
            redirect: { transform: { queryTransform: { addOrReplaceParams: [{ key: 'cc', value: 'ua' }] } } },
          },
          condition: { urlFilter, resourceTypes: ['main_frame'], requestMethods: ['get'] },
        }))
      : [],
  })
}

chrome.runtime.onInstalled.addListener(() => {
  syncStoreRule()
  updateBadge()
})
chrome.runtime.onStartup.addListener(() => {
  syncStoreRule()
  updateBadge()
})
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) syncStoreRule(config.normalizeSettings(changes.settings.newValue))
})

// ---- Messages --------------------------------------------------------------------------------

const handlers = {
  'rates:get': ({ force }) => getRates(Boolean(force)),
  'prices:get': ({ items, force }) => getPrices(Array.isArray(items) ? items : [], { force: Boolean(force) }),
  'regions:get': ({ item }) => getRegionPrices(item),
  'settings:get': () => getSettings(),
  'settings:set': async ({ settings }) => {
    const s = config.normalizeSettings(settings)
    await local.set({ settings: s })
    return s
  },
  'list:get': () => getList(),
  'list:add': async ({ item }) => {
    const clean = cleanItem(item)
    const list = await getList()
    if (list.some((i) => i.key === clean.key)) return list
    return setList([...list, clean])
  },
  'list:remove': async ({ key }) => setList((await getList()).filter((i) => i.key !== key)),
  'list:set': async ({ list }) => setList((Array.isArray(list) ? list : []).map((i) => ({ ...cleanItem(i), addedAt: i.addedAt ?? Date.now() }))),
  'list:update': async ({ key, lastUah }) => {
    const list = await getList()
    const i = list.find((x) => x.key === key)
    if (i && Number.isFinite(lastUah)) i.lastUah = lastUah
    return setList(list)
  },
  'styles:get': () => getStyles(),
  'options:open': () => chrome.runtime.openOptionsPage(),
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.type]
  if (!handler || sender.id !== chrome.runtime.id) return false
  Promise.resolve()
    .then(() => handler(msg))
    .then(
      (data) => sendResponse({ ok: true, data }),
      (e) => sendResponse({ ok: false, error: e?.message ?? String(e), source: e?.source ?? null }),
    )
  return true
})
