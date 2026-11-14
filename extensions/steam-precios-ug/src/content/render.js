// Builds the ticket on the game page and the stub in lists. Every piece of
// text that comes from the page goes in with textContent, never as HTML.
;(() => {
  const UG = (globalThis.UG ??= {})
  const { calc, icons, config } = UG
  const t = (key, vars) => UG.i18n.t(key, vars)

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

  const retryButton = (onclick, label = t('common.retry')) =>
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
      out.push(notice('error', 'alert', t('rates.noFx.title'), t('rates.noFx.detail'), retryButton(onRetry)))
    } else if (view.missingP2p) {
      out.push(notice('error', 'alert', t('rates.noP2p.title'), t('rates.noP2p.detail'), retryButton(onRetry)))
    } else if (view.p2pOld) {
      out.push(notice('warn', 'offline', t('rates.p2pOld.title', { ago: calc.timeAgo(view.p2p.fetchedAt) }), view.p2p.stale ? t('rates.p2pOld.stale') : t('rates.p2pOld.changed'), retryButton(onRetry, t('common.update'))))
    } else if (view.fxOld) {
      out.push(notice('warn', 'offline', t('rates.fxOld.title', { ago: calc.timeAgo(view.fx.fetchedAt) }), t('rates.fxOld.detail'), retryButton(onRetry, t('common.update'))))
    }
    return out
  }

  // "al mes", "al año", "cada 3 meses" (per month, per year…) for subscriptions.
  const periodLabel = (months) => (months === 1 ? t('period.month') : months === 12 ? t('period.year') : t('period.months', { n: months }))

  // Lines 01–04 for a price in ₴. With months, the price is a subscription's.
  function conversionLines(uah, view, { numbered = true, months = null } = {}) {
    const c = calc.convertUah(uah, view.rates)
    const r = view.rates
    const n = (k) => (numbered ? k : '')
    const period = months ? periodLabel(months) : null
    const lines = [line({ n: n('01'), label: period ? t('line.pricePeriod', { period }) : t('line.price'), note: t('line.region'), amount: calc.formatUah(uah) })]
    if (!c) return { lines, conv: null }
    const hkNote = r.manualUahPerHkd ? t('line.perHkdManual', { rate: calc.formatRate(r.uahPerHkd, 3) }) : t('line.perHkd', { rate: calc.formatRate(r.uahPerHkd, 3) })
    const usdtNote = r.manualCard
      ? t('line.perUsdtCard', { rate: calc.formatRate(r.usdtPerHkd, 4) })
      : r.surchargePct
        ? t('line.perUsdtSurcharge', { rate: calc.formatRate(r.usdtPerHkd, 4), pct: calc.formatRate(r.surchargePct, 1).replace(/[.,]0$/, '').replace(',', t('format.decimal')) })
        : t('line.perUsdt', { rate: calc.formatRate(r.usdtPerHkd, 4) })
    lines.push(line({ n: n('02'), label: t('line.hkCard'), note: hkNote, amount: calc.formatHkd(c.hkd) }))
    lines.push(line({ n: n('03'), label: t('line.binance'), note: usdtNote, amount: calc.formatUsdt(c.usdt) }))
    const totalLabel = period ? t('line.totalPeriod', { period }) : t('line.total')
    lines.push(
      c.ves != null
        ? line({ n: n('04'), label: totalLabel, note: t('line.perUsdtRate', { rate: calc.formatVes(r.vesPerUsdt) }), amount: calc.formatVes(c.ves), cls: 'ug-line--total' })
        : line({ n: n('04'), label: totalLabel, note: t('line.noP2p'), amount: '—', cls: 'ug-line--total ug-line--empty' }),
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
      t('suggest.label'),
      h('b', { text }),
      s.spare >= 0.01 ? t('suggest.spare', { amount: calc.formatHkd(s.spare) }) : '',
    )
  }

  // ---- Region comparison ------------------------------------------------------------

  // Region names come from config so they follow the UI language.
  const regionLabel = (r) => (r.cc === 'ua' ? t('regions.ua') : config.regionName(r.cc))

  function regionsTable(result, { uaUah, uaFormatted }) {
    const { rows, uaUsd } = result
    const all = [...rows]
    if (uaUsd != null) all.push({ cc: 'ua', name: t('regions.ua'), status: 'priced', local: uaFormatted, usd: uaUsd, delta: 0, self: true })
    all.sort((a, b) => (a.usd ?? Infinity) - (b.usd ?? Infinity))
    const statusText = { unavailable: t('regions.unavailable'), free: t('regions.free'), error: t('regions.nodata'), unsupported: t('regions.nodata') }
    const body = all.map((r) =>
      r.usd == null && !r.self
        ? h(
            'tr',
            { class: 'is-muted' },
            h('td', {}, h('span', { class: 'ug-code', text: r.cc.toUpperCase() })),
            h('th', { scope: 'row', text: regionLabel(r) }),
            h('td', { class: 'ug-col-num', colspan: 3, text: r.status === 'priced' ? t('common.noRate') : statusText[r.status] ?? t('regions.nodata') }),
          )
        : h(
            'tr',
            { class: r.self ? 'is-self' : null },
            h('td', {}, h('span', { class: 'ug-code', text: r.cc.toUpperCase() })),
            h('th', { scope: 'row', text: regionLabel(r) }),
            h('td', { class: 'ug-col-num ug-col-local', text: r.local ?? '' }),
            h('td', { class: 'ug-col-num', text: calc.formatUsd(r.usd) }),
            h('td', { class: 'ug-col-num', text: r.self ? t('common.base') : r.delta == null ? '—' : calc.formatPercent(r.delta) }),
          ),
    )
    return h(
      'div',
      {},
      h(
        'table',
        { class: 'ug-table' },
        h('caption', { class: 'ug-vh', text: t('regions.caption') }),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col', text: t('regions.region') }),
            h('th', { scope: 'col' }, h('span', { class: 'ug-vh', text: t('regions.name') })),
            h('th', { scope: 'col', class: 'ug-col-num ug-col-local', text: t('regions.price') }),
            h('th', { scope: 'col', class: 'ug-col-num', text: t('regions.usd') }),
            h('th', { scope: 'col', class: 'ug-col-num', text: uaUah != null ? t('regions.vsUa') : '' }),
          ),
        ),
        h('tbody', {}, body),
      ),
      h('p', { class: 'ug-table__foot', text: t('regions.foot') }),
    )
  }

  function regionsHint(result) {
    const { cheaper, pricedCount, uaUsd, rows } = result
    if (uaUsd == null) {
      const best = rows.find((r) => r.usd != null)
      return best ? { good: false, text: t('regions.from', { price: calc.formatUsd(best.usd), name: regionLabel(best) }) } : { good: false, text: t('regions.none') }
    }
    if (!pricedCount) return { good: false, text: t('regions.none') }
    if (!cheaper.length) return { good: true, text: t('regions.cheapest', { n: pricedCount + 1 }) }
    if (cheaper.length === 1) {
      const r = cheaper[0]
      return { good: false, text: t('regions.cheaperOne', { name: regionLabel(r), pct: Math.abs(Math.round(r.delta)) }) }
    }
    return { good: false, text: t('regions.cheaperMany', { n: cheaper.length }) }
  }

  function regionsBlock({ uaUah, uaFormatted, load, regionCount }) {
    const hint = h('span', { class: 'ug-regions__hint' }, t(regionCount === 1 ? 'regions.hintOne' : 'regions.hintMany', { n: regionCount }))
    const body = h('div', { class: 'ug-regions__body', 'aria-live': 'polite' })
    const details = h('details', { class: 'ug-regions' }, h('summary', {}, h('span', { class: 'ug-regions__toggle' }, icon('chevron'), t('regions.compare')), hint), body)
    let state = 'idle'

    async function run() {
      state = 'loading'
      body.replaceChildren(h('ol', { class: 'ug-lines', 'aria-busy': 'true' }, [1, 2, 3].map(() => h('li', { class: 'ug-line' }, h('span'), h('span', { class: 'ug-skeleton' }), h('span', { class: 'ug-skeleton ug-skeleton--amt' })))), h('span', { class: 'ug-vh', text: t('regions.loading') }))
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
        body.replaceChildren(notice('error', 'alert', t('regions.error.title'), t('regions.error.detail'), retryButton(run)))
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
    const subtitle = item.months ? t('ticket.subscriptionSub') : t('ticket.purchaseSub')
    const top = h(
      'div',
      { class: 'ug-paper ug-piece--top' },
      h(
        'header',
        { class: compact ? 'ug-head ug-head--compact' : 'ug-head' },
        svg(icons.emblem()),
        h('div', { class: 'ug-brand' }, h('span', { class: 'ug-brand__name', text: 'Ukrainian Gang Extension' }), h('span', { class: 'ug-brand__sub', text: many ? t('ticket.purchaseIndex', { n: m.position.index, total: m.position.total }) : subtitle })),
        h('div', { class: 'ug-meta' }, h('span', { class: 'ug-num', text: `Nº ${item.id}` }), compact ? null : h('span', { class: 'ug-num', text: view.at ? calc.formatDateTime(view.at) : t('ticket.noRates') })),
      ),
      h('div', { class: 'ug-title' }, h('span', { class: 'ug-title__name', text: item.name }), item.edition ? h('span', { class: 'ug-title__ed', text: UG.i18n.editionLabel(item.edition) }) : null),
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
        h('span', { class: 'ug-vh', text: t('ticket.loading') }),
      )
    } else if (m.status === 'error') {
      bottom.append(notice('error', 'alert', t('ticket.error.title'), t('ticket.error.detail'), retryButton(m.onRetry)))
    } else if (m.status === 'free') {
      bottom.append(status('gift', t('ticket.free.title'), t('ticket.free.detail')))
    } else if (m.status === 'unavailable') {
      bottom.append(status('ban', t('ticket.unavailable.title'), t('ticket.unavailable.detail')))
      const r = regions()
      if (r) bottom.append(r)
    } else if (m.status === 'nodata') {
      bottom.append(
        status('info', t('ticket.nodata.title'), t('ticket.nodata.detail')),
        h('div', {}, h('button', { class: 'ug-link', type: 'button', onclick: m.onOpenOptions }, t('ticket.openSettings'))),
      )
    } else {
      const lines = []
      if (m.price.discountPercent > 0 && m.price.initial > m.price.final) {
        lines.push(line({ label: t('ticket.normalPrice'), amount: calc.formatUah(m.price.initial / 100), cls: 'ug-line--muted' }))
        lines.push(line({ label: t('ticket.discount', { n: m.price.discountPercent }), amount: calc.formatUah(-(m.price.initial - m.price.final) / 100), cls: 'ug-line--discount' }))
      }
      const { lines: conv, conv: c } = conversionLines(uah, view, { months: item.months })
      bottom.append(h('ol', { class: 'ug-lines', 'aria-label': t('ticket.linesAria') }, lines, conv))
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
          'aria-label': t('ticket.listAria', { items: [item.name, !UG.i18n.isBaseEdition(item.edition) ? UG.i18n.editionLabel(item.edition) : ''].filter(Boolean).join(', ') }),
          onclick: () => m.onToggleList(button),
        },
        icon('plus', 'off'),
        icon('check', 'on'),
        t('list.name'),
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

    return h('article', { class: 'ug-root ug-ticket ug-ticket-wrap', 'aria-label': t('ticket.aria', { name: item.name }) }, top, bottom)
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
      wrap.append(h('span', { class: 'ug-stub ug-stub--muted' }, h('span', { class: 'ug-paper ug-stub__paper' }, h('span', { class: 'ug-stub__mark' }, svg(icons.smallMark())), h('span', { class: 'ug-stub__v', text: t('stub.notSold') }))))
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
      h('span', { class: 'ug-vh', text: t('stub.sr', { uah: calc.formatUah(m.uah), main, hkd: calc.formatHkd(c.hkd) }) }),
    )
    const rows = [
      [t('stub.price'), calc.formatUah(m.uah)],
      [t('line.hkCard'), calc.formatHkd(c.hkd)],
      [t('line.binance'), calc.formatUsdt(c.usdt)],
    ]
    const tip = h(
      'div',
      { class: 'ug-paper ug-tip', popover: 'manual', role: 'tooltip' },
      m.title ? h('p', { class: 'ug-tip__title', text: m.title }) : null,
      h(
        'dl',
        {},
        rows.map(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]),
        h('dt', { text: t('stub.total') }),
        h('dd', { class: 'ug-tip__total', text: c.ves != null ? calc.formatVes(c.ves) : t('common.noRate') }),
      ),
      h('p', { class: 'ug-tip__foot', text: view.at ? t('rates.fromAgo', { ago: calc.timeAgo(view.at) }) : '' }),
    )
    wrap.append(stubEl, tip)
    return { el: wrap, tip, anchor: stubEl }
  }

  UG.dom = { h, svg, icon, line, notice, retryButton }
  UG.render = { ratesView, ratesNotices, conversionLines, suggestionLine, regionsHint, ticket, stub }
})()
