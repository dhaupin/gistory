// src/cut.mjs - monoforge cut: stamp a component-family workspace by
// cutting opt-in sources out of a living lib. The release-cut doctrine's
// defining operation: install follows the tag, not the repo.
// Inputs: factory.json (workspace identity) + cutlist.json (the ONE
// authored input: component -> source list). Output: components/<name>/
// packages with intra-graph deps rewritten (./x -> @scope/x), smoke
// tests, root workspaces, per-package provenance. Law: an unmapped
// internal dependency is a LOUD refusal, never a silent vant-internal
// copy; publish is always a later decision the owner makes.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'

function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch (e) {
    throw new Error(`${p} is not valid JSON: ${e.message}`)
  }
}

// rewrite bare intra-lib requires (./x or ./x.js) to scoped package
// requires using the module->package map. Unmapped './x' = LOUD refusal.
function rewriteDeps(source, map, shortfall, scope, ownerModule) {
  const s = String(source)
  const re = /require\(\s*['"]\.\/([A-Za-z0-9_-]+?)(?:\.js)?['"]\s*\)/g
  let out = '', m, last = 0
  while ((m = re.exec(s)) !== null) {
    const mod = m[1]
    const mapped = map.get(mod)
    if (mapped) {
      out += s.slice(last, m.index) + `require('@${scope}/${mapped}')`
      last = m.index + m[0].length
      continue
    }
    if (!shortfall.has(mod)) {
      throw new Error(`unmapped internal dependency "${mod}" in ${ownerModule}: refuse (cut it, or declare it in cutlist.shortfall as a documented capability degrade)`)
    }
    out += s.slice(last, m.index) + `require('@${scope}/${mod}')`
    last = m.index + m[0].length
  }
  return out + s.slice(last)
}


export default async function cut(targetDir) {
  if (!targetDir) throw new Error('usage: monoforge cut <dir>')
  const factory = readJson(join(targetDir, 'factory.json'))
  if (typeof factory.name !== 'string' || !factory.name || !/^[a-z0-9_-]+$/.test(factory.name)) {
    throw new Error(`factory.name must be a npm-safe name (got ${JSON.stringify(factory.name)})`)
  }
  const cutlistPath = join(targetDir, 'cutlist.json')
  if (!existsSync(cutlistPath)) {
    throw new Error(`no cutlist.json in ${join(targetDir)}: the cutlist is the ONE authored input (component -> source list)`)
  }
  const cutlist = readJson(cutlistPath)
  const srcRoot = cutlist.source
  if (!srcRoot || !existsSync(join(srcRoot))) throw new Error(`cutlist.source does not exist: ${srcRoot}`)
  if (!Array.isArray(cutlist.packages) || !cutlist.packages.length) {
    throw new Error('cutlist.packages must be a non-empty list of {name, sources}')
  }

  // provenance: the exact source revision the cut captures
  let rev = 'unknown'
  let revWarn = null
  try { rev = execFileSync('git', ['-C', srcRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch (e) { revWarn = `source rev unavailable: ${e.message.split('\n')[0]}` }

  // shortfall registry: declared lazy dependencies that are NOT cut but
  // are allowed to be referenced (rewritten to scoped names whose
  // absence is a documented, nameable call-site degrade). Anything
  // unmapped and unregistered refuses.
  const shortfall = new Set(cutlist.shortfall || [])
  for (const sf of shortfall) {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(sf)) throw new Error(`shortfall entry must be a module name (got ${sf})`)
  }
  // module -> package map driven ONLY by the cutlist
  const map = new Map()
  for (const pkg of cutlist.packages) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(pkg.name)) throw new Error(`package name must be kebab-case (got ${pkg.name})`)
    if (!Array.isArray(pkg.sources) || !pkg.sources.length) throw new Error(`package ${pkg.name}: a non-empty sources list is required`)
    for (const src of pkg.sources) {
      if (!existsSync(join(srcRoot, src))) throw new Error(`package ${pkg.name}: source not found: ${src}`)
      map.set(src.replace(/\.js$/, ''), `${pkg.name}`)
    }
  }
  if (new Set(cutlist.packages.map(p => p.name)).size !== cutlist.packages.length) {
    throw new Error('duplicate package names in cutlist')
  }

  mkdirSync(targetDir, { recursive: true })
  const touched = []
  const today = new Date().toISOString()
  // scope: factory.scope wins (e.g. "@creadev.org"); otherwise factory.name
  const SCOPE = factory.scope ? `${factory.scope.replace(/^@/, '')}` : factory.name

  for (const pkg of cutlist.packages) {
    const pkDir = join(targetDir, 'components', pkg.name)
    mkdirSync(join(pkDir, 'src'), { recursive: true })
    mkdirSync(join(pkDir, 'test'), { recursive: true })

    // sources, with intra-graph requires rewritten to scoped deps
    const deps = {}
    const usedShortfalls = new Set()
    for (const src of pkg.sources) {
      let body = String(readFileSync(join(srcRoot, src)))
      body = rewriteDeps(body, map, shortfall, SCOPE, src)
      for (const m of body.matchAll(/require\('@[^']*\/([a-z0-9_-]+)'\)/g)) {
        const name = m[1]
        if (!cutlist.packages.some(p2 => p2.name === name)) usedShortfalls.add(name)
      }
      const dst = join(pkDir, 'src', src)
      mkdirSync(join(dst, '..'), { recursive: true })
      writeFileSync(dst, body)
      touched.push(relative(targetDir, dst))
    }
    // declared deps must be cut packages, keyed by their scoped names
    for (const d of pkg.deps || []) {
      if (!map.has(d)) throw new Error(`package ${pkg.name}: declared dep "${d}" is not in this cut (add it to the cutlist, or declare it in shortfall if it is a lazy capability)`)
      deps[`@${SCOPE}/${d}`] = '~0.9.0'
    }

    const main = pkg.sources[0]
    const pkgJson = {
      name: `@${SCOPE}/${pkg.name}`,
      version: '0.9.0',
      description: pkg.description || `${pkg.name}: a component cut of the ${factory.name} family`,
      license: 'MIT',
      main: `src/${main}`,
      files: ['src/', 'CHANGELOG.md', 'test/'],
      publishConfig: { access: 'public' },
      scripts: { test: 'node test/smoke.cjs' },
      engines: { node: '>=20' },
      dependencies: deps,
    }
    writeFileSync(join(pkDir, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n')
    touched.push(`components/${pkg.name}/package.json`)

    const revLine = revWarn
      ? `Provenance: cut from ${srcRoot}; ${revWarn}.`
      : `Provenance: cut from ${srcRoot} at revision ${rev}.`
    const changelog = [
      '# Changelog',
      '',
      `All notable changes to @${SCOPE}/${pkg.name}.`,
      '',
      'The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are cuts of the source lib: see each entry for the exact origin revision. Release ladder: 0.9.x manual npm; 1.0.0 flips OIDC trusted publishing.',
      '',
      `## [0.9.0] - ${today.slice(0, 10)}`,
      '',
      '### Added',
      '- First cut of this component.',
      `- ${revLine}`,
      '',
    ].join('\n') + '\n'
    writeFileSync(join(pkDir, 'CHANGELOG.md'), changelog)
    touched.push(`components/${pkg.name}/CHANGELOG.md`)

    const smoke = `#!/usr/bin/env node\n// smoke: the cut loads standalone and exports a real module shape.\nconst assert = require('node:assert')\nconst { join } = require('node:path')\nconst mod = require(join(__dirname, '..', 'src', ${JSON.stringify(main)}))\nassert(mod && (typeof mod === 'object' || typeof mod === 'function'), 'module.exports must be object or function')\nassert(Object.keys(mod).length > 0, 'module.exports must expose at least one key')\nconsole.log('smoke ok: ${pkg.name} (' + Object.keys(mod).length + ' exports)')\n`
    writeFileSync(join(pkDir, 'test', 'smoke.cjs'), smoke)
    touched.push(`components/${pkg.name}/test/smoke.cjs`)

    // per-package README: the provenance + the HONEST shortfall list
    const sfList = [...usedShortfalls].sort()
    const readme = [
      `# @${SCOPE}/${pkg.name}`,
      '',
      pkg.description || `${pkg.name}: a component cut of the ${factory.name} family.`,
      '',
      '## Provenance',
      '',
      `- ${revLine}`,
      '',
      '## What this package is',
      '',
      'A release cut: versioned, gated files frozen from the source lib at',
      'the revision above. Install follows the tag, not the repo. Updates',
      'happen only when a new cut is deliberately made, tested, and tagged.',
      '',
      '## Capability shortfalls (HONEST)',
      '',
      sfList.length
        ? ['The source module lazily references these internal modules that', 'are NOT part of this cut (they are its upstream-vant internals or', 'larger candidates cut separately later). At consumer runtime,', 'reaching those call sites raises a nameable MODULE_NOT_FOUND under', `@${SCOPE}/${sfList[0]}: that is the documented degrade, not a bug.`, ''].join('\n') + sfList.map((x) => `- \`${x}\``).join('\n') + '\n'
        : 'None: every capability this module references is in the cut.\n',
    ].join('\n') + '\n'
    writeFileSync(join(pkDir, 'README.md'), readme)
    touched.push(`components/${pkg.name}/README.md`)
  }

  // root workspace
  const rootPkg = {
    name: factory.name,
    version: factory.version || '0.9.0',
    private: true,
    workspaces: ['components/*'],
    scripts: { test: 'node scripts/test-all.cjs' },
    engines: { node: '>=20' },
  }
  writeFileSync(join(targetDir, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n')
  touched.push('package.json')

  const testAll = `#!/usr/bin/env node\n// run every component smoke test (installs workspace links first).\nconst { execFileSync } = require('node:child_process')\nconst { join } = require('node:path')\nconst { readdirSync } = require('node:fs')\nexecFileSync('npm', ['install', '--no-fund', '--no-audit', '--silent'], { stdio: 'inherit' })\nconst comps = readdirSync('components').filter((c) => !c.startsWith('.'))\nfor (const c of comps) {\n  execFileSync('node', ['test/smoke.cjs'], { cwd: join('components', c), stdio: 'inherit' })\n}\nconsole.log('all ' + comps.length + ' package smokes PASS')\n`
  mkdirSync(join(targetDir, 'scripts'), { recursive: true })
  writeFileSync(join(targetDir, 'scripts', 'test-all.cjs'), testAll)
  touched.push('scripts/test-all.cjs')

  // root README: the family index, honest
  const note = revWarn ? `(source rev unavailable: ${revWarn})` : `(source rev ${rev.slice(0, 7)})`
  const perPkg = cutlist.packages.map((pkg) => {
    const src = join(targetDir, 'components', pkg.name, 'README.md')
    const sfm = (readFileSync(src, 'utf8').match(/^- `(.+)`$/gm) || []).map((x) => x.slice(3, -1))
    return `| ${pkg.name} | ${pkg.sources.join(', ')} | ${(sfm.join(', ') || 'none')} |`
  }).join('\n')
  const rootReadme = [
    `# ${factory.name}`,
    '',
    factory.description.replace(/!$/, '.') || 'The component family.',
    '',
    `A release-cut family: every package is a versioned slice of the living source lib, provenance-tagged to its origin revision ${note}.`,
    'Install follows the tag, not the repo; updates are deliberate cuts, never followers.',
    '',
    '## The cut',
    '',
    '| Package | Cut from | Shortfall modules (documented degrade) |',
    '|---|---|---|',
    perPkg,
    '',
    '## Release ladder',
    '',
    '0.9.x: manual npm, per package. 1.0.0 flips OIDC trusted publishing.',
    '',
  ].join('\n') + '\n'
  writeFileSync(join(targetDir, 'README.md'), rootReadme)
  touched.push('README.md')

  // manifest: what the cut actually stamped (the doctor scopes its slot
  // scan to exactly these files)
  writeFileSync(join(targetDir, '.monoforge-stamp.json'), JSON.stringify({
    stampTool: 'monoforge-cut',
    name: factory.name,
    date: today.slice(0, 10),
    sourceRev: rev,
    files: touched,
  }, null, 2) + '\n')

  return { ok: true, dir: targetDir, packages: cutlist.packages.length, sourceRev: rev, files: touched.length }
}
