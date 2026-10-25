// eyestruct look / diff - the capture verbs (the look-diff law).
// Process-per-look: spawn the pinned browser, capture, annotate, EXIT.
// look writes a CANDIDATE artifact outside .eyes/ (gitignored, disposable);
// the committed baseline is owned by adopt + the CI lane only. The ledger is
// never touched by look/diff - proposals come from `adopt --note`.

'use strict'

const fs = require('fs')
const path = require('path')
const { fail } = require('./reasons')
const manifest = require('./manifest')
const ledgerMod = require('./ledger')

function requireEngine() {
  try {
    const engine = require('./engine')
    if (typeof engine.capture !== 'function') throw new Error('capture missing')
    return engine
  } catch (err) {
    fail('MISSING_PINNED_BROWSER', `capture engine not available (${err.message})`)
  }
}

function candidatePath(cwd, url, capture) {
  let host = 'local', slug = 'page'
  try {
    const u = new URL(url, 'file://local')
    host = (u.protocol === 'file:' ? 'file' : u.hostname) || 'local'
    slug = (u.pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'page').slice(0, 40)
  } catch {}
  const name = `${host}__${slug}_${Date.now()}.png`
  return path.join(cwd, '.eyes-candidates', name)
}

function runLook(ctx) {
  const m = manifest.read(ctx.cwd, ctx)
  const url = ctx.argv.find((a) => /^(https?:\/\/|file:\/\/)/.test(a))
  if (!url) fail('UNKNOWN_COMMAND', 'look needs an http(s) or file:// <url>')
  const engine = requireEngine()
  return engine.capture({
    url,
    argv: ctx.argv,
    pin: m.pin,
    viewport: flagValue(ctx.argv, '--viewport') || '1280x800',
    theme: flagValue(ctx.argv, '--theme'),
    region: flagValue(ctx.argv, '--region'),
  }).then((cap) => {
    fs.mkdirSync(path.join(ctx.cwd, '.eyes-candidates'), { recursive: true })
    const file = candidatePath(ctx.cwd, url)
    fs.writeFileSync(file, cap.png)
    const bytes = fs.statSync(file).size
    if (bytes < 1024) fail('CAPTURE_TOO_SKELETAL', `capture is ${bytes} bytes - likely a blank frame`)
    const view = {
      file: path.relative(ctx.cwd, file),
      bytes,
      elementsMapped: cap.map.length,
      exec: cap.exec,
      version: cap.version,
      map: ctx.json ? cap.map : undefined,
      note: 'candidate artifact; baseline + ledger go through adopt',
    }
    if (ctx.json) process.stdout.write(JSON.stringify(view, null, 2) + '\n')
    else {
      process.stdout.write(
        `look: ${view.file} (${bytes}B, ${cap.map.length} element(s) mapped, ${cap.overlayCount} overlay label(s))\n` +
        `map: ${cap.map.slice(0, 8).map((e) => '#' + e.id).join(' ')}${cap.map.length > 8 ? ' ...' : ''}\n`)
    }
    return 0
  })
}

function runDiff(ctx) {
  const m = manifest.read(ctx.cwd, ctx)
  const engine = requireEngine()
  const url = ctx.argv.find((a) => /^(https?:\/\/|file:\/\/)/.test(a))
  if (!url) fail('UNKNOWN_COMMAND', 'diff needs an http(s) or file:// <url>')
  const eyesDir = path.dirname(m.file)
  const baselineRel = flagValue(ctx.argv, '--against')
  // --against names an artifact like the ledger does (eyes-relative);
  // absolute paths and explicit .eyes/-relative paths also work.
  let baselineFile
  if (!baselineRel) {
    // Default --against is the manifest's first route slot, not a bare
    // .eyes/current.png nothing ever writes.
    const first = m.routes[0]
    if (!first) fail('NO_BASELINE', 'the manifest declares no routes, so there is no default baseline either')
    baselineFile = path.join(eyesDir, routeSlot(first), 'current.png')
  } else {
    baselineFile = path.join(eyesDir, baselineRel)
  }
  if (!fs.existsSync(baselineFile)) {
    fail('NO_BASELINE', `${path.relative(ctx.cwd, baselineFile)} - capture with \`look\`, then \`adopt\` a baseline first`)
  }
  return engine.capture({
    url,
    argv: ctx.argv,
    pin: m.pin,
    viewport: flagValue(ctx.argv, '--viewport') || '1280x800',
    theme: flagValue(ctx.argv, '--theme'),
    region: flagValue(ctx.argv, '--region'),
  }).then((cap) => {
    const baseBytes = fs.statSync(baselineFile).size
    const freshBytes = cap.png.length
    const bytesDiffer = baseBytes !== freshBytes
    const verdict = bytesDiffer ? 'DIFFERS' : 'SAME'
    if (ctx.json) {
      process.stdout.write(JSON.stringify({
        verdict, bytes: { baseline: baseBytes, fresh: freshBytes },
        elementsMapped: cap.map.length,
        note: 'pixel canon stays CI-cut; a local DIFFERS becomes truth only via adopt',
      }, null, 2) + '\n')
    } else {
      process.stdout.write(
        `diff vs ${path.relative(ctx.cwd, baselineFile)}: ${verdict} (baseline ${baseBytes}B vs fresh ${freshBytes}B, ${cap.map.length} mapped)\n`)
    }
    return bytesDiffer ? 1 : 0
  })
}

function routeSlot(route) {
  const slug = (route.path === '/' ? 'home' : route.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')) || 'page'
  return `${slug}/${route.view}`
}

function flagValue(argv, flag) {
  const i = argv.indexOf(flag)
  return i === -1 ? null : argv[i + 1]
}

module.exports = { runLook, runDiff }
