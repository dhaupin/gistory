// test/distribution.test.cjs - the distribution contract (poststruct#79).
//
// The sync-relay-shapes pack is only as useful as its DELIVERY: the crashtest
// gate arms it by an EXACT npm pin, so the pack must ride the published
// tarball. npm honours package.json `files`, so a pack tree excluded there is
// invisible to `npm i gistory-sync` even though it is committed and green.
// This test pins the two halves of that contract against the real tree - the
// `files` whitelist carries `packs/`, and every committed pack dir is one the
// whitelist would ship - so a refactor that drops `packs/` from `files`
// (silently un-delivering the packs) fails here instead of in a consumer's CI.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const treeRoot = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(treeRoot, 'package.json'), 'utf8'))
const files = Array.isArray(pkg.files) ? pkg.files : []
const packsRoot = path.join(treeRoot, 'packs', 'public')

test('package.json `files` carries `packs/` (npm i gistory-sync must deliver the packs)', () => {
  assert.ok(
    files.includes('packs/'),
    'package.json `files` must carry `packs/` - otherwise npm i gistory-sync delivers no packs (poststruct#79)',
  )
})

test('every committed pack dir rides the whitelist', () => {
  const packDirs = fs.readdirSync(packsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
  assert.ok(packDirs.length > 0, `packs/public/ must carry at least one pack dir (found ${packDirs.length})`)
  for (const name of packDirs) {
    assert.ok(fs.existsSync(path.join(packsRoot, name, 'pack.json')), `pack dir packs/public/${name} must carry a pack.json`)
  }
  // `files: ["packs/"]` ships the whole subtree, so one entry covers them
  // all - but the whitelist must not be narrowed to a pack-by-pack list that
  // misses a newly added pack.
  const barePacks = files.includes('packs/')
  const namedAll = packDirs.every((n) => files.includes(`packs/public/${n}`) || files.includes(`packs/public/${n}/`))
  assert.ok(barePacks || namedAll, `every pack dir must be delivered: ${packDirs.join(', ')} (files=${JSON.stringify(files)})`)
})

test('the sync-relay-shapes pack the crashtest gate arms is committed and delivered', () => {
  assert.ok(
    fs.existsSync(path.join(packsRoot, 'sync-relay-shapes', 'pack.json')),
    'the sync-relay-shapes pack (the crashtest gate target) must be committed under packs/public/',
  )
})
