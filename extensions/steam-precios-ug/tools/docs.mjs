// Copies the README images from the latest end-to-end screenshots.
// Run the end-to-end test first (npm run test:e2e), then npm run docs.
import { copyFile, mkdir, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = join(ROOT, 'tests', 'e2e', 'screenshots')
const DOCS = join(ROOT, 'docs')

// README image → screenshot written by tests/e2e/run.mjs
const IMAGES = {
  'ticket.png': '01-game-ticket.png',
  'search.png': '13-search.png',
  'popup.png': '14-popup.png',
  'settings.png': '16-settings.png',
  'settings-spanish.png': '16b-settings-spanish.png'
}

await mkdir(DOCS, { recursive: true })

for (const [target, source] of Object.entries(IMAGES)) {
  try {
    await access(join(SHOTS, source))
  } catch {
    console.error(`missing ${source}: run npm run test:e2e first`)
    process.exitCode = 1
    continue
  }
  await copyFile(join(SHOTS, source), join(DOCS, target))
  console.log(`docs/${target}`)
}
