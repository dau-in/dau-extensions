// Ajustes: se guardan al cambiar cada control.
;(async () => {
  const { config, calc, icons, render } = UG
  const form = document.getElementById('form')
  const saved = document.getElementById('saved')

  async function send(type, payload = {}) {
    const r = await chrome.runtime.sendMessage({ type, ...payload })
    if (!r?.ok) throw new Error(r?.error ?? 'Error')
    return r.data
  }

  document.getElementById('emblem').outerHTML = icons.emblem()

  // Regiones
  const regionsBox = document.getElementById('regions')
  for (const r of config.REGIONS) {
    const label = document.createElement('label')
    label.className = 'ug-choice'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.name = 'regions'
    input.value = r.cc
    label.append(input, r.name)
    regionsBox.append(label)
  }

  const numberInputs = [...form.querySelectorAll('input[data-min]')]
  const fmt = (n) => calc.formatNumber(n, { decimals: 4, thousands: '', decimal: ',', trimZeros: true }).replace(/(,\d*?)0+$/, '$1').replace(/,$/, '')

  function fill(s) {
    for (const key of ['storeInUah', 'listTags', 'regionCompare', 'suggestCards']) form.elements[key].checked = s[key]
    for (const input of numberInputs) input.value = fmt(s[input.name])
    for (const radio of form.querySelectorAll('input[name="p2pSide"]')) radio.checked = radio.value === s.p2pSide
    for (const box of form.querySelectorAll('input[name="regions"]')) box.checked = s.regions.includes(box.value)
  }

  // Valida un campo numérico; devuelve el número o null si no es válido.
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
  fill(current)

  let timer
  async function save() {
    const next = { ...current }
    for (const key of ['storeInUah', 'listTags', 'regionCompare', 'suggestCards']) next[key] = form.elements[key].checked
    next.p2pSide = form.querySelector('input[name="p2pSide"]:checked')?.value ?? 'BUY'
    next.regions = [...form.querySelectorAll('input[name="regions"]:checked')].map((b) => b.value)
    for (const input of numberInputs) {
      const n = readNumber(input)
      if (n == null) return
      next[input.name] = n
    }
    current = await send('settings:set', { settings: next })
    saved.textContent = 'Guardado'
    clearTimeout(timer)
    timer = setTimeout(() => (saved.textContent = ''), 2000)
    loadRates(false)
  }

  form.addEventListener('change', save)
  form.addEventListener('submit', (e) => e.preventDefault())
  for (const input of numberInputs) {
    input.addEventListener('blur', () => input.value.trim() !== '' && readNumber(input) != null && (input.value = fmt(readNumber(input))))
  }

  // Tasas actuales
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
      const t = document.createElement('dt')
      t.textContent = dt
      if (stale) t.className = 'is-stale'
      const d = document.createElement('dd')
      d.textContent = dd
      rows.push(t, d)
    }
    add(view.p2p ? `USDT en Binance P2P, ${calc.timeAgo(view.p2p.fetchedAt)}` : 'USDT en Binance P2P', view.p2p ? calc.formatVes(view.p2p.price) : 'Sin datos', view.p2pOld)
    add(view.fx ? `₴ por HK$ a mercado, ${calc.timeAgo(view.fx.fetchedAt)}` : '₴ por HK$ a mercado', view.fx ? `${calc.formatRate(view.fx.rates.UAH / view.fx.rates.HKD, 3)}₴` : 'Sin datos', view.fxOld)
    if (view.rates) {
      add('₴ por HK$ que se usa', `${calc.formatRate(view.rates.uahPerHkd, 3)}₴`)
      add('USDT por HK$ que se usa', calc.formatRate(view.rates.usdtPerHkd, 4))
    }
    if (view.fx) add('Fuente de las tasas de mercado', view.fx.source)
    ratesBox.replaceChildren(...rows)
  }
  document.getElementById('refresh').addEventListener('click', () => loadRates(true))
  loadRates(false)
})()
