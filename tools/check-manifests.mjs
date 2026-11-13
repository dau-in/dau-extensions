// Checks each extension's manifest.json: valid JSON, Manifest V3, a version
// shaped x.y.z, and that every file it references exists.
// Usage: node tools/check-manifests.mjs
import { readdir, readFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'extensions')
const exists = (p) => access(p).then(() => true, () => false)
let problems = 0

for (const name of (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const dir = join(root, name)
  let mine = 0
  const report = (msg) => {
    problems++
    mine++
    console.log(`  ✖ ${msg}`)
  }
  console.log(name)

  let m
  try {
    m = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
  } catch (e) {
    report(`cannot read manifest.json: ${e.message}`)
    continue
  }
  if (m.manifest_version !== 3) report(`manifest_version is ${m.manifest_version}, not 3`)
  if (!/^\d+\.\d+\.\d+$/.test(m.version ?? '')) report(`version "${m.version}" is not shaped x.y.z`)
  if (!(await exists(join(dir, 'README.md')))) report('README.md is missing')

  const files = new Set()
  const add = (f) => f && !f.includes('*') && files.add(f)
  Object.values(m.icons ?? {}).forEach(add)
  Object.values(m.action?.default_icon ?? {}).forEach(add)
  add(m.action?.default_popup)
  add(m.options_ui?.page)
  add(m.options_page)
  add(m.background?.service_worker)
  for (const cs of m.content_scripts ?? []) [...(cs.js ?? []), ...(cs.css ?? [])].forEach(add)
  for (const war of m.web_accessible_resources ?? []) (war.resources ?? []).forEach(add)

  for (const f of files) if (!(await exists(join(dir, f)))) report(`${f} does not exist`)
  if (!mine) console.log(`  ✔ v${m.version}, ${files.size} referenced files`)
}

process.exitCode = problems ? 1 : 0
