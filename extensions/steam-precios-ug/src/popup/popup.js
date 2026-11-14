// Popup: the Lista UG as a long receipt.
;(async () => {
  const { calc, icons, render, dom } = UG
  const t = (key, vars) => UG.i18n.t(key, vars)
  const { h, svg, icon, line, retryButton } = dom
  const app = document.getElementById('app')

  async function send(type, payload = {}) {
    const r = await chrome.runtime.sendMessage({ type, ...payload })
    if (!r?.ok) throw new Error(r?.error ?? 'Error')
    return r.data
  }

  const state = {
    list: [],
    settings: null,
    ratesState: null,
    prices: {},
    pricesLoading: true,
    wallet: null,
    undo: null,
  }

  // ---- Data ------------------------------------------------------------------------

  const itemLabel = (i) => [i.name, i.edition && !UG.i18n.isBaseEdition(i.edition) ? UG.i18n.editionLabel(i.edition) : ''].filter(Boolean).join(' ')

  // Price in ₴ of each game: the API's, or the one it had when it was added.
  function priceOf(i) {
    const r = state.prices[i.key]
    if (r?.status === 'priced' && r.currency === 'UAH') return { uah: r.final / 100, discount: r.discountPercent, source: 'api' }
    if (r?.status === 'free') return { uah: 0, source: 'free' }
    if (Number.isFinite(i.lastUah) && !state.pricesLoading) return { uah: i.lastUah, source: 'saved' }
    if (state.pricesLoading) return { loading: true }
    return { uah: null, source: r?.status ?? 'error' }
  }

  async function loadPrices(force) {
    state.pricesLoading = true
    draw()
    try {
      state.prices = state.list.length ? await send('prices:get', { items: state.list.map((i) => ({ type: i.type, id: i.id })), force }) : {}
    } catch {
      state.prices = {}
    }
    state.pricesLoading = false
  }

  async function loadRates(force) {
    try {
      state.ratesState = await send('rates:get', { force })
    } catch {
      state.ratesState = null
    }
  }

  // ---- Actions ---------------------------------------------------------------------

  async function removeItem(item) {
    const before = state.list
    state.list = await send('list:remove', { key: item.key })
    state.undo = { text: t('popup.removed', { name: itemLabel(item) }), list: before }
    draw({ focus: 'undo' })
  }

  async function clearList() {
    const before = state.list
    state.list = await send('list:set', { list: [] })
    state.undo = { text: t('popup.cleared'), list: before }
    draw({ focus: 'undo' })
  }

  async function undo() {
    if (!state.undo) return
    state.list = await send('list:set', { list: state.undo.list })
    state.undo = null
    draw({ focus: 'top' })
  }

  async function copySummary(button, status) {
    const view = render_ratesView()
    const items = state.list.map((i) => ({ label: itemLabel(i), uah: priceOf(i).uah }))
    const text = calc.summaryText(items, view.rates)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0' })
      ta.value = text
      document.body.append(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    button.dataset.state = 'on'
    button.querySelector('[data-label]').textContent = t('popup.copied')
    status.textContent = t('popup.copiedStatus')
    clearTimeout(copySummary.timer)
    copySummary.timer = setTimeout(() => {
      button.dataset.state = 'off'
      button.querySelector('[data-label]').textContent = t('popup.copy')
      status.textContent = ''
    }, 2500)
  }

  const render_ratesView = () => render.ratesView(state.ratesState)

  // ---- Wallet ----------------------------------------------------------------------

  function parseAmount(raw) {
    const s = String(raw ?? '').trim().replace(/[\s ₴]/g, '')
    if (!s) return { value: null }
    const n = Number(s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
    return Number.isFinite(n) && n >= 0 && n < 1e7 ? { value: n } : { error: true }
  }

  function walletRows(total, view) {
    if (state.wallet == null || total == null) return []
    const diff = total - state.wallet
    if (diff <= 0) return [h('dt', { text: t('popup.enough') }), h('dd', { class: 'is-ok', text: t('popup.leftOver', { amount: calc.formatUah(-diff) }) })]
    const c = calc.convertUah(diff, view.rates)
    return [h('dt', { text: t('popup.topUp') }), h('dd', { class: 'is-short', text: c ? `${calc.formatUah(diff)} ≈ ${calc.formatHkd(c.hkd)}` : calc.formatUah(diff) })]
  }

  // ---- Render ---------------------------------------------------------------------------

  function draw({ focus } = {}) {
    document.title = t('list.name')
    const view = render_ratesView()
    const s = state.settings
    const items = state.list
    const priced = items.map((i) => ({ i, p: priceOf(i) }))
    const known = priced.filter((x) => Number.isFinite(x.p.uah))
    const missing = priced.filter((x) => !x.p.loading && !Number.isFinite(x.p.uah))
    const total = known.length ? known.reduce((a, x) => a + x.p.uah, 0) : null
    const loading = state.pricesLoading

    const head = h(
      'header',
      { class: 'ug-receipt__head' },
      svg(icons.emblem()),
      h('span', { class: 'ug-brand__name', text: 'Ukrainian Gang Extension' }),
      h('h1', { class: 'ug-receipt__title', text: t('list.name') }),
      h('div', { class: 'ug-meta' }, h('span', { class: 'ug-num', text: view.at ? calc.formatDateTime(view.at) : t('ticket.noRates') }), h('span', { text: t(items.length === 1 ? 'popup.gamesOne' : 'popup.gamesMany', { n: items.length }) })),
    )

    const toolbar = h(
      'div',
      { class: 'ug-toolbar' },
      items.length ? h('button', { class: 'ug-link', type: 'button', onclick: clearList }, t('popup.clear')) : h('span'),
      h('button', { class: 'ug-link', type: 'button', onclick: () => chrome.runtime.openOptionsPage() }, icon('settings'), t('popup.settings')),
    )

    const parts = [head, toolbar, h('div', { class: 'ug-rule', 'aria-hidden': 'true' })]

    if (!items.length) {
      parts.push(
        h(
          'div',
          { class: 'ug-empty' },
          h('strong', { text: t('popup.emptyTitle') }),
          h('span', { text: t('popup.emptyText') }),
          h('a', { class: 'ug-btn ug-btn--outline ug-btn--sm', href: 'https://store.steampowered.com/', target: '_blank', rel: 'noopener', style: 'margin-top:8px' }, t('popup.openStore')),
        ),
      )
    } else {
      parts.push(
        h(
          'ol',
          { class: 'ug-lines', 'aria-label': t('popup.gamesAria') },
          priced.map(({ i, p }, n) => {
            const notes = []
            if (i.edition) notes.push(h('small', { text: UG.i18n.editionLabel(i.edition) }))
            if (p.discount > 0) notes.push(h('small', { class: 'ug-note-red', text: t('popup.discount', { n: p.discount }) }))
            if (p.source === 'saved') notes.push(h('small', { text: t('popup.savedPrice') }))
            const amount = p.loading ? h('span', { class: 'ug-skeleton ug-skeleton--amt' }) : h('span', { class: 'ug-amt', text: p.source === 'free' ? t('popup.free') : Number.isFinite(p.uah) ? calc.formatUah(p.uah) : t('popup.noPrice') })
            return h(
              'li',
              { class: 'ug-line ug-line--item' },
              h('span', { class: 'ug-n', text: String(n + 1).padStart(2, '0') }),
              h('span', { class: 'ug-desc' }, i.url ? h('a', { class: 'ug-item-link', href: i.url, target: '_blank', rel: 'noopener', text: i.name }) : h('span', { text: i.name }), notes),
              amount,
              h('button', { class: 'ug-remove', type: 'button', 'aria-label': t('popup.remove', { name: itemLabel(i) }), onclick: () => removeItem(i) }, icon('x')),
            )
          }),
        ),
        h('div', { class: 'ug-rule', 'aria-hidden': 'true' }),
      )

      // Total and conversion
      if (loading) {
        parts.push(h('ol', { class: 'ug-lines', 'aria-busy': 'true' }, [1, 2, 3].map(() => h('li', { class: 'ug-line' }, h('span'), h('span', { class: 'ug-skeleton' }), h('span', { class: 'ug-skeleton ug-skeleton--amt' })))))
      } else if (total != null) {
        const { lines, conv } = render.conversionLines(total, view, { numbered: false })
        lines[0] = line({ label: t('popup.subtotal'), note: missing.length ? t(missing.length === 1 ? 'popup.missingOne' : 'popup.missingMany', { n: missing.length }) : null, amount: calc.formatUah(total), cls: 'ug-line--plain' })
        parts.push(h('ol', { class: 'ug-lines', 'aria-label': t('popup.totalAria') }, lines))
        parts.push(...render.ratesNotices(view, refreshRates))

        // Wallet
        const walletInput = h('input', {
          class: 'ug-input',
          id: 'wallet',
          name: 'wallet',
          type: 'text',
          inputmode: 'decimal',
          autocomplete: 'off',
          placeholder: '0',
          'aria-describedby': 'wallet-result',
        })
        if (state.wallet != null) walletInput.value = calc.formatNumber(state.wallet, { decimals: 2, thousands: '', decimal: t('format.decimal'), trimZeros: true })
        const walletWrap = h('span', { class: 'ug-input-wrap' }, walletInput, h('span', { 'aria-hidden': 'true', text: '₴' }))
        const walletError = h('p', { class: 'ug-field__error', id: 'wallet-error', hidden: true, text: t('popup.walletError') })
        const result = h('dl', { class: 'ug-sub', id: 'wallet-result', 'aria-live': 'polite' }, walletRows(total, view))
        walletInput.addEventListener('input', () => {
          const r = parseAmount(walletInput.value)
          walletError.hidden = !r.error
          walletInput.toggleAttribute('aria-invalid', Boolean(r.error))
          walletWrap.toggleAttribute('data-invalid', Boolean(r.error))
          walletInput.setAttribute('aria-describedby', r.error ? 'wallet-error' : 'wallet-result')
          if (r.error) return
          state.wallet = r.value
          chrome.storage.local.set({ wallet: r.value })
          result.replaceChildren(...walletRows(total, view))
          updateSuggest()
        })
        parts.push(h('div', { class: 'ug-field' }, h('label', { for: 'wallet', text: t('popup.wallet') }), walletWrap, walletError), result)

        const suggestSlot = h('div')
        const updateSuggest = () => {
          if (!s.suggestCards || !conv) return suggestSlot.replaceChildren()
          const need = state.wallet != null ? Math.max(0, total - state.wallet) : total
          const c = calc.convertUah(need, view.rates)
          suggestSlot.replaceChildren(c && need > 0 ? render.suggestionLine(c.hkd) ?? '' : '')
        }
        updateSuggest()
        parts.push(suggestSlot)

        const status = h('p', { class: 'ug-vh', role: 'status' })
        const copy = h(
          'button',
          { class: 'ug-btn ug-btn--block', type: 'button', 'data-state': 'off', onclick: () => copySummary(copy, status) },
          icon('copy', 'off'),
          icon('check', 'on'),
          h('span', { 'data-label': '', text: t('popup.copy') }),
        )
        parts.push(copy, status)
      } else {
        parts.push(h('p', { class: 'ug-help', text: t('popup.nonePriced') }))
      }
    }

    // Undo
    const undoBtn = state.undo ? h('button', { class: 'ug-link', type: 'button', onclick: undo }, t('popup.undo')) : null
    parts.push(h('div', { class: 'ug-snackbar', role: 'status', hidden: !state.undo }, state.undo ? [h('span', { text: state.undo.text }), undoBtn] : []))

    // Rates
    const p2p = view.p2p
    const fx = view.fx
    parts.push(
      h('div', { class: 'ug-rule', 'aria-hidden': 'true' }),
      h(
        'dl',
        { class: 'ug-sub', 'aria-label': t('popup.ratesAria') },
        h('dt', { class: view.p2pOld ? 'is-stale' : null, text: p2p ? t('popup.p2pRateAgo', { ago: calc.timeAgo(p2p.fetchedAt) }) : t('popup.p2pRate') }),
        h('dd', { text: p2p ? calc.formatVes(p2p.price) : t('common.noData') }),
        h('dt', { class: view.fxOld ? 'is-stale' : null, text: fx ? t('popup.marketAgo', { ago: calc.timeAgo(fx.fetchedAt) }) : t('popup.market') }),
        h('dd', { text: view.rates ? `${calc.formatRate(view.rates.uahPerHkd, 3)}₴` : t('common.noData') }),
      ),
      h('div', { class: 'ug-toolbar' }, h('span'), h('button', { class: 'ug-link', type: 'button', onclick: refreshRates }, icon('refresh'), t('popup.refresh'))),
    )

    if (total != null) {
      const digits = String(Math.round(total * 100))
      parts.push(h('div', { class: 'ug-code-block' }, svg(icons.barcode(digits)), h('span', { class: 'ug-barcode__digits', 'aria-hidden': 'true', text: digits })))
    }
    parts.push(h('p', { class: 'ug-receipt__foot', text: t('popup.foot') }))

    app.replaceChildren(...parts)
    app.setAttribute('aria-busy', String(loading))
    if (focus === 'undo') undoBtn?.focus()
    if (focus === 'top') app.querySelector('button, a')?.focus()
  }

  async function refreshRates() {
    await loadRates(true)
    draw()
  }

  // ---- Start-up ----------------------------------------------------------------------

  const [list, settings, stored] = await Promise.all([send('list:get'), send('settings:get'), chrome.storage.local.get('wallet')])
  state.list = list
  state.settings = settings
  UG.i18n.setLang(settings.lang)
  state.wallet = Number.isFinite(stored.wallet) ? stored.wallet : null
  draw()
  await Promise.all([loadRates(false), loadPrices(true)])
  draw()

  // If the list changes in another tab while the popup is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.list && !state.undo) {
      state.list = Array.isArray(changes.list.newValue) ? changes.list.newValue : []
      draw()
    }
  })
})()
