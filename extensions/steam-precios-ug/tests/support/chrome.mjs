// Ruta del Chrome con el que se prueban la extensión y se generan los iconos.
// Se puede cambiar con la variable CHROME_PATH (por ejemplo, para usar Brave).
import { existsSync } from 'node:fs'

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

export function chromePath() {
  const found = CANDIDATES.find((p) => p && existsSync(p))
  if (!found) throw new Error('No se encontró Chrome. Define CHROME_PATH con la ruta del ejecutable.')
  return found
}
