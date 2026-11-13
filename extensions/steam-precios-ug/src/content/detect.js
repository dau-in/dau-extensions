// Qué hay en la página de Steam: ediciones comprables y precios en listas.
// Solo lee el DOM; no lo cambia. Si Steam cambia su HTML, el arreglo va aquí.
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

  // "Comprar «ELDEN RING»" · "Buy ELDEN RING" · "Pre-Purchase X" → nombre limpio.
  function cleanTitle(raw) {
    // Los bundles traen una etiqueta con tooltip: "Portal Bundle BUNDLE (?)".
    const t = (raw ?? '').replace(/\s+/g, ' ').replace(/\s*\b(bundle|paquete|lote)\s*\(\?\)\s*$/i, '').trim()
    const quoted = t.match(/[«"“„]([^»"”]+)[»"”]/)
    if (quoted) return quoted[1].trim()
    return t
      .replace(/^(subscribe to|suscr[ií]bete a|suscribirse a|buy|comprar|pre-?purchase|precomprar|reservar|pre-?order|play|jugar a|jugar)\s+/i, '')
      .trim()
  }

  // Suscripción: "259₴ / month", "auto-renewed every 1 month(s)". Devuelve los
  // meses de cada cobro, o null si el bloque no es una suscripción.
  function subscriptionMonths(block) {
    const note = block.querySelector('.game_purchase_subscription')
    if (!note && !/subscription/.test(block.className)) return null
    const t = text(note ?? block)
    const m = t.match(/(?:every|cada)\s+(\d+)\s*(?:month|mes)/i)
    if (m) return Number(m[1])
    if (/\b(year|año)\b/i.test(t)) return 12
    return 1
  }

  // "Incluye 3 juegos" a partir de la lista de contenido del paquete.
  function includesNote(block) {
    // Ids únicos: Steam puede repetir enlaces (lista recortada y completa).
    const ids = new Set()
    for (const a of block.querySelectorAll('.package_contents a[href*="/app/"]')) {
      const m = a.getAttribute('href').match(/\/app\/(\d+)/)
      if (m) ids.add(m[1])
    }
    return ids.size > 1 ? `Incluye ${ids.size} juegos` : ''
  }

  // Nombre del juego de la ficha.
  function appName(doc) {
    return text(doc.querySelector('#appHubAppName, .apphub_AppName')) || cleanTitle(text(doc.querySelector('.page_title_area h2, .pageheader')))
  }

  // Edición a partir del título del bloque y del nombre del juego. Devuelve
  // null si el bloque es otra cosa, como un paquete con otros juegos.
  function editionFrom(title, name) {
    if (!name) return null
    if (title === name) return 'Juego base'
    if (title.toLowerCase().startsWith(name.toLowerCase())) {
      const rest = title.slice(name.length).replace(/^[\s:–—-]+/, '').trim()
      return rest || 'Juego base'
    }
    return null
  }

  const periodText = (months) => (months === 1 ? 'Suscripción mensual' : months === 12 ? 'Suscripción anual' : `Suscripción cada ${months} meses`)

  // Precio que muestra la página, solo si está en grivnas.
  function readPagePrice(scope) {
    const priceEl =
      scope.querySelector('.discount_block[data-price-final]') ??
      scope.querySelector('.game_purchase_price[data-price-final]') ??
      scope.querySelector('[data-price-final]')
    if (!priceEl) {
      // DLC sin descuento: el precio va como texto suelto, "159₴".
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

  // Ediciones comprables de una ficha (juego, paquete o bundle).
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
        // Una edición del juego lleva el nombre del juego; un paquete con otros
        // juegos o una suscripción lleva su propio título.
        name: edition != null && !months ? name : title,
        edition: months ? periodText(months) : (edition ?? includesNote(block)),
        months,
        pagePrice: readPagePrice(block),
      })
    }
    return out
  }

  const KEY_ATTRS = '[data-ds-itemkey], [data-ds-appid], [data-ds-packageid], [data-ds-bundleid]'

  // App_620 · Sub_440408 · Bundle_232, o los data-ds-* sueltos.
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

  // Elementos de lista con precio (búsqueda, ofertas, DLC, portada).
  function listItems(root) {
    const out = []
    for (const priceEl of root.querySelectorAll('.discount_final_price, .game_area_dlc_price')) {
      if (priceEl.closest(HOST_TAG) || priceEl.closest('.game_area_purchase_game')) continue
      // Un DLC con descuento ya se cuenta por su .discount_final_price.
      const plainDlc = priceEl.matches('.game_area_dlc_price')
      if (plainDlc && priceEl.querySelector('.discount_final_price')) continue
      const el = priceEl.closest(KEY_ATTRS)
      if (!el || el.hasAttribute(DONE_ATTR)) continue
      const item = itemOf(el)
      if (!item) continue
      const block = priceEl.closest('.discount_block') ?? priceEl
      const attr = block.getAttribute('data-price-final') ?? el.getAttribute('data-price-final')
      if (attr != null && Number(attr) === 0) continue // gratis: sin talón
      if (attr == null && !/\d/.test(text(priceEl))) continue // "Gratis", "Free"
      const title = text(el.querySelector('.title, .tab_item_name, .game_area_dlc_name, .search_name .title')) || ''
      out.push({
        el,
        anchor: block,
        // En la fila de DLC el talón va dentro de la columna de precio, debajo.
        place: plainDlc ? 'append' : 'after',
        ...item,
        title,
        pagePrice: readPagePrice(plainDlc ? el : (block.parentElement ?? block)),
      })
    }
    // Un elemento puede tener más de un precio: se usa el primero.
    const seen = new Set()
    return out.filter((i) => (seen.has(i.el) ? false : seen.add(i.el)))
  }

  UG.detect = { HOST_TAG, DONE_ATTR, pageInfo, cleanTitle, appName, editionFrom, subscriptionMonths, readPagePrice, purchaseBlocks, itemOf, listItems }
})()
