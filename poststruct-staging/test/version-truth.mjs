// test/version-truth.mjs - the version-truth census leg (the family
// ruling, poststruct#26; eyestruct@3d8a822 is the worked example).
// package.json is THE single version truth of this tree; every surface
// that names the CURRENT version is leg-pinned to it, so a release is
// "move package.json + the CHANGELOG" and this battery refuses the
// surface that forgot. Lawful by classification (kept as-is): dated era
// rows (CHANGELOG dated sections), range pins such as "0.9.x is the
// manual ladder" (they bind ladder COMPATIBILITY, never the current
// version), and other packages' version mentions.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const treeRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (p) => JSON.parse(readFileSync(join(treeRoot, p), 'utf8'))

const v = readJson('package.json').version
if (!/^\d+\.\d+\.\d+$/.test(v)) {
  console.error(`version-truth: FAIL root package.json version is not semver: ${v}`)
  process.exit(1)
}

const problems = []
const surfaces = []

// A side package.json hand-copying the tree version is the CAUGHT class:
// the web rig rides the root version, it never carries its own copy.
let webVer
try { webVer = readJson('web/package.json').version } catch { /* absent is fine */ }
if (webVer) {
  surfaces.push('web/package.json version field')
  if (webVer !== v) {
    problems.push(`web/package.json carries its own version ${webVer} but package.json says ${v} - the side package.json rides the root version (drop the copy, never hand-sync it)`)
  } else {
    problems.push(`web/package.json hand-copies the tree version (${webVer}) - drop the field; the web rig rides the root version`)
  }
}

// The README H1 status surface: "# poststruct <v>" is leg-pinned.
const h1 = readFileSync(join(treeRoot, 'README.md'), 'utf8').match(/^# poststruct (\d+\.\d+\.\d+)\b/m)
if (h1) {
  surfaces.push('README.md H1 status copy')
  if (h1[1] !== v) {
    problems.push(`README.md H1 names ${h1[1]} but package.json says ${v} - move package.json + the H1 together, or drop the number`)
  }
}

if (problems.length) {
  console.error(`version-truth: FAIL (single truth = package.json ${v})`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(`version-truth: package.json ${v} is the single truth, ${surfaces.length} living surfaces agree - PASS`)
