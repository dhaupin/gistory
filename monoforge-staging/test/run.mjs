// test/run.mjs - monoforge self-test. The negative test is the product:
// (1) a bad factory.json config is refused, (2) a stamped repo with its
// truth slots unfilled FAILS the doctor (this is the factory refusing to
// ship generated green), (3) the doctor passes a tree whose slots are
// filled. The factory's own law, asserted in its own CI.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import stamp from '../src/stamp.mjs'
import doctor from '../src/doctor.mjs'

const base = mkdtempSync(join(tmpdir(), 'forge-'))
const fails = []
const assert = (cond, label) => { if (!cond) fails.push(label) }

// 1. bad config refused hard
const d1 = join(base, 'badcfg'); mkdirSync(d1, { recursive: true })
writeFileSync(join(d1, 'factory.json'), JSON.stringify({ name: 'X', species: 's', pitch: 'p', description: 'd', siteDomain: 'http://x' }))
const r1 = await stamp(d1)
assert(r1.ok === false, 'bad config: stamp should refuse (kebab + https laws)')
assert(/kebab-case|https/.test(r1.error || ''), 'bad config: refusal should name the law')

// 2. non-empty dir refused
const d2 = join(base, 'stray'); mkdirSync(d2, { recursive: true })
writeFileSync(join(d2, 'stray.txt'), 'x')
writeFileSync(join(d2, 'factory.json'), JSON.stringify({ name: 'good-name', species: 's', pitch: 'p', description: 'long enough description', siteDomain: 'https://good-name.creadev.org' }))
const r2 = await stamp(d2)
assert(r2.ok === false && /stray\.txt/.test(r2.error || ''), 'non-empty dir: stamp should refuse, never half-merge')

// 3. clean stamp: refuses nothing, fills tokens, leaves truth slots
const d3 = join(base, 'clean'); mkdirSync(d3, { recursive: true })
writeFileSync(join(d3, 'factory.json'), JSON.stringify({ name: 'test-forge', species: 'test animal', pitch: 'A test stamp.', description: 'A synthetic repo stamped by the factory CI to prove the stamp layer works end to end.', siteDomain: 'https://test-forge.creadev.org', version: '0.9.0' }))
const r3 = await stamp(d3)
assert(r3.ok === true, 'clean stamp should succeed')
assert(existsSync(join(d3, '.gitignore')), 'stamp should materialize .gitignore from the template')
assert(existsSync(join(d3, '.github/workflows/publish.yml')), 'stamp should carry the release ladder')
const readme = require3(join(d3, 'README.md').replace('file://', ''))
assert(/test-forge/.test(readme) && /FORGE-TODO/.test(readme), 'stamped README carries the name and its unfilled truth slots')

// 4. doctor FAILS on unfilled truth slots (the law that matters most)
const d4 = await doctor(d3)
assert(d4.ok === false, 'doctor must fail a stamped repo whose truth slots are unfilled (generated green is never shipped)')
assert(d4.findings.some(f => f.id === 'truth-slot'), 'doctor should flag the FORGE-TODO slots by id')

// 5. doctor passes when slots are filled (fill in place)
import { readFileSync as rf, writeFileSync as wf, readdirSync as rd } from 'node:fs'
const refill = (d) => {
  for (const f of rd(d, { withFileTypes: true })) {
    const p = join(d, f.name)
    if (f.isDirectory() && f.name !== '.git') refill(p)
    else if (/\.(md|json|mjs|cjs|yml|toml|sh|html|txt)$/.test(f.name)) {
      try {
        // refill mirrors the factory contract: truth slots AND stamp tokens
        // must both be gone before the doctor can call a tree shippable
        wf(p, rf(p, 'utf8')
          .replaceAll('FORGE-TODO', 'DONE')
          .replaceAll('DONE:truth', 'filled by the factory test')
          .replaceAll(/__[A-Z][A-Z0-9_]*__/g, 'test-token-filled'))
      } catch {}
    }
  }
}
refill(d3)
const d5 = await doctor(d3)
// note: the stamped docs/ in the test tree carries fix tokens; npm test is
// not stamped (package.json test comes from the template tail), tolerate
// its warn, but the tree must be fail-free.
assert(d5.counts.fail === 0, `doctor should pass a refilled tree (got: ${JSON.stringify(d5.findings.filter(f => f.level === 'fail').slice(0, 3))})`)

rmSync(base, { recursive: true, force: true })
if (fails.length) { console.error('SELF-TEST FAIL:\n  ' + fails.join('\n  ')); process.exit(1) }
console.log('monoforge self-test: bad-config refused, stray dir refused, stamp ok, unfilled doctor FAIL, refilled doctor PASS - PASS')
process.exit(0)

function require3(p) { return rf(p, 'utf8') }
