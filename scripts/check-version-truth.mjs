// scripts/check-version-truth.mjs - the version-truth census for the root
// tree (the family ruling, gistory#28; eyestruct@3d8a822 the worked
// example). package.json is THE single version truth of this repo; any
// living surface that names the CURRENT version is leg-pinned to it, so a
// release is "move package.json + the CHANGELOG" and this census refuses
// the living surface that forgot. Lawful by classification (kept as-is):
// dated era rows (CHANGELOG dated sections, dated work-log), range pins
// (^1.0.0 binds 1.x COMPATIBILITY, never the current version), and dep
// specs / comments naming OTHER packages' versions.
//
// The `*-staging/` trees are outside this root census on purpose: they are
// separate packages carrying their own versions, and each tree's battery
// pins its own identity in-tree (poststruct#26 / monoforge#18 shapes, the
// same ruling applied per tree).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const v = pkg.version

if (!/^\d+\.\d+\.\d+$/.test(v)) {
  console.error(`version-truth: FAIL root package.json version is not semver: ${v}`)
  process.exit(1)
}

const problems = []
const surfaces = []

// The README H1 status surface: if the title hand-copies a version, that
// copy is leg-pinned to the root version (move package.json -> the H1
// moves in the same commit, or the battery refuses).
const title = readFileSync(join(repoRoot, 'README.md'), 'utf8').split('\n', 1)[0]
const h1Ver = title.match(/\b(\d+\.\d+\.\d+)\b/)
if (h1Ver) {
  surfaces.push(`README.md H1 version line`)
  if (h1Ver[1] !== v) {
    problems.push(`README.md H1 names ${h1Ver[1]} but package.json says ${v} - the H1 status copy must move with the root version (or drop the number)`)
  }
}

if (problems.length) {
  console.error(`version-truth: FAIL (single truth = package.json ${v})`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(`version-truth: package.json ${v} is the single root truth, ${surfaces.length} living surfaces agree - PASS`)