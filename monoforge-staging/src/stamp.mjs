// src/stamp.mjs - monoforge new: stamp a fleet repo from template blocks.
// The config (factory.json) is validated HARD before anything is written:
// a half-specified repo is refused, never half-created.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEMPLATES = join(fileURLToPath(new URL('..', import.meta.url)), 'templates')

export function readFactoryConfig(dir) {
  const cfgPath = join(dir, 'factory.json')
  if (!existsSync(cfgPath)) {
    return { ok: false, error: `no factory.json in ${dir}/ - monoforge new <dir> needs a config; see README for the schema` }
  }
  let cfg
  try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) } catch (e) {
    return { ok: false, error: `factory.json is not valid JSON: ${e.message}` }
  }
  const required = ['name', 'species', 'pitch', 'description', 'siteDomain']
  const missing = required.filter((k) => typeof cfg[k] !== 'string' || !cfg[k].trim())
  if (missing.length) return { ok: false, error: `factory.json missing required keys: ${missing.join(', ')}` }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(cfg.name)) return { ok: false, error: `name must be kebab-case (got ${JSON.stringify(cfg.name)})` }
  if (!/^https:\/\//.test(cfg.siteDomain)) return { ok: false, error: 'siteDomain must be an absolute https URL (the landing domain)' }
  cfg.docsPath = typeof cfg.docsPath === 'string' && cfg.docsPath.trim() ? cfg.docsPath.trim() : `docs.creadev.org/${cfg.name}`
  cfg.version = typeof cfg.version === 'string' && /^\d+\.\d+(\.\d+)?$/.test(cfg.version) ? cfg.version : '0.9.0'
  cfg.docsHost = cfg.docsPath.split('/')[0]
  return { ok: true, cfg }
}

const STAMP_TOOL = 'monoforge'

// One token convention for the whole template layer: __TOKENS__ map to the
// authored factory config. (Dogfood fix, eyestruct 2026-10-24: the first
// non-monoforge stamp left raw __NAME__/__PITCH__ tokens and mutated the
// stamp-tool attribution, because the old map spoke two conventions.)
export function tokenReplacements(cfg, stampDate) {
  return [
    ['__NAME__', cfg.name],
    ['__SPECIES__', cfg.species],
    ['__PITCH__', cfg.pitch],
    ['__DESCRIPTION__', cfg.description],
    ['__DESCRIPTION_LONG__', cfg.description],
    ['__VERSION__', cfg.version],
    ['__SITE_URL__', cfg.siteDomain],
    ['__DOCS_URL__', cfg.docsPath],
    ['__STAMP_DATE__', stampDate],
    ['__STAMP_TOOL__', STAMP_TOOL],
  ]
}

export const stampToolName = STAMP_TOOL

export default async function stamp(dir) {
  const cfgRes = readFactoryConfig(dir)
  if (!cfgRes.ok) return { ok: false, error: cfgRes.error }
  const cfg = cfgRes.cfg

  // refuse any content other than factory.json: never half-merge
  if (existsSync(dir)) {
    const stray = readdirSync(dir).filter((f) => !['factory.json', '.git'].includes(f))
    if (stray.length) return { ok: false, error: `${dir} already contains ${stray.join(', ')} - run in an empty directory holding only factory.json` }
  }
  if (!existsSync(TEMPLATES)) return { ok: false, error: 'template blocks missing - reinstall monoforge' }

  mkdirSync(dir, { recursive: true })
  cpSync(TEMPLATES, dir, { recursive: true })

  const stampDate = new Date().toISOString().slice(0, 10)
  const reps = tokenReplacements(cfg, stampDate)
  const touched = []
  let filled = 0
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name)
      if (f.isDirectory()) { walk(p); continue }
      let s = readFileSync(p, 'utf8')
      const before = s
      for (const [tok, val] of reps) s = s.replaceAll(tok, val)
      if (s !== before) { writeFileSync(p, s); filled++; touched.push(relative(dir, p)) }
    }
  }
  walk(dir)
  // gitignore.tmpl -> .gitignore
  const gi = join(dir, 'gitignore.tmpl')
  if (existsSync(gi)) {
    writeFileSync(join(dir, '.gitignore'), readFileSync(gi, 'utf8'))
    rmSync(gi)
    touched.push('.gitignore')
  }
  // manifest: the record of what the stamp actually emitted. The doctor
  // scopes its truth-slot scan to exactly these files, so prose that
  // documents the FORGE-TODO convention never self-flags.
  writeFileSync(join(dir, '.monoforge-stamp.json'), JSON.stringify({
    stampTool: 'monoforge',
    name: cfg.name,
    version: cfg.version,
    date: stampDate,
    files: touched,
  }, null, 2) + '\n')
  return { ok: true, dir, filled, manifest: touched.length, cfg }
}
