// eyestruct init - write the first .eyes/ state (manifest pin + empty
// ledger). The manifest is hand-editable after; the pin rows it seeds are
// the baseline identity every diff is meaningful inside of.

'use strict'

const fs = require('fs')
const path = require('path')
const manifest = require('./manifest')
const ledgerMod = require('./ledger')
const { fail } = require('./reasons')

function run(ctx) {
  const browserImage = flagValue(ctx.argv, '--browser-image')
  const renderer = flagValue(ctx.argv, '--renderer')
  const file = manifest.write(ctx.cwd, ctx, { browserImage, renderer })
  const ledgerFile = ledgerMod.ledgerPath(ctx.cwd, ctx)
  if (!fs.existsSync(ledgerFile)) {
    fs.mkdirSync(path.dirname(ledgerFile), { recursive: true })
    fs.writeFileSync(ledgerFile, '[]\n')
  }
  if (ctx.json) process.stdout.write(JSON.stringify({ ok: true, manifest: file, ledger: ledgerFile }, null, 2) + '\n')
  else process.stdout.write(`wrote ${path.relative(ctx.cwd, file)} + empty ledger\n`)
  return 0
}

function flagValue(argv, flag) {
  const i = argv.indexOf(flag)
  return i === -1 ? null : argv[i + 1]
}

module.exports = { run }
