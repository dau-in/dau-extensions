// Content script de store.steampowered.com: detecta ediciones y precios,
// pide los datos al service worker y monta la UI en Shadow DOM.
;(async () => {
  const UG = globalThis.UG
  const { detect, render } = UG
  if (window.top !== window || document.documentElement.hasAttribute('data-ug-ext')) return
  document.documentElement.setAttribute('data-ug-ext', '')

  let alive = true
  async function send(type, payload = {}) {
    let r
    try {
      r = await chrome.runtime.sendMessage({ type, ...payload })
    } catch {
      alive = false
      throw new Error('La extensión se actualizó. Recarga la página.')
    }
    if (!r?.ok) throw Object.assign(new Error(r?.error ?? 'Error'), { source: r?.source })
    return r.data
  }

  // ---- Fuente y estilos --------------------------------------------------------

  const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF'
  if (!document.getElementById('ug-fonts')) {
    const face = (file, range) =>
      `@font-face{font-family:"UG Martian Mono";src:url("${chrome.runtime.getURL(`fonts/${file}`)}") format("woff2");font-weight:100 800;font-stretch:75% 112.5%;font-display:swap;unicode-range:${range}}`
    const style = document.createElement('style')
    style.id = 'ug-fonts'
    style.textContent = face('martian-mono-latin.woff2', LATIN) + face('martian-mono-latin-ext.woff2', LATIN_EXT)
    ;(document.head ?? document.documentElement).append(style)
  }

  const sheet = new CSSStyleSheet()
  sheet.replaceSync(await send('styles:get'))

  let settings = await send('settings:get')
  let list = await send('list:get')
  let ratesState = null
  let ratesLoading = null

  // again: volver a preguntar al service worker, que usa su caché si sigue valiendo.
  // force: saltarse la caché y pedir las tasas a la red.
  function loadRates({ force = false, again = false } = {}) {
    if (force || again || !ratesLoading) ratesLoading = send('rates:get', { force }).then((r) => (ratesState = r))
    return ratesLoading
  }

  function mount(place) {
    const host = document.createElement(detect.HOST_TAG)
    const root = host.attachShadow({ mode: 'open' })
    root.adoptedStyleSheets = [sheet]
    place(host)
    return { host, root }
  }

  const inList = (key) => list.some((i) => i.key === key)

  // ---- Tickets de la ficha ---------------------------------------------------------

  const page = detect.pageInfo(location.href)
  const tickets = []

  function ticketModel(t) {
    const key = `${t.item.type}:${t.item.id}`
    return {
      item: t.item,
      status: t.status,
      price: t.price,
      ratesState,
      settings,
      inList: inList(key),
      onToggleList: async (button) => {
        button.disabled = true
        try {
          if (inList(key)) list = await send('list:remove', { key })
          else
            list = await send('list:add', {
              item: { ...t.item, url: t.item.appId ? `https://store.steampowered.com/app/${t.item.appId}/` : location.href.split('?')[0], lastUah: t.price ? t.price.final / 100 : null },
            })
          button.setAttribute('aria-pressed', String(inList(key)))
        } catch {
          // Si la extensión se recargó, el botón queda como estaba.
        } finally {
          button.disabled = false
          button.focus()
        }
      },
      onRetry: () => loadTicketPrices([t], true),
      onRetryRates: async () => {
        await loadRates({ force: true }).catch(() => null)
        renderAll()
      },
      onOpenOptions: () => send('options:open').catch(() => null),
      loadRegions: () => send('regions:get', { item: { type: t.item.type, id: t.item.id } }),
    }
  }

  function renderTicket(t) {
    t.root.replaceChildren(render.ticket(ticketModel(t)))
  }

  function resolve(t, prices) {
    if (t.pagePrice) {
      t.status = 'priced'
      t.price = t.pagePrice
      return
    }
    const r = prices[`${t.item.type}:${t.item.id}`]
    const app = page.kind === 'app' ? prices[`app:${page.id}`] : null
    if (!r || r.status === 'error') t.status = 'error'
    else if (r.status === 'priced' && r.currency === 'UAH') {
      t.status = r.final === 0 ? 'free' : 'priced'
      t.price = { final: r.final, initial: r.initial, discountPercent: r.discountPercent }
    } else if (r.status === 'free') t.status = 'free'
    else if (app?.status === 'unavailable' || (t.item.type === 'app' && r.status === 'unavailable')) t.status = 'unavailable'
    else t.status = 'nodata'
  }

  async function loadTicketPrices(list_, force = false) {
    const need = list_.filter((t) => !t.pagePrice)
    for (const t of list_) {
      t.status = 'loading'
      renderTicket(t)
    }
    const items = need.map((t) => ({ type: t.item.type, id: t.item.id }))
    if (page.kind === 'app' && need.length) items.push({ type: 'app', id: page.id })
    const [prices] = await Promise.all([
      items.length ? send('prices:get', { items, force }).catch(() => ({})) : {},
      loadRates({ force }).catch(() => null),
    ])
    for (const t of list_) {
      resolve(t, prices)
      renderTicket(t)
    }
  }

  function setupTickets() {
    const blocks = detect.purchaseBlocks(document)
    const appId = page.kind === 'app' ? page.id : null
    for (const b of blocks) {
      const { root } = mount((host) => b.anchor.after(host))
      tickets.push({
        root,
        item: { type: b.type, id: b.id, appId, name: b.name, edition: b.edition, months: b.months },
        pagePrice: b.pagePrice,
        status: 'loading',
        price: null,
      })
    }
    // Ficha sin ediciones comprables: gratis, no disponible o próximamente.
    if (!blocks.length && page.kind === 'app') {
      const area = document.querySelector('#game_area_purchase, .game_area_purchase')
      const before = document.querySelector('#game_area_description')
      if (!area && !before) return
      const { root } = mount((host) => (area ? area.prepend(host) : before.before(host)))
      tickets.push({
        root,
        item: { type: 'app', id: page.id, appId: page.id, name: detect.appName(document) || `App ${page.id}`, edition: '' },
        pagePrice: null,
        status: 'loading',
        price: null,
      })
    }
    if (tickets.length) loadTicketPrices(tickets)
  }

  // ---- Talones de las listas -----------------------------------------------------------

  const stubs = []

  function showTip(s) {
    if (s.tip?.isConnected && !s.tip.matches(':popover-open')) {
      for (const o of stubs) if (o !== s && o.tip?.matches(':popover-open')) o.tip.hidePopover()
      s.tip.showPopover()
    }
  }
  const hideTip = (s) => s.tip?.isConnected && s.tip.matches(':popover-open') && s.tip.hidePopover()

  function renderStub(s) {
    const r = render.stub({ title: s.title, status: s.status, uah: s.uah, ratesState })
    if (!r.el) {
      s.host.hidden = true
      return
    }
    s.host.hidden = false
    s.root.replaceChildren(r.el)
    s.tip = r.tip
    if (r.anchor && r.tip) {
      r.anchor.addEventListener('mouseenter', () => showTip(s))
      r.anchor.addEventListener('mouseleave', () => hideTip(s))
    }
  }

  async function scanLists() {
    if (!settings.listTags || !alive) return
    const found = detect.listItems(document)
    if (!found.length) return
    const fresh = []
    for (const f of found) {
      f.el.setAttribute(detect.DONE_ATTR, '')
      const { host, root } = mount((h) => (f.place === 'append' ? f.anchor.append(h) : f.anchor.after(h)))
      // Alineado a la derecha: en la búsqueda la columna de precio mide ~34 px
      // y el talón tiene que crecer hacia la izquierda, no salirse de la fila.
      host.style.cssText = 'display:flex;justify-content:flex-end;margin-top:4px;line-height:0'
      const s = { host, root, el: f.el, title: f.title, type: f.type, id: f.id, status: 'loading', uah: null, tip: null, listeners: new AbortController() }
      if (f.pagePrice) {
        s.status = 'priced'
        s.uah = f.pagePrice.final / 100
      }
      // Teclado: enfocar la fila muestra el detalle.
      const { signal } = s.listeners
      f.el.addEventListener('focusin', () => f.el.matches(':focus-visible') && showTip(s), { signal })
      f.el.addEventListener('focusout', () => hideTip(s), { signal })
      stubs.push(s)
      fresh.push(s)
    }
    const need = fresh.filter((s) => s.status === 'loading')
    const [prices] = await Promise.all([
      need.length ? send('prices:get', { items: need.map((s) => ({ type: s.type, id: s.id })) }).catch(() => ({})) : {},
      loadRates().catch(() => null),
    ])
    for (const s of fresh) {
      if (s.status === 'loading') {
        const r = prices[`${s.type}:${s.id}`]
        if (r?.status === 'priced' && r.currency === 'UAH' && r.final > 0) {
          s.status = 'priced'
          s.uah = r.final / 100
        } else if (r?.status === 'unavailable' && s.type === 'app') s.status = 'unavailable'
        else s.status = 'none'
      }
      renderStub(s)
    }
  }

  function clearStubs() {
    for (const s of stubs) {
      s.listeners.abort()
      s.host.remove()
      s.el.removeAttribute(detect.DONE_ATTR)
    }
    stubs.length = 0
  }

  // ---- Arranque y cambios ----------------------------------------------------------------

  function renderAll() {
    for (const t of tickets) if (t.status !== 'loading') renderTicket(t)
    for (const s of stubs) renderStub(s)
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') stubs.forEach(hideTip)
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !alive) return
    if (changes.list) {
      list = Array.isArray(changes.list.newValue) ? changes.list.newValue : []
      for (const t of tickets) {
        const btn = t.root.querySelector('.ug-btn[aria-pressed]')
        if (btn) btn.setAttribute('aria-pressed', String(inList(`${t.item.type}:${t.item.id}`)))
      }
    }
    if (changes.settings) {
      settings = UG.config.normalizeSettings(changes.settings.newValue)
      loadRates({ again: true })
        .catch(() => null)
        .then(() => {
          renderAll()
          if (!settings.listTags) clearStubs()
          else scanLists()
        })
    }
  })

  setupTickets()
  scanLists()

  let timer = null
  new MutationObserver((records) => {
    if (!settings.listTags || !alive) return
    if (records.every((r) => [...r.addedNodes].every((n) => n.nodeName === detect.HOST_TAG.toUpperCase()))) return
    clearTimeout(timer)
    timer = setTimeout(scanLists, 300)
  }).observe(document.body, { childList: true, subtree: true })
})()
