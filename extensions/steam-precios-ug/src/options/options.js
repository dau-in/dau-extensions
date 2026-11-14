// Settings: saved as soon as each control changes.
;(async () => {
  const { config, calc, icons, render, i18n } = UG
  const t = (key, vars) => i18n.t(key, vars)
  const form = document.getElementById('form')
  const saved = document.getElementById('saved')
  const regionsBox = document.getElementById('regions')

  async function send(type, payload = {}) {
    const r = await chrome.runtime.sendMessage({ type, ...payload })
    if (!r?.ok) throw new Error(r?.error ?? 'Error')
    return r.data
  }

  document.getElementById('emblem').outerHTML = icons.emblem()

  // Text of the page in the current language.
  function applyText() {
    document.documentElement.lang = i18n.lang
    document.title = t('options.title')
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n)
  }

  function buildRegions(selected = []) {
    regionsBox.replaceChildren()
    for (const r of config.REGIONS) {
      const label = document.createElement('label')
      label.className = 'ug-choice'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.name = 'regions'
      input.value = r.cc
      input.checked = selected.includes(r.cc)
      label.append(input, r[i18n.lang] ?? r.en)
      regionsBox.append(label)
    }
  }

  const numberInputs = [...form.querySelectorAll('input[data-min]')]
  const fmt = (n) =>
    calc
      .formatNumber(n, { decimals: 4, thousands: '', decimal: i18n.lang === 'es' ? ',' : '.', trimZeros: true })
      .replace(/([.,]\d*?)0+$/, '$1')
      .replace(/[.,]$/, '')

  function fill(s) {
    for (const key of ['storeInUah', 'listTags', 'regionCompare', 'suggestCards']) form.elements[key].checked = s[key]
    for (const input of numberInputs) input.value = fmt(s[input.name])
    for (const radio of form.querySelectorAll('input[name="p2pSide"]')) radio.checked = radio.value === s.p2pSide
    for (const radio of form.querySelectorAll('input[name="lang"]')) radio.checked = radio.value === s.lang
    buildRegions(s.regions)
  }

  // Validates a number field; returns the number, or null if it is invalid.
  function readNumber(input) {
    const raw = input.value.trim().replace(/\s/g, '')
    const n = raw === '' ? 0 : Number(raw.replace(',', '.'))
    const min = Number(input.dataset.min)
    const max = Number(input.dataset.max)
    const ok = Number.isFinite(n) && n >= min && n <= max && (!('int' in input.dataset) || Number.isInteger(n))
    const error = document.getElementById(`${input.id}-error`)
    error.hidden = ok
    input.toggleAttribute('aria-invalid', !ok)
    input.closest('.ug-input-wrap').toggleAttribute('data-invalid', !ok)
    input.setAttribute('aria-describedby', ok ? `${input.id}-help` : `${input.id}-error ${input.id}-help`)
    return ok ? n : null
  }

  let current = await send('settings:get')
  i18n.setLang(current.lang)
  applyText()
  fill(current)

  let timer
  async function save() {
    const next = { ...current }
    for (const key of ['storeInUah', 'listTags', 'regionCompare', 'suggestCards']) next[key] = form.elements[key].checked
    next.p2pSide = form.querySelector('input[name="p2pSide"]:checked')?.value ?? 'BUY'
    next.lang = form.querySelector('input[name="lang"]:checked')?.value ?? 'en'
    next.regions = [...form.querySelectorAll('input[name="regions"]:checked')].map((b) => b.value)
    for (const input of numberInputs) {
      const n = readNumber(input)
      if (n == null) return
      next[input.name] = n
    }
    const languageChanged = next.lang !== current.lang
    current = await send('settings:set', { settings: next })
    if (languageChanged) {
      i18n.setLang(current.lang)
      applyText()
      fill(current)
    }
    saved.textContent = t('options.saved')
    clearTimeout(timer)
    timer = setTimeout(() => (saved.textContent = ''), 2000)
    loadRates(false)
  }

  form.addEventListener('change', save)
  form.addEventListener('submit', (e) => e.preventDefault())
  for (const input of numberInputs) {
    input.addEventListener('blur', () => input.value.trim() !== '' && readNumber(input) != null && (input.value = fmt(readNumber(input))))
  }

  // Current rates
  const ratesBox = document.getElementById('rates')
  async function loadRates(force) {
    let state = null
    try {
      state = await send('rates:get', { force })
    } catch {
      state = null
    }
    const view = render.ratesView(state)
    const rows = []
    const add = (dt, dd, stale) => {
      const el = document.createElement('dt')
      el.textContent = dt
      if (stale) el.className = 'is-stale'
      const d = document.createElement('dd')
      d.textContent = dd
      rows.push(el, d)
    }
    add(view.p2p ? t('options.p2pRateAgo', { ago: calc.timeAgo(view.p2p.fetchedAt) }) : t('options.p2pRate'), view.p2p ? calc.formatVes(view.p2p.price) : t('common.noData'), view.p2pOld)
    add(view.fx ? t('options.marketRateAgo', { ago: calc.timeAgo(view.fx.fetchedAt) }) : t('options.marketRate'), view.fx ? `${calc.formatRate(view.fx.rates.UAH / view.fx.rates.HKD, 3)}₴` : t('common.noData'), view.fxOld)
    if (view.rates) {
      add(t('options.usedUah'), `${calc.formatRate(view.rates.uahPerHkd, 3)}₴`)
      add(t('options.usedUsdt'), calc.formatRate(view.rates.usdtPerHkd, 4))
    }
    if (view.fx) add(t('options.source'), view.fx.source)
    ratesBox.replaceChildren(...rows)
  }
  document.getElementById('refresh').addEventListener('click', () => loadRates(true))
  loadRates(false)
})()
