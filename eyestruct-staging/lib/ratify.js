// eyestruct ratify - CI-CUT CANON. A local adopt is only ever a proposal
// (ratified:false). Canon becomes real when the SAME capture is reproduced
// in the PINNED environment: ratify re-runs every manifest route through
// the pinned exec and, for every slot whose fresh capture is byte-identical
// to the committed baseline, appends an APPEND-ONLY ratify row proving the
// reproduction. Nothing is edited or rewritten - the proof rides the ledger
// like every other fact.
//
// Exit contract: 0 every manifested slot reproduced byte-identical ·
// 1 at least one slot DIFFERS (UNVERIFIED reasons, next action: diff/adopt)
// 2 capability (pinned browser, manifest). Never a bare stack trace.

'use strict'

const fs = require('fs')
const path = require('path')
const manifest = require('./manifest')
const ledgerMod = require('./ledger')
const { fail } = require('./reasons')

function slotDir(route) {
  const slug = (route.path === '/' ? 'home' : route.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')) || 'page'
  return `${slug}/${route.view}`
}

function run(ctx) {
  const m = manifest.read(ctx.cwd, ctx)
  if (!m.routes.length) fail('WALK_EMPTY', 'ratify has nothing to reproduce: the manifest declares no routes')
  const urlArg = ctx.argv.find((a) => /^(https?:\/\/|file:\/\/)/.test(a))
  if (!urlArg) fail('UNKNOWN_COMMAND', 'ratify needs a <base-url> serving the pinned surface')
  let engine
  try {
    engine = require('./engine')
  } catch {
    fail('MISSING_PINNED_BROWSER')
  }

  const file = ledgerMod.ledgerPath(ctx.cwd, ctx)
  const verified = []
  const unverified = []
  let idx = 0
  const next = () => {
    if (idx >= m.routes.length) return Promise.resolve()
    const route = m.routes[idx++]
    const slot = slotDir(route)
    const baseline = path.join(path.dirname(m.file), slot, 'current.png')
    if (!fs.existsSync(baseline)) {
      // Canon pointing at nothing is verified nowhere; report by slot, keep walking.
      unverified.push({ slot, reason: 'NO_BASELINE' })
      return next()
    }
    return engine
      .capture({
        url: (urlArg.endsWith('/') ? urlArg.slice(0, -1) : urlArg) + route.path,
        argv: ctx.argv,
        pin: m.pin,
        viewport: route.viewport,
        theme: route.theme,
      })
      .then((cap) => {
        const baseBytes = fs.statSync(baseline).size
        const fresh = Buffer.from(cap.png)
        if (cap.png.length !== baseBytes || !fresh.equals(fs.readFileSync(baseline))) {
          unverified.push({ slot, reason: 'DIFFERS', bytes: { baseline: baseBytes, fresh: cap.png.length } })
          return
        }
        const row = ledgerMod.append(file, {
          type: 'ratify',
          agent: require('./identity').agent(),
          commit: require('./identity').commit(),
          artifact: `${slot}/current.png`,
          note: `reproduced byte-identical (${baseBytes}B) in the pinned environment via ${urlArg}`,
          pin: m.pin['browser-image'],
          verified: true,
        })
        verified.push({ slot, row: row.id })
      })
      .then(next)
  }
  return next().then(() => {
    if (ctx.json) {
      process.stdout.write(JSON.stringify({ verified: verified.length, unverified }, null, 2) + '\n')
      return unverified.length ? 1 : 0
    }
    for (const v of verified) process.stdout.write(`ratified ${v.slot} (row ${v.row}, byte-identical)\n`)
    for (const u of unverified) {
      process.stdout.write(`UNVERIFIED ${u.slot} (${u.reason}${u.bytes ? ' - ' + JSON.stringify(u.bytes) : ''})\n`)
    }
    if (unverified.length) {
      process.stdout.write('ratify: canon is NOT yet reproducible for every slot; run look/diff and adopt the change first\n')
    } else {
      process.stdout.write(`ratify: ${verified.length} slot(s) reproduced byte-identical in the pinned environment\n`)
    }
    return unverified.length ? 1 : 0
  })
}

module.exports = { run, slotDir }
