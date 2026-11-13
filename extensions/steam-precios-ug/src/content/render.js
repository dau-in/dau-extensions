// Builds the ticket on the game page and the stub in lists. Every piece of
// text that comes from the page goes in with textContent, never as HTML.
;(() => {
  const UG = (globalThis.UG ??= {})
  const { calc, icons, config } = UG

  // ---- DOM ------------------------------------------------------------------

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs ?? {})) {
      if (v == null || v === false) continue
      if (k === 'class') el.className = v
      else if (k === 'text') el.textContent = v
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
      else el.setAttribute(k, v === true ? '' : String(v))
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue
      el.append(c instanceof Node ? c : document.createTextNode(String(c)))
    }
    return el
  }

  // The extension's own fixed markup (SVG), never page data.
  function svg(markup) {
    const t = document.createElement('template')
    t.innerHTML = markup.trim()
    return t.content.firstElementChild
  }

  const icon = (name, when) => svg(icons.icon(name, when))

  const line = ({ n = '', label, note, amount, cls = '' }) =>
    h('li', { class: `ug-line ${cls}`.trim() }, h('span', { class: 'ug-n', text: n }), h('span', { class: 'ug-desc' }, h('span', { text: label }), note ? h('small', { text: note }) : null), h('span', { class: 'ug-amt', text: amount }))

  function notice(kind, iconName, title, detail, action) {
    return h(
      'div',
      { class: `ug-notice ug-notice--${kind}` },
      icon(iconName),
      h('div', { class: 'ug-notice__body' }, h('strong', { text: title }), detail ? h('span', { text: detail }) : null),
      action ?? null,
    )
  }

  const retryButton = (onclick, label = 'Reintentar') =>
    h('button', { class: 'ug-btn ug-btn--sm ug-btn--outline', type: 'button', onclick }, icon('refresh'), label)

  // ---- Rates: state and notices --------------------------------------------------

  // From the rates:get response: derived rates and notices.
  function ratesView(state) {
    const fx = state?.fx
    const p2p = state?.p2p
    const rates = calc.deriveRates({ fx: fx?.rates, p2p: p2p?.price, settings: state?.settings })
    const now = Date.now()
    const p2pOld = p2p && (p2p.stale || now - p2p.fetchedAt > config.STALE_MS.p2p)
    const fxOld = fx && (fx.stale || now - fx.fetchedAt > config.STALE_MS.fx)
    return {
      rates,
      fxRates: fx?.rates ?? null,
      at: p2p?.fetchedAt ?? fx?.fetchedAt ?? null,
      p2p,
      fx,
      missingFx: !rates,
      missingP2p: Boolean(rates) && !rates.vesPerUsdt,
      p2pOld,
      fxOld,
    }
  }

  function ratesNotices(view, onRetry) {
    const out = []
    if (view.missingFx) {
      out.push(notice('error', 'alert', 'No se pudieron obtener las tasas de cambio.', 'Sin ellas solo se puede mostrar el precio en ₴. Revisa tu conexión y vuelve a intentarlo.', retryButton(onRetry)))
    } else if (view.missingP2p) {
      out.push(notice('error', 'alert', 'Binance P2P no respondió.', 'Sin su tasa no se puede calcular el precio en bolívares. Vuelve a intentarlo en un momento.', retryButton(onRetry)))
    } else if (view.p2pOld) {
      out.push(notice('warn', 'offline', `Tasa de Binance de ${calc.timeAgo(view.p2p.fetchedAt)}.`, view.p2p.stale ? 'No se pudo actualizar; las cifras usan la última tasa conocida.' : 'Las cifras pueden haber cambiado.', retryButton(onRetry, 'Actualizar')))
    } else if (view.fxOld) {
      out.push(notice('warn', 'offline', `Tasas de mercado de ${calc.timeAgo(view.fx.fetchedAt)}.`, 'No se pudieron actualizar; las cifras usan las últimas conocidas.', retryButton(onRetry, 'Actualizar')))
    }
    return out
  }

  // "al mes", "al año", "cada 3 meses" (per month, per year…) for subscriptions.
  const periodLabel = (months) => (months === 1 ? 'al mes' : months === 12 ? 'al año' : `cada ${months} meses`)

  // Lines 01–04 for a price in ₴. With months, the price is a subscription's.
  function conversionLines(uah, view, { numbered = true, months = null } = {}) {
    const c = calc.convertUah(uah, view.rates)
    const r = view.rates
    const n = (k) => (numbered ? k : '')
    const period = months ? periodLabel(months) : null
    const lines = [line({ n: n('01'), label: period ? `Precio ${period}` : 'Precio en Steam', note: 'Región Ucrania', amount: calc.formatUah(uah) })]
    if (!c) return { lines, conv: null }
    const hkNote = r.manualUahPerHkd ? `${calc.formatRate(r.uahPerHkd, 3)}₴ por HK$, a mano` : `${calc.formatRate(r.uahPerHkd, 3)}₴ por HK$`
    const usdtNote = r.manualCard
      ? `${calc.formatRate(r.usdtPerHkd, 4)} USDT por HK$, tarjeta real`
      : r.surchargePct
        ? `${calc.formatRate(r.usdtPerHkd, 4)} USDT por HK$, con ${calc.formatRate(r.surchargePct, 1).replace(/,0$/, '')} % de recargo`
        : `${calc.formatRate(r.usdtPerHkd, 4)} USDT por HK$`
    lines.push(line({ n: n('02'), label: 'Tarjeta Hong Kong', note: hkNote, amount: calc.formatHkd(c.hkd) }))
    lines.push(line({ n: n('03'), label: 'En Binance', note: usdtNote, amount: calc.formatUsdt(c.usdt) }))
    const totalLabel = period ? `Total ${period} en bolívares` : 'Total en bolívares'
    lines.push(
      c.ves != null
        ? line({ n: n('04'), label: totalLabel, note: `${calc.formatVes(r.vesPerUsdt)} por USDT`, amount: calc.formatVes(c.ves), cls: 'ug-line--total' })
        : line({ n: n('04'), label: totalLabel, note: 'Sin tasa de Binance', amount: '—', cls: 'ug-line--total ug-line--empty' }),
    )
    return { lines, conv: c }
  }

  function suggestionLine(hkd) {
    const s = calc.suggestCards(hkd)
    if (!s) return null
    const counts = new Map()
    for (const c of s.cards) counts.set(c, (counts.get(c) ?? 0) + 1)
    const text = [...counts].map(([d, k]) => (k > 1 ? `${k} × HK$ ${d}` : `HK$ ${d}`)).join(' + ')
    return h(
      'p',
      { class: 'ug-suggest' },
      'Tarjetas sugeridas: ',
      h('b', { text }),
      s.spare >= 0.01 ? ` (sobran ${calc.formatHkd(s.spare)})` : '',
    )
  }

  // ---- Region comparison ------------------------------------------------------------

  function regionsTable(result, { uaUah, uaFormatted }) {
    const { rows, uaUsd } = result
    const all = [...rows]
    if (uaUsd != null) all.push({ cc: 'ua', name: 'Ucrania', status: 'priced', local: uaFormatted, usd: uaUsd, delta: 0, self: true })
    all.sort((a, b) => (a.usd ?? Infinity) - (b.usd ?? Infinity))
    const statusText = { unavailable: 'No se vende', free: 'Gratis', error: 'Sin datos', unsupported: 'Sin datos' }
    const body = all.map((r) =>
      r.usd == null && !r.self
        ? h(
            'tr',
            { class: 'is-muted' },
            h('td', {}, h('span', { class: 'ug-code', text: r.cc.toUpperCase() })),
            h('th', { scope: 'row', text: r.name }),
            h('td', { class: 'ug-col-num', colspan: 3, text: r.status === 'priced' ? 'Sin tasa' : statusText[r.status] ?? 'Sin datos' }),
          )
        : h(
            'tr',
            { class: r.self ? 'is-self' : null },
            h('td', {}, h('span', { class: 'ug-code', text: r.cc.toUpperCase() })),
            h('th', { scope: 'row', text: r.name }),
            h('td', { class: 'ug-col-num ug-col-local', text: r.local ?? '' }),
            h('td', { class: 'ug-col-num', text: calc.formatUsd(r.usd) }),
            h('td', { class: 'ug-col-num', text: r.self ? 'base' : r.delta == null ? '—' : calc.formatPercent(r.delta) }),
          ),
    )
    return h(
      'div',
      {},
      h(
        'table',
        { class: 'ug-table' },
        h('caption', { class: 'ug-vh', text: 'Precio por región, de más barata a más cara' }),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col', text: 'Región' }),
            h('th', { scope: 'col' }, h('span', { class: 'ug-vh', text: 'Nombre' })),
            h('th', { scope: 'col', class: 'ug-col-num ug-col-local', text: 'Precio' }),
            h('th', { scope: 'col', class: 'ug-col-num', text: 'En USD' }),
            h('th', { scope: 'col', class: 'ug-col-num', text: uaUah != null ? 'Frente a UA' : '' }),
          ),
        ),
        h('tbody', {}, body),
      ),
      h('p', { class: 'ug-table__foot', text: 'Precios pasados a USD con la tasa de mercado. No incluye lo que cuesta comprar tarjetas de cada región.' }),
    )
  }

  function regionsHint(result) {
    const { cheaper, pricedCount, uaUsd, rows } = result
    if (uaUsd == null) {
      const best = rows.find((r) => r.usd != null)
      return best ? { good: false, text: `Desde ${calc.formatUsd(best.usd)} en ${best.name}` } : { good: false, text: 'Sin precio en otras regiones' }
    }
    if (!pricedCount) return { good: false, text: 'Sin precio en otras regiones' }
    if (!cheaper.length) return { good: true, text: `La más barata de ${pricedCount + 1} regiones` }
    if (cheaper.length === 1) {
      const r = cheaper[0]
      return { good: false, text: `${r.name} sale ${Math.abs(Math.round(r.delta))} % más barata` }
    }
    return { good: false, text: `${cheaper.length} regiones salen más baratas` }
  }

  function regionsBlock({ uaUah, uaFormatted, load, regionCount }) {
    const hint = h('span', { class: 'ug-regions__hint' }, `Compara con ${calc.pluralize(regionCount, 'región', 'regiones')}`)
    const body = h('div', { class: 'ug-regions__body', 'aria-live': 'polite' })
    const details = h('details', { class: 'ug-regions' }, h('summary', {}, h('span', { class: 'ug-regions__toggle' }, icon('chevron'), 'Comparar regiones'), hint), body)
    let state = 'idle'

    async function run() {
      state = 'loading'
      body.replaceChildren(h('ol', { class: 'ug-lines', 'aria-busy': 'true' }, [1, 2, 3].map(() => h('li', { class: 'ug-line' }, h('span'), h('span', { class: 'ug-skeleton' }), h('span', { class: 'ug-skeleton ug-skeleton--amt' })))), h('span', { class: 'ug-vh', text: 'Buscando precios en otras regiones…' }))
      try {
        const data = await load()
        const result = calc.compareRegions({ uaUah, entries: data.entries, fx: data.fx?.rates })
        const hv = regionsHint(result)
        hint.className = `ug-regions__hint${hv.good ? ' ug-regions__hint--good' : ''}`
        hint.replaceChildren(icon(hv.good ? 'checkCircle' : 'info'), hv.text)
        body.replaceChildren(regionsTable(result, { uaUah, uaFormatted }))
        state = 'ready'
      } catch (e) {
        state = 'idle'
        body.replaceChildren(notice('error', 'alert', 'No se pudieron cargar las otras regiones.', 'Steam no respondió. Vuelve a intentarlo en un momento.', retryButton(run)))
      }
    }

    details.addEventListener('toggle', () => {
      if (details.open && state === 'idle') run()
    })
    return details
  }

  // ---- Ticket on the game page -------------------------------------------------------

  // m: { item, status, price, ratesState, settings, inList, onToggleList,
  //      onRetry, onRetryRates, onOpenOptions, loadRegions }
  function ticket(m) {
    const view = ratesView(m.ratesState)
    const item = m.item
    // A game page can hold several purchasable blocks. Each one is its own
    // purchase, so every ticket says which one it is, and only the first keeps
    // the full letterhead: the rest use a shorter header.
    const many = (m.position?.total ?? 1) > 1
    const compact = many && m.position.index > 1
    const subtitle = item.months ? 'Suscripción en Steam Ucrania' : 'Ticket de compra en Steam Ucrania'
    const top = h(
      'div',
      { class: 'ug-paper ug-piece--top' },
      h(
        'header',
        { class: compact ? 'ug-head ug-head--compact' : 'ug-head' },
        svg(icons.emblem()),
        h('div', { class: 'ug-brand' }, h('span', { class: 'ug-brand__name', text: 'Ukrainian Gang Extension' }), h('span', { class: 'ug-brand__sub', text: many ? `Compra ${m.position.index} de ${m.position.total}` : subtitle })),
        h('div', { class: 'ug-meta' }, h('span', { class: 'ug-num', text: `Nº ${item.id}` }), compact ? null : h('span', { class: 'ug-num', text: view.at ? calc.formatDateTime(view.at) : 'Sin tasas' })),
      ),
      h('div', { class: 'ug-title' }, h('span', { class: 'ug-title__name', text: item.name }), item.edition ? h('span', { class: 'ug-title__ed', text: item.edition }) : null),
    )

    const bottom = h('div', { class: 'ug-paper ug-piece--bottom' }, svg(icons.emblem({ className: 'ug-watermark', ink: false })))
    const uah = m.price ? m.price.final / 100 : null
    // Subscriptions are not compared: each region has its own plans.
    const regionsAllowed = m.settings.regionCompare && item.type !== 'bundle' && !item.months && m.settings.regions.length > 0
    const regions = () =>
      regionsAllowed ? regionsBlock({ uaUah: m.status === 'priced' ? uah : null, uaFormatted: uah != null ? calc.formatUah(uah) : '', load: m.loadRegions, regionCount: m.settings.regions.length }) : null

    if (m.status === 'loading') {
      bottom.setAttribute('aria-busy', 'true')
      bottom.append(
        h('ol', { class: 'ug-lines' }, [1, 2, 3, 4].map(() => h('li', { class: 'ug-line' }, h('span'), h('span', { class: 'ug-skeleton' }), h('span', { class: 'ug-skeleton ug-skeleton--amt' })))),
        h('span', { class: 'ug-vh', text: 'Buscando el precio en Ucrania…' }),
      )
    } else if (m.status === 'error') {
      bottom.append(notice('error', 'alert', 'No se pudo obtener el precio en Ucrania.', 'Steam no respondió. Vuelve a intentarlo en un momento.', retryButton(m.onRetry)))
    } else if (m.status === 'free') {
      bottom.append(status('gift', 'Gratis en Steam Ucrania', 'No hace falta recargar saldo para esta edición.'))
    } else if (m.status === 'unavailable') {
      bottom.append(status('ban', 'No se vende en Steam Ucrania', 'Esta edición no está a la venta en la región Ucrania. Compara su precio en otras regiones.'))
      const r = regions()
      if (r) bottom.append(r)
    } else if (m.status === 'nodata') {
      bottom.append(
        status('info', 'Sin precio de Ucrania', 'Steam no da el precio de esta edición por su API. Con «Mostrar la tienda en ₴» encendido se lee de la página.'),
        h('div', {}, h('button', { class: 'ug-link', type: 'button', onclick: m.onOpenOptions }, 'Abrir los ajustes')),
      )
    } else {
      const lines = []
      if (m.price.discountPercent > 0 && m.price.initial > m.price.final) {
        lines.push(line({ label: 'Precio normal', amount: calc.formatUah(m.price.initial / 100), cls: 'ug-line--muted' }))
        lines.push(line({ label: `Descuento del ${m.price.discountPercent} %`, amount: calc.formatUah(-(m.price.initial - m.price.final) / 100), cls: 'ug-line--discount' }))
      }
      const { lines: conv, conv: c } = conversionLines(uah, view, { months: item.months })
      bottom.append(h('ol', { class: 'ug-lines', 'aria-label': 'De grivnas a bolívares' }, lines, conv))
      bottom.append(...ratesNotices(view, m.onRetryRates))
      if (m.settings.suggestCards && c) {
        const s = suggestionLine(c.hkd)
        if (s) bottom.append(s)
      }
      const r = regions()
      if (r) bottom.append(r)
      const button = h(
        'button',
        {
          class: 'ug-btn',
          type: 'button',
          'aria-pressed': String(Boolean(m.inList)),
          'aria-label': `Lista UG: ${[item.name, item.edition !== 'Juego base' ? item.edition : ''].filter(Boolean).join(', ')}`,
          onclick: () => m.onToggleList(button),
        },
        icon('plus', 'off'),
        icon('check', 'on'),
        'Lista UG',
      )
      bottom.append(
        h(
          'div',
          { class: 'ug-actions' },
          h('div', { class: 'ug-code-block' }, svg(icons.barcode(item.id)), h('span', { class: 'ug-barcode__digits', 'aria-hidden': 'true', text: String(item.id) })),
          button,
        ),
      )
    }

    return h('article', { class: 'ug-root ug-ticket ug-ticket-wrap', 'aria-label': `Ticket UG de ${item.name}` }, top, bottom)
  }

  function status(iconName, title, text) {
    return h('div', { class: 'ug-status' }, h('span', { class: 'ug-status__icon' }, icon(iconName)), h('div', { class: 'ug-status__text' }, h('strong', { text: title }), h('span', { text })))
  }

  // ---- Stub in lists ----------------------------------------------------------------------

  // m: { title, status, uah, ratesState }
  function stub(m) {
    const view = ratesView(m.ratesState)
    const wrap = h('span', { class: 'ug-root' })
    if (m.status === 'unavailable') {
      wrap.append(h('span', { class: 'ug-stub ug-stub--muted' }, h('span', { class: 'ug-paper ug-stub__paper' }, h('span', { class: 'ug-stub__mark' }, svg(icons.smallMark())), h('span', { class: 'ug-stub__v', text: 'No se vende en UA' }))))
      return { el: wrap, tip: null }
    }
    const c = calc.convertUah(m.uah, view.rates)
    if (!c) return { el: null, tip: null }
    const main = c.ves != null ? calc.formatVes(c.ves, 0) : calc.formatUsdt(c.usdt)
    const stubEl = h(
      'span',
      { class: 'ug-stub' },
      h(
        'span',
        { class: 'ug-paper ug-stub__paper', 'aria-hidden': 'true' },
        h('span', { class: 'ug-stub__mark' }, svg(icons.smallMark())),
        h('span', { class: 'ug-stub__v', text: main }),
        h('span', { class: 'ug-stub__v ug-stub__v--sub', text: calc.formatHkd(c.hkd, 0) }),
      ),
      h('span', { class: 'ug-vh', text: ` En Steam Ucrania: ${calc.formatUah(m.uah)}, unos ${main} o ${calc.formatHkd(c.hkd)}.` }),
    )
    const rows = [
      ['Precio en Steam Ucrania', calc.formatUah(m.uah)],
      ['Tarjeta Hong Kong', calc.formatHkd(c.hkd)],
      ['En Binance', calc.formatUsdt(c.usdt)],
    ]
    const tip = h(
      'div',
      { class: 'ug-paper ug-tip', popover: 'manual', role: 'tooltip' },
      m.title ? h('p', { class: 'ug-tip__title', text: m.title }) : null,
      h(
        'dl',
        {},
        rows.map(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]),
        h('dt', { text: 'Total en bolívares' }),
        h('dd', { class: 'ug-tip__total', text: c.ves != null ? calc.formatVes(c.ves) : 'Sin tasa' }),
      ),
      h('p', { class: 'ug-tip__foot', text: view.at ? `Tasas de ${calc.timeAgo(view.at)}` : '' }),
    )
    wrap.append(stubEl, tip)
    return { el: wrap, tip, anchor: stubEl }
  }

  UG.dom = { h, svg, icon, line, notice, retryButton }
  UG.render = { ratesView, ratesNotices, conversionLines, suggestionLine, regionsHint, ticket, stub }
})()
