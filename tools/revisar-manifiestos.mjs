// Revisa el manifest.json de cada extensión: que sea JSON válido, Manifest V3,
// con versión x.y.z y que existan todos los archivos que referencia.
// Uso: node tools/revisar-manifiestos.mjs
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
    report(`manifest.json no se puede leer: ${e.message}`)
    continue
  }
  if (m.manifest_version !== 3) report(`manifest_version es ${m.manifest_version}, no 3`)
  if (!/^\d+\.\d+\.\d+$/.test(m.version ?? '')) report(`versión «${m.version}» no tiene la forma x.y.z`)
  if (!(await exists(join(dir, 'README.md')))) report('falta README.md')

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

  for (const f of files) if (!(await exists(join(dir, f)))) report(`no existe ${f}`)
  if (!mine) console.log(`  ✔ v${m.version}, ${files.size} archivos referenciados`)
}

process.exitCode = problems ? 1 : 0
