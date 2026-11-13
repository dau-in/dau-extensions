// Paletas de las direcciones visuales de diseno/conceptos.html y el contraste
// de los pares que usa cada una. Uso: node diseno/conceptos.mjs
import { formatHex, wcagContrast, displayable, parse } from 'culori'
import { APCAcontrast, sRGBtoY } from 'apca-w3'

const C = {
  recibo: {
    paper: 'oklch(0.935 0.016 88)',
    ink: 'oklch(0.24 0.012 80)',
    ink2: 'oklch(0.46 0.014 80)',
    marker: 'oklch(0.89 0.15 100)',
    stamp: 'oklch(0.46 0.17 260)',
    good: 'oklch(0.46 0.1 155)',
  },
  ruta: {
    bg: 'oklch(0.2 0.008 60)',
    surface: 'oklch(0.235 0.009 60)',
    text: 'oklch(0.96 0.004 60)',
    text2: 'oklch(0.8 0.008 60)',
    blue: 'oklch(0.62 0.17 257)',
    yellow: 'oklch(0.87 0.17 95)',
    good: 'oklch(0.8 0.13 155)',
  },
  billete: {
    bg: 'oklch(0.25 0.045 300)',
    text: 'oklch(0.95 0.02 90)',
    text2: 'oklch(0.82 0.03 300)',
    gold: 'oklch(0.83 0.12 82)',
    serial: 'oklch(0.72 0.16 28)',
    good: 'oklch(0.84 0.11 160)',
  },
  terminal: {
    bg: 'oklch(0.15 0 0)',
    surface: 'oklch(0.18 0 0)',
    grid: 'oklch(0.34 0 0)',
    text: 'oklch(0.96 0 0)',
    text2: 'oklch(0.78 0 0)',
    signal: 'oklch(0.88 0.17 95)',
    up: 'oklch(0.8 0.16 150)',
  },
  sticker: {
    card: 'oklch(0.96 0.03 95)',
    ink: 'oklch(0.2 0.02 265)',
    ink2: 'oklch(0.42 0.02 265)',
    yellow: 'oklch(0.88 0.17 95)',
    blue: 'oklch(0.5 0.2 262)',
    good: 'oklch(0.45 0.1 155)',
  },
}

const PAIRS = {
  recibo: [['ink', 'paper', 4.5], ['ink2', 'paper', 4.5], ['ink', 'marker', 4.5], ['paper', 'stamp', 4.5], ['good', 'paper', 4.5]],
  ruta: [['text', 'surface', 4.5], ['text2', 'surface', 4.5], ['bg', 'yellow', 4.5], ['blue', 'surface', 3], ['yellow', 'surface', 3], ['good', 'surface', 4.5]],
  billete: [['text', 'bg', 4.5], ['text2', 'bg', 4.5], ['gold', 'bg', 4.5], ['bg', 'gold', 4.5], ['serial', 'bg', 4.5], ['good', 'bg', 4.5]],
  terminal: [['text', 'surface', 4.5], ['text2', 'surface', 4.5], ['bg', 'signal', 4.5], ['signal', 'surface', 4.5], ['up', 'surface', 4.5], ['grid', 'surface', 1.5]],
  sticker: [['ink', 'card', 4.5], ['ink2', 'card', 4.5], ['ink', 'yellow', 4.5], ['card', 'blue', 4.5], ['good', 'card', 4.5]],
}

const STEAM = '#1b2838'
const y = (c) => { const h = formatHex(c); return sRGBtoY([1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))) }
let fails = 0
for (const [name, pal] of Object.entries(C)) {
  console.log(`\n${name}`)
  for (const [k, v] of Object.entries(pal)) {
    if (!displayable(parse(v))) { console.log(`  ${k} FUERA DE sRGB`); fails++ }
  }
  for (const [fg, bg, min] of PAIRS[name]) {
    const r = wcagContrast(pal[fg], pal[bg])
    const lc = APCAcontrast(y(pal[fg]), y(pal[bg]))
    const ok = r >= min
    if (!ok) fails++
    console.log(`  ${`${fg} / ${bg}`.padEnd(22)} ${r.toFixed(2).padStart(6)}:1  Lc ${Math.abs(lc).toFixed(1).padStart(5)}  ${ok ? 'sí' : `NO (≥ ${min})`}`)
  }
  const main = pal.paper ?? pal.surface ?? pal.bg ?? pal.card
  console.log(`  superficie / Steam ${wcagContrast(main, STEAM).toFixed(2)}:1`)
}
console.log(`\n${fails} fallos`)
