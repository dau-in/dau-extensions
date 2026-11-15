// What is on the Steam page: purchasable editions and prices in lists.
// Only reads the DOM, never changes it. When Steam changes its HTML, fix it here.
;(() => {
  const UG = (globalThis.UG ??= {})

  const HOST_TAG = 'ug-extension-ui'
  const DONE_ATTR = 'data-ug-done'

  // /app/1245620/ELDEN_RING/ → { kind: 'app', id: 1245620 }
  function pageInfo(url) {
    const m = new URL(url).pathname.match(/^\/(app|sub|bundle)\/(\d+)/)
    return m ? { kind: m[1], id: Number(m[2]) } : { kind: 'other', id: null }
  }

  const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

  // "Comprar «ELDEN RING»" / "Buy ELDEN RING" / "Pre-Purchase X" → clean name.
  function cleanTitle(raw) {
    // Bundles carry a label with a tooltip: "Portal Bundle BUNDLE (?)".
    const t = (raw ?? '').replace(/\s+/g, ' ').replace(/\s*\b(bundle|paquete|lote)\s*\(\?\)\s*$/i, '').trim()
    const quoted = t.match(/[«"“„]([^»"”]+)[»"”]/)
    if (quoted) return quoted[1].trim()
    return t
      .replace(/^(subscribe to|suscr[ií]bete a|suscribirse a|buy|comprar|pre-?purchase|precomprar|reservar|pre-?order|play|jugar a|jugar)\s+/i, '')
      .trim()
  }

  // Subscription: "259₴ / month", "auto-renewed every 1 month(s)". Returns the
  // months between charges, or null if the block is not a subscription.
  // The class alone is not enough: Steam also uses
  // game_area_purchase_game_dropdown_subscription for bundles.
  const BILLING = /(?:every|cada)\s+\d+\s*(?:month|mes|year|año)|\/\s*(?:month|mes|year|año)\b|\bper (?:month|year)\b|\bal mes\b|\bevery month\b|auto[- ]?renew/i
  function subscriptionMonths(block) {
    const note = block.querySelector('.game_purchase_subscription')
    if (!note && !/subscription/.test(block.className)) return null
    const t = text(note ?? block)
    if (!note && !BILLING.test(t)) return null
    const m = t.match(/(?:every|cada)\s+(\d+)\s*(?:month|mes)/i)
    if (m) return Number(m[1])
    if (/\b(year|año)\b/i.test(t)) return 12
    return 1
  }

  // "Incluye 3 juegos" (includes 3 games) from the package contents list.
  function includesNote(block) {
    // Unique ids: Steam can repeat links (capsules plus the text list).
    const ids = new Set()
    for (const a of block.querySelectorAll('.package_contents a[href*="/app/"]')) {
      const m = a.getAttribute('href').match(/\/app\/(\d+)/)
      if (m) ids.add(m[1])
    }
    return ids.size > 1 ? `@includes:${ids.size}` : ''
  }

  // Name of the game on the page.
  function appName(doc) {
    return text(doc.querySelector('#appHubAppName, .apphub_AppName')) || cleanTitle(text(doc.querySelector('.page_title_area h2, .pageheader')))
  }

  // Edition from the block title and the game name. Returns null when the
  // block is something else, such as a package with other games.
  function editionFrom(title, name) {
    if (!name) return null
    if (title === name) return '@base'
    if (title.toLowerCase().startsWith(name.toLowerCase())) {
      const rest = title.slice(name.length).replace(/^[\s:–—-]+/, '').trim()
      return rest || '@base'
    }
    return null
  }

  // Editions are stored in a language-neutral form and translated when drawn,
  // so switching the language does not need a page reload.
  const periodText = (months) => `@months:${months}`

  // Price shown on the page, only when it is in hryvnias.
  function readPagePrice(scope) {
    const priceEl =
      scope.querySelector('.discount_block[data-price-final]') ??
      scope.querySelector('.game_purchase_price[data-price-final]') ??
      scope.querySelector('[data-price-final]')
    if (!priceEl) {
      // DLC without a discount: the price is plain text, "159₴".
      const uah = UG.calc.parseUahText(text(scope.querySelector('.game_area_dlc_price') ?? scope))
      return uah != null ? { currency: 'UAH', final: Math.round(uah * 100), initial: Math.round(uah * 100), discountPercent: 0 } : null
    }
    const label = text(priceEl.querySelector('.discount_final_price') ?? priceEl)
    if (!label.includes('₴')) return null
    const final = Number(priceEl.getAttribute('data-price-final'))
    if (!Number.isFinite(final)) return null
    const originalUah = UG.calc.parseUahText(text(scope.querySelector('.discount_original_price')))
    const discount = Number(priceEl.getAttribute('data-discount')) || 0
    return {
      currency: 'UAH',
      final,
      initial: originalUah != null ? Math.round(originalUah * 100) : final,
      discountPercent: discount,
    }
  }

  // Purchasable editions on a game page (game, package or bundle).
  function purchaseBlocks(doc) {
    const name = appName(doc)
    const out = []
    for (const block of doc.querySelectorAll('.game_area_purchase_game')) {
      const sub = block.querySelector('input[name="subid"]')?.value
      const bundle = block.querySelector('input[name="bundleid"]')?.value
      const id = Number(sub ?? bundle)
      if (!Number.isInteger(id) || id <= 0) continue
      const title = cleanTitle(text(block.querySelector('h1, h2, .title')))
      const months = subscriptionMonths(block)
      const edition = editionFrom(title, name)
      out.push({
        block,
        anchor: block.closest('.game_area_purchase_game_wrapper') ?? block,
        type: sub ? 'sub' : 'bundle',
        id,
        title,
        // An edition of the game takes the game's name; a package with other
        // games or a subscription takes its own title.
        name: edition != null && !months ? name : title,
        edition: months ? periodText(months) : (edition ?? includesNote(block)),
        months,
        pagePrice: readPagePrice(block),
      })
    }
    return out
  }

  const KEY_ATTRS = '[data-ds-itemkey], [data-ds-appid], [data-ds-packageid], [data-ds-bundleid]'

  // App_620 / Sub_440408 / Bundle_232, or the loose data-ds-* attributes.
  function itemOf(el) {
    const key = el.getAttribute('data-ds-itemkey')
    const m = key?.match(/^(App|Sub|Bundle)_(\d+)$/)
    if (m) return { type: { App: 'app', Sub: 'sub', Bundle: 'bundle' }[m[1]], id: Number(m[2]) }
    const one = (attr) => {
      const v = el.getAttribute(attr)
      return v && /^\d+$/.test(v) ? Number(v) : null
    }
    if (one('data-ds-bundleid')) return { type: 'bundle', id: one('data-ds-bundleid') }
    if (one('data-ds-packageid')) return { type: 'sub', id: one('data-ds-packageid') }
    if (one('data-ds-appid')) return { type: 'app', id: one('data-ds-appid') }
    return null
  }

  // List items with a price (search, specials, DLC, front page).
  function listItems(root) {
    const out = []
    for (const priceEl of root.querySelectorAll('.discount_final_price, .game_area_dlc_price')) {
      if (priceEl.closest(HOST_TAG) || priceEl.closest('.game_area_purchase_game')) continue
      // A discounted DLC is already counted through its .discount_final_price.
      const plainDlc = priceEl.matches('.game_area_dlc_price')
      if (plainDlc && priceEl.querySelector('.discount_final_price')) continue
      const el = priceEl.closest(KEY_ATTRS)
      if (!el || el.hasAttribute(DONE_ATTR)) continue
      const item = itemOf(el)
      if (!item) continue
      const block = priceEl.closest('.discount_block') ?? priceEl
      const attr = block.getAttribute('data-price-final') ?? el.getAttribute('data-price-final')
      if (attr != null && Number(attr) === 0) continue // free: no stub
      if (attr == null && !/\d/.test(text(priceEl))) continue // "Gratis", "Free"
      const title = text(el.querySelector('.title, .tab_item_name, .game_area_dlc_name, .search_name .title')) || ''
      out.push({
        el,
        anchor: block,
        // In a DLC row the stub goes inside the price column, below the price.
        place: plainDlc ? 'append' : 'after',
        ...item,
        title,
        pagePrice: readPagePrice(plainDlc ? el : (block.parentElement ?? block)),
      })
    }
    // An item can have more than one price: the first one wins.
    const seen = new Set()
    return out.filter((i) => (seen.has(i.el) ? false : seen.add(i.el)))
  }

  UG.detect = { HOST_TAG, DONE_ATTR, pageInfo, cleanTitle, appName, editionFrom, subscriptionMonths, readPagePrice, purchaseBlocks, itemOf, listItems }
})()
