// src/doctor.mjs - forge doctor: the truth battery. Every check is a
// refusal-shaped gate. Findings carry level (fail|warn) and the reason.
// The battery runs against the tree itself; factory.json (when present)
// supplies name/domain context. Generated green is never shipped: an
// unfilled FORGE-TODO slot here is the same thing a broken test is.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const TODO_MARK = 'FORGE-TODO'

function walkFiles(dir, skip = new Set(['.git', 'node_modules', 'docs/_site'])) {
  const out = []
  const rec = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (skip.has(f.name)) continue
      const p = join(d, f.name)
      if (f.isDirectory()) rec(p)
      else out.push(p)
    }
  }
  rec(dir)
  return out
}

function gitClean(dir) {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' })
    return { dirty: out.trim().length > 0, detail: out.trim() }
  } catch {
    return { dirty: false, detail: '(not a git repo: skipped)' }
  }
}

export default async function doctor(dir, opts = {}) {
  const findings = []
  const fail = (id, message) => findings.push({ level: 'fail', id, message })
  const warn = (id, message) => findings.push({ level: 'warn', id, message })

  // 1. git state (warn: dirty tree ships? no. but a lock needs clean)
  const g = gitClean(dir)
  if (g.dirty) warn('git-dirty', `uncommitted changes:\n${g.detail}`)

  // 2. unfilled truth slots. Scoped by the stamp manifest when one
  // exists (monoforge-scanned trees that merely document the FORGE-TODO
  // convention never self-flag; prose ABOUT the law is not a slot).
  const files = walkFiles(dir)
  const manifestPath = join(dir, '.monoforge-stamp.json')
  if (existsSync(manifestPath)) {
    let manifest
    try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) } catch (e) {
      fail('stamp-manifest', `.monoforge-stamp.json is unparseable: ${e.message}`)
      manifest = { files: [] }
    }
    for (const rel of manifest.files || []) {
      const p = join(dir, rel)
      if (!existsSync(p)) continue
      if (!/\.(md|json|yml|toml|sh|html|txt)$/.test(p)) continue
      let s
      try { s = readFileSync(p, 'utf8') } catch { continue }
      const n = (s.match(new RegExp(TODO_MARK, 'g')) || []).length
      if (n) fail('truth-slot', `${rel} still carries ${n} ${TODO_MARK} slot(s): a shipped placeholder is a shipped lie`)
      // stamp-token pass (eyestruct dogfood, 2026-10-24): raw __X__ tokens
      // are the truth-slot class wearing a different uniform; the same law
      // applies (a shipped placeholder is a shipped lie).
      const raw = s.match(/__[A-Z][A-Z0-9_]*__/g) || []
      if (raw.length) fail('stamp-token', `${rel} still carries raw stamp token(s): ${[...new Set(raw)].join(', ')} - the stamp never finished`)
    }
  }

  // 3. package.json sanity (when present)
  const pkgPath = join(dir, 'package.json')
  if (existsSync(pkgPath)) {
    let pkg
    try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) } catch (e) { fail('package-json', `unparseable: ${e.message}`); pkg = null }
    if (pkg) {
      if (pkg?.bin) {
        for (const b of Object.values(pkg.bin)) {
          if (!existsSync(join(dir, b))) fail('bin-path', `bin entry ${b} does not exist (the crashtest#16 class, in our own clothes)`)
        }
      }
      if (pkg?.exports) {
        for (const v of Object.values(pkg.exports)) {
          const p2 = typeof v === 'string' ? v : v?.import
          if (p2 && !existsSync(join(dir, p2))) fail('exports-path', `exports entry ${p2} does not exist`)
        }
      }
      for (const f of pkg.files || []) {
        const p3 = join(dir, f)
        if (!existsSync(p3) && !f.includes('*')) fail('files-path', `files entry ${f} does not exist in the tree`)
      }
      if (!pkg.description || pkg.description.length < 10) warn('description', 'package.json description missing or too thin')
      if ((pkg.engines?.node || '') < '>=20') warn('engines', 'engines.node floor not >=20 (house runtime floor)')
      // 4. publish.yml refuses 0.x
      const pub = join(dir, '.github', 'workflows', 'publish.yml')
      if (existsSync(pub)) {
        const w = readFileSync(pub, 'utf8')
        if (!/v0\.|startsWith\(['"]v0\./.test(w)) fail('publish-gate', '.github/workflows/publish.yml does not refuse 0.x refs (the OIDC ladder gate)')
      }
      // 5. npm test
      if (pkg.scripts?.test) {
        try {
          execFileSync('npm', ['test', '--silent'], { cwd: dir, stdio: 'pipe' })
        } catch {
          fail('npm-test', 'npm test failed: the negative test is the product, not an optional extra')
        }
      } else warn('npm-test', 'no test script: nothing self-audits')
    }
  }

  // 6. docs gates + dash law over md prose
  const dirs = existsSync(join(dir, 'docs')) ? ['docs'] : []
  for (const d of dirs) {
    const gates = ['check-docs-frontmatter.cjs', 'check-docs-links.cjs', 'check-docs-style.cjs', 'check-language.cjs']
    for (const g2 of gates) {
      const gp = join(dir, 'scripts', g2)
      if (!existsSync(gp)) { warn('docs-gate', `missing gate script scripts/${g2} (stamped repos always carry them)`); continue }
      try { execFileSync('node', [gp, d], { cwd: dir, stdio: 'pipe' }) }
      catch (e) { fail('docs-gate', `scripts/${g2} failed: ${String(e.stderr || e.message).split('\n')[0]}`) }
    }
  }
  for (const p of files) {
    if (!p.endsWith('.md')) continue
    let s
    try { s = readFileSync(p, 'utf8') } catch { continue }
    if (/[\u2014\u2013]/.test(s)) {
      const line = s.split('\n').findIndex((l) => /[\u2014\u2013]/.test(l)) + 1
      fail('dash-law', `${relative(dir, p)} line ${line}: em/en dash in prose (house law: none, ever)`)
    }
  }

  const counts = { fail: findings.filter((f) => f.level === 'fail').length, warn: findings.filter((f) => f.level === 'warn').length }
  return { dir, counts, findings, ok: counts.fail === 0 }
}
