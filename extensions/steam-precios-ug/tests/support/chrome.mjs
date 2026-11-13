// Path to the Chrome used to test the extension and to render the icons.
// Override it with CHROME_PATH (for example, to use Brave).
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
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH to the path of the executable.')
  return found
}
