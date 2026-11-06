// test/router.test.cjs - the hash router must never crash on a malformed URL.
//
// parseRoute runs at app init and on every hashchange. A shared link carrying a
// bad percent-escape (`#/project?id=100%`) used to make decodeURIComponent throw
// URIError, which is uncaught - a white screen from a pasted URL. This pins the
// guarded decode against the real source (transpiled with the repo's own
// typescript), so a regression that drops the guard fails here.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const treeRoot = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(treeRoot, 'src', 'lib', 'router.ts'), 'utf8')
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

// Load the transpiled module from a throwaway file so `require` resolves it.
const tmp = path.join(treeRoot, 'test', '.router.transpiled.cjs')
let parseRoute
try {
  fs.writeFileSync(tmp, js)
  ;({ parseRoute } = require(tmp))
} finally {
  fs.rmSync(tmp, { force: true })
}

test('a well-formed query decodes', () => {
  assert.equal(parseRoute('#/project?id=abc').params.id, 'abc')
  assert.equal(parseRoute('#/project?id=a%20b').params.id, 'a b')
})

test('a malformed percent-escape never throws (returns the raw value)', () => {
  let route
  assert.doesNotThrow(() => { route = parseRoute('#/project?id=100%') })
  assert.equal(route.params.id, '100%')
})

test('a malformed escape in one param does not lose the others', () => {
  const route = parseRoute('#/x?a=1&b=2%&c=3')
  assert.equal(route.params.a, '1')
  assert.equal(route.params.b, '2%')
  assert.equal(route.params.c, '3')
})

test('the path still resolves with no query', () => {
  assert.equal(parseRoute('#/trash').path, '/trash')
  assert.deepEqual(parseRoute('#/trash').params, {})
  assert.equal(parseRoute('').path, '/')
})
