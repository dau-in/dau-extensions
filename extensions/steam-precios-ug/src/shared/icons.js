// SVG for the emblem and the icons. Fixed markup, never page data.
;(() => {
  const UG = (globalThis.UG ??= {})

  const TICKET_OUTER = 'M14 30h92v20a10 10 0 0 0 0 20v20H14V70a10 10 0 0 0 0-20Z'
  const TICKET_INNER = 'M20 36h80v14.6a15 15 0 0 0 0 18.8V84H20V69.4a15 15 0 0 0 0-18.8Z'

  let uid = 0

  // "Ticket stub" emblem: drawn like a rubber stamp, with slightly worn ink.
  // crop trims the canvas to the shape of the stub.
  function emblem({ className = 'ug-emblem', crop = true, ink = true } = {}) {
    const id = `ug-ink-${++uid}`
    const viewBox = crop ? '11 27 98 66' : '0 0 120 120'
    const filter = ink
      ? `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="noise"/>
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  12 0 0 0 -3.1" result="holes"/>
          <feComposite in="SourceGraphic" in2="holes" operator="in"/>
        </filter>`
      : ''
    return `<svg class="${className}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${filter}
      <g${ink ? ` filter="url(#${id})"` : ''}>
        <path d="${TICKET_OUTER}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
        <path d="${TICKET_INNER}" fill="none" stroke="currentColor" stroke-width="0.9"/>
        <text x="60" y="45.5" fill="currentColor" font-size="6" font-weight="800" letter-spacing="1.2" text-anchor="middle" style="font-stretch:100%">UKRAINIAN GANG</text>
        <text x="60" y="69" fill="currentColor" font-size="23" font-weight="800" letter-spacing="0" text-anchor="middle" style="font-stretch:112.5%">UG</text>
        <path d="M41 57.2h38M41 62.6h38" stroke-width="4" stroke-linecap="square" style="stroke:var(--ug-paper)"/>
        <path d="M41 57.2h38M41 62.6h38" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/>
        <text x="60" y="80.5" fill="currentColor" font-size="6" font-weight="800" letter-spacing="1.9" text-anchor="middle" style="font-stretch:100%">EXTENSION</text>
      </g>
    </svg>`
  }

  // Small version (list stubs and the 16–48 px icons): a filled stub with UG.
  // The hryvnia bars only from 48 px up; smaller, they smudge the letters.
  const smallMark = (className = '', { bars = false } = {}) =>
    `<svg class="${className}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M1 7h30v5.5a3.5 3.5 0 0 0 0 7V25H1v-5.5a3.5 3.5 0 0 0 0-7Z" fill="currentColor"/>
      <text x="16" y="${bars ? 20.6 : 20.2}" font-size="${bars ? 11.5 : 12.5}" font-weight="800" letter-spacing="-0.6" text-anchor="middle" style="fill:var(--ug-paper);font-stretch:112.5%">UG</text>
      ${bars ? '<path d="M8.5 14.8h15M8.5 17.3h15" stroke="currentColor" stroke-width="1.9"/><path d="M8.5 14.8h15M8.5 17.3h15" stroke-width="0.8" style="stroke:var(--ug-paper)"/>' : ''}
    </svg>`

  const PATHS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    offline: '<path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.2-1.6M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5a15 15 0 0 1 11.3 3.8M12 20h.01"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    gift: '<path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 8h.01"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    settings: '<path d="M20 7h-9M14 17H4M17 4v6M7 14v6M4 7h5M20 17h-3"/>',
  }

  const icon = (name, extra = '') =>
    `<svg class="ug-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"${extra ? ` data-when="${extra}"` : ''}>${PATHS[name]}</svg>`

  // Decorative barcode from a string of digits.
  function barcode(code) {
    let x = 0
    let rects = ''
    const bar = (w, on) => {
      if (on) rects += `<rect x="${x}" y="0" width="${w}" height="30"/>`
      x += w
    }
    bar(2, true), bar(1, false), bar(1, true), bar(2, false)
    for (const ch of String(code).replace(/\D/g, '').slice(0, 14)) {
      const d = Number(ch)
      for (let i = 0; i < 4; i++) {
        bar(((d >> i) & 1) + 1, true)
        bar(((d + i) % 3) + 1, false)
      }
    }
    bar(1, true), bar(1, false), bar(2, true)
    return `<svg class="ug-barcode" viewBox="0 0 ${x} 30" width="${Math.round(x * 1.3)}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g fill="currentColor">${rects}</g></svg>`
  }

  UG.icons = { emblem, smallMark, icon, barcode }
})()
