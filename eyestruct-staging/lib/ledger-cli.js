// eyestruct ledger list|show - read the memory (browserless, pure).

'use strict'

const ledgerMod = require('./ledger')
const { fail } = require('./reasons')

function run(ctx) {
  const sub = posArg(ctx.argv) || 'list'
  const file = ledgerMod.ledgerPath(ctx.cwd, ctx)
  const rows = ledgerMod.load(file)
  if (sub === 'list') {
    const route = posArg(ctx.argv.slice(1))
    const shown = route ? rows.filter((r) => (r.artifact || '').startsWith(route)) : rows
    if (ctx.json) process.stdout.write(JSON.stringify(shown, null, 2) + '\n')
    else {
      if (!shown.length) process.stdout.write('(empty ledger)\n')
      for (const r of shown)
        process.stdout.write(`${r.id}  ${r.type}${r.ratified === false ? ' (unratified)' : ''}  ${r.artifact}${r.note ? '  # ' + String(r.note).slice(0, 60) : ''}\n`)
    }
    return 0
  }
  if (sub === 'show') {
    const id = posArg(ctx.argv.slice(1))
    const row = rows.find((r) => r.id === id)
    if (!row) fail('DANGLING_ROW', `no ledger row ${id}`)
    if (ctx.json) process.stdout.write(JSON.stringify(row, null, 2) + '\n')
    else process.stdout.write(JSON.stringify(row, null, 2) + '\n')
    return 0
  }
  fail('UNKNOWN_COMMAND', `ledger subcommand "${sub}" (list|show)`)
}

// The flag-value guard adopt.js carries: a token AFTER a --flag is that
// flag's value (e.g. `--ledger labs/.eyes/ledger.json`), never a position
// argument. Without it, `ledger list --ledger <path>` read the path as a
// route filter and showed an empty ledger.
function posArg(argv) {
  return argv.find((a) => !a.startsWith('--') && !isFlagValue(argv, a))
}

function isFlagValue(argv, a) {
  const i = argv.indexOf(a)
  return i > 0 && argv[i - 1].startsWith('--') && !argv[i - 1].includes('=')
}

module.exports = { run }
