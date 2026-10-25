// eyestruct adopt - propose a baseline change. LOCAL ADOPT IS A PROPOSAL:
// canon is CI-cut, so the row carries ratified:false until the CI lane
// reproduces the capture inside the pinned image. --note is REQUIRED
// (ADOPT_NOTE_REQUIRED): a diff that ships without a ledger row explaining
// it fails the pass, enforced at write time.

'use strict'

const ledgerMod = require('./ledger')
const identity = require('./identity')
const { fail } = require('./reasons')

function run(ctx) {
  const target = posArg(ctx.argv)
  if (!target) fail('UNKNOWN_COMMAND', 'adopt needs <route/view>')
  const note = flagValue(ctx.argv, '--note')
  if (!note || !note.trim()) fail('ADOPT_NOTE_REQUIRED')
  const file = ledgerMod.ledgerPath(ctx.cwd, ctx)
  const row = ledgerMod.append(file, {
    type: 'adopt',
    agent: identity.agent(),
    commit: identity.commit(),
    artifact: target,
    note,
    ratified: false,
  })
  if (ctx.json) process.stdout.write(JSON.stringify(row, null, 2) + '\n')
  else process.stdout.write(`proposed ${row.id} for ${target} (ratified:false)\n`)
  return 0
}

function posArg(argv) {
  return argv.find((a) => !a.startsWith('--') && !isFlagValue(argv, a))
}

function isFlagValue(argv, a) {
  const i = argv.indexOf(a)
  return i > 0 && argv[i - 1].startsWith('--') && !argv[i - 1].includes('=')
}

function flagValue(argv, flag) {
  const i = argv.indexOf(flag)
  return i === -1 ? null : argv[i + 1]
}

module.exports = { run }
