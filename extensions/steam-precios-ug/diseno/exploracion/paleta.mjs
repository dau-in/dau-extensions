// Genera las rampas de color del sistema de diseño y mide el contraste de los
// pares que usan los componentes. Uso: npm run paleta
//
// Las rampas siguen el modelo de Radix: cada paso tiene un papel fijo (1 fondo
// de página, 2 superficie, 3 componente… 9 relleno sólido, 11 texto suave,
// 12 texto fuerte). Solo se generan los pasos que usa algún token semántico.
// La interfaz es solo oscura: vive dentro de la tienda de Steam, que siempre
// es oscura, y el popup y los ajustes la siguen para que todo se vea igual.

import { clampChroma, formatHex, oklch, wcagContrast, displayable } from 'culori'
import { APCAcontrast, sRGBtoY } from 'apca-w3'

// Paso: [L de OKLCH, croma]. En las rampas de color el croma es la proporción
// del máximo que admite sRGB para ese tono y esa L, así todos los tonos son
// igual de vivos en relación con lo que pueden dar.
const RAMPS = {
  // Neutro frío, de la familia de Steam (tono 254) pero con menos croma,
  // para que las superficies de la extensión se lean como propias.
  neutral: {
    hue: 262,
    absolute: true,
    steps: {
      1: [0.17, 0.01],
      2: [0.205, 0.012],
      3: [0.24, 0.014],
      4: [0.275, 0.015],
      5: [0.305, 0.016],
      6: [0.37, 0.017],
      7: [0.455, 0.018],
      8: [0.53, 0.018],
      9: [0.6, 0.016],
      11: [0.83, 0.014],
      12: [0.95, 0.006],
    },
  },
  // Amarillo de la bandera de Ucrania (#ffd500, tono 94,5). Es el color de la
  // extensión: lejos del azul (236) y del verde lima (123) de Steam.
  accent: {
    hue: 94,
    steps: {
      3: [0.27, 0.55],
      4: [0.31, 0.6],
      7: [0.53, 0.6],
      9: [0.87, 0.97],
      10: [0.92, 0.9],
      11: [0.88, 0.8],
    },
  },
  // Estados. Misma L por paso en los tres para que pesen lo mismo.
  danger: { hue: 25, steps: { 3: [0.27, 0.4], 7: [0.53, 0.6], 11: [0.8, 0.62] } },
  // Naranja y no ámbar: el ámbar quedaría a menos de 15° del acento.
  warning: { hue: 62, steps: { 3: [0.27, 0.4], 7: [0.53, 0.6], 11: [0.82, 0.62] } },
  success: { hue: 158, steps: { 3: [0.27, 0.4], 7: [0.53, 0.6], 11: [0.8, 0.62] } },
}

function maxChroma(l, h) {
  return clampChroma({ mode: 'oklch', l, c: 0.4, h }, 'oklch', 'rgb').c
}

const round = (n, d) => Number(n.toFixed(d))

function buildRamp({ hue, absolute, steps }) {
  const out = {}
  for (const [step, [l, c]] of Object.entries(steps)) {
    let chroma = absolute ? c : c * maxChroma(l, hue)
    // El redondeo a 3 decimales puede sacar el color de sRGB: se recorta.
    let color = { mode: 'oklch', l: round(l, 3), c: round(chroma, 3), h: hue }
    while (!displayable(color)) color = { ...color, c: round(color.c - 0.001, 3) }
    out[step] = color
  }
  return out
}

const ramps = Object.fromEntries(Object.entries(RAMPS).map(([k, v]) => [k, buildRamp(v)]))

const css = (c) => `oklch(${round(c.l, 3)} ${round(c.c, 3)} ${c.h})`

// ---- Primitivos -----------------------------------------------------------
const lines = []
for (const [name, ramp] of Object.entries(ramps)) {
  for (const [step, c] of Object.entries(ramp)) {
    lines.push(`  --ug-${name}-${step}: ${css(c)}; /* ${formatHex(c)} */`)
  }
  lines.push('')
}
console.log('/* Primitivos generados por diseno/paleta.mjs */')
console.log(lines.join('\n'))

// ---- Contraste ------------------------------------------------------------
const P = (ramp, step) => ramps[ramp][step]
const steam = {
  'steam-fondo #1b2838': oklch('#1b2838'),
  'steam-compra-claro #576574': oklch('#576574'),
  'steam-compra-oscuro #2c3c4a': oklch('#2c3c4a'),
  'steam-negro #000': oklch('#000000'),
}

function apca(fg, bg) {
  const rgb = (c) => {
    const h = formatHex(c)
    return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  return APCAcontrast(sRGBtoY(rgb(fg)), sRGBtoY(rgb(bg)))
}

const pairs = [
  // [nombre, fg, bg, umbral WCAG, umbral |Lc|]
  ['text-primary / bg-page', P('neutral', 12), P('neutral', 1), 4.5, 75],
  ['text-primary / bg-surface', P('neutral', 12), P('neutral', 2), 4.5, 75],
  ['text-primary / bg-component', P('neutral', 12), P('neutral', 3), 4.5, 75],
  ['text-primary / bg-component-hover', P('neutral', 12), P('neutral', 4), 4.5, 75],
  ['text-primary / bg-component-active', P('neutral', 12), P('neutral', 5), 4.5, 75],
  ['text-secondary / bg-page', P('neutral', 11), P('neutral', 1), 4.5, 60],
  ['text-secondary / bg-surface', P('neutral', 11), P('neutral', 2), 4.5, 60],
  ['text-secondary / bg-component', P('neutral', 11), P('neutral', 3), 4.5, 60],
  ['text-secondary / bg-component-hover', P('neutral', 11), P('neutral', 4), 4.5, 60],
  ['text-secondary / bg-component-active', P('neutral', 11), P('neutral', 5), 4.5, 60],
  ['text-disabled / bg-surface (exento)', P('neutral', 9), P('neutral', 2), 0, 30],
  ['text-disabled / bg-component (exento)', P('neutral', 9), P('neutral', 3), 0, 30],
  ['accent-text / bg-page', P('accent', 11), P('neutral', 1), 4.5, 60],
  ['accent-text / bg-surface', P('accent', 11), P('neutral', 2), 4.5, 60],
  ['accent-text / bg-component', P('accent', 11), P('neutral', 3), 4.5, 60],
  ['accent-text / accent-subtle', P('accent', 11), P('accent', 3), 4.5, 60],
  ['accent-text / accent-subtle-hover', P('accent', 11), P('accent', 4), 4.5, 60],
  ['text-on-accent / accent-solid', P('neutral', 1), P('accent', 9), 4.5, 60],
  ['text-on-accent / accent-solid-hover', P('neutral', 1), P('accent', 10), 4.5, 60],
  ['danger-text / bg-surface', P('danger', 11), P('neutral', 2), 4.5, 60],
  ['danger-text / danger-subtle', P('danger', 11), P('danger', 3), 4.5, 60],
  ['warning-text / bg-surface', P('warning', 11), P('neutral', 2), 4.5, 60],
  ['warning-text / warning-subtle', P('warning', 11), P('warning', 3), 4.5, 60],
  ['success-text / bg-surface', P('success', 11), P('neutral', 2), 4.5, 60],
  ['success-text / success-subtle', P('success', 11), P('success', 3), 4.5, 60],
  ['text-primary / danger-subtle', P('neutral', 12), P('danger', 3), 4.5, 75],
  ['text-primary / warning-subtle', P('neutral', 12), P('warning', 3), 4.5, 75],
  // No texto: 3:1 (1.4.11)
  ['border-control / bg-surface', P('neutral', 8), P('neutral', 2), 3, 15],
  ['border-control / bg-page', P('neutral', 8), P('neutral', 1), 3, 15],
  ['border / bg-surface (decorativo)', P('neutral', 7), P('neutral', 2), 0, 15],
  // Separador sutil: decorativo, nunca es la única señal de agrupación.
  ['border-subtle / bg-surface (decorativo)', P('neutral', 6), P('neutral', 2), 0, 0],
  ['focus / bg-page', P('accent', 9), P('neutral', 1), 3, 30],
  ['focus / bg-surface', P('accent', 9), P('neutral', 2), 3, 30],
  ['focus / bg-component-active', P('accent', 9), P('neutral', 5), 3, 30],
  ...Object.entries(steam).map(([n, c]) => [`focus / ${n}`, P('accent', 9), c, 3, 30]),
  ['accent-border / bg-surface', P('accent', 7), P('neutral', 2), 0, 15],
  ['danger-border / bg-surface', P('danger', 7), P('neutral', 2), 0, 15],
  // La tarjeta tiene que leerse como algo aparte sobre el gris azulado de Steam.
  ...Object.entries(steam).map(([n, c]) => [`bg-surface / ${n} (borde de tarjeta)`, P('neutral', 2), c, 0, 0]),
]

console.log('\nPar'.padEnd(48), 'WCAG'.padStart(7), 'APCA Lc'.padStart(9), '  ¿Pasa?')
let fails = 0
for (const [name, fg, bg, wcagMin, lcMin] of pairs) {
  const ratio = wcagContrast(fg, bg)
  const lc = apca(fg, bg)
  const ok = ratio >= wcagMin && Math.abs(lc) >= lcMin
  if (!ok) fails++
  console.log(
    name.padEnd(48),
    `${ratio.toFixed(2)}:1`.padStart(7),
    lc.toFixed(1).padStart(9),
    ok ? '  sí' : `  NO (WCAG ≥ ${wcagMin}, |Lc| ≥ ${lcMin})`,
  )
}
console.log(`\n${fails} pares por debajo del umbral.`)

// Comprobación de tonos: los estados deben quedar a ≥ 15° del acento.
for (const s of ['danger', 'warning', 'success']) {
  const d = Math.abs(RAMPS[s].hue - RAMPS.accent.hue)
  console.log(`Distancia de tono acento–${s}: ${Math.min(d, 360 - d)}°`)
}
