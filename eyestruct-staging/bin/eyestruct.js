#!/usr/bin/env node
// eyestruct CLI dispatch - every command is one short process.
// Exit contract (lib/reasons.js): 0 green/explained, 1 drift/refusal with a
// named reason, 2 setup/capability. No bare stack traces ever.

'use strict'

const { fail, FailError } = require('../lib/reasons')

const COMMANDS = {
  init: require('../lib/init'),
  look: require('../lib/look').runLook,
  diff: require('../lib/look').runDiff,
  adopt: require('../lib/adopt'),
  ledger: require('../lib/ledger-cli'),
  gate: require('../lib/gate'),
  raster: require('../lib/raster'),
  ratify: require('../lib/ratify'),
  walk: require('../lib/walk'),
  // The MCP server owns the process lifetime until stdin closes - it reads
  // the transport stream directly, so it is a starter, not a per-call impl.
  // The MCP server runs until transport EOF; it owns the stream, the bin
  // owns the exit contract on its resolve value.
  mcp: (ctx) => require('../lib/mcp').startServer(ctx.cwd),
}

function usage() {
  return `eyestruct v0.9.0 - eyes for production agents

Commands (each is one short process; the only surviving state is .eyes/):
  init [--browser-image TAG] [--renderer resvg@V]   write .eyes/manifest.yml + empty ledger
  look <url> [--viewport WxH] [--theme T] [--region SEL] [--browser-exec P]
  diff <url> [--against PATH]         fresh capture vs committed baseline (candidity: look then adopt)
  adopt <route/view> --note "..."    propose a baseline change (canon is CI-cut)
  ledger list [ROUTE] | show ID      read the memory
  gate                               CI job: exit 1 on unexplained .eyes/ drift
  raster [file...]                   strict parse + render + byte-size sanity
  walk <base-url>                    every route x viewport x theme, one pass
  ratify <base-url>                  canon cut: re-capture every manifest route in the pinned env; byte-identical slots ride append-only ratify rows
  mcp                                stdio MCP surface (same verbs as tools)

Flags: --ledger PATH --manifest PATH --json
`
}

function posArg(argv) {
  return argv.find((a) => !a.startsWith('--'))
}

// gistory#9 C1: global flags may ride in FRONT of the verb too
// ("eyestruct --manifest X gate" now dispatches like "eyestruct gate
// --manifest X"). The leading window is an uninterrupted run of the two
// value-carrying globals (--ledger PATH, --manifest PATH) and the boolean
// global (--json); anything else leading still refuses UNKNOWN_COMMAND, so
// a typo can never silently reorder into a verb's positional.
const GLOBAL_VALUE_FLAGS = ['--ledger', '--manifest']
const GLOBAL_BOOL_FLAGS = ['--json']

function pullGlobalPrefix(argv) {
  const flags = []
  let i = 0
  while (i < argv.length && argv[i].startsWith('--')) {
    const t = argv[i]
    if (GLOBAL_VALUE_FLAGS.includes(t)) {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        fail('UNKNOWN_COMMAND', `"${t}" expects a value before the verb`)
      }
      flags.push(t, argv[i + 1])
      i += 2
      continue
    }
    if (GLOBAL_BOOL_FLAGS.includes(t)) {
      flags.push(t)
      i += 1
      continue
    }
    break
  }
  return { verb: argv[i], flags, after: i + 1 }
}

async function main() {
  const argv0 = process.argv.slice(2)
  const prefix = argv0.length && argv0[0].startsWith('--') ? pullGlobalPrefix(argv0) : null
  const cmd = prefix ? prefix.verb : argv0[0]
  if (!cmd || cmd === '--help' || cmd === '-h') {
    process.stdout.write(usage())
    process.exit(0)
  }
  const impl0 = COMMANDS[cmd]
  if (!impl0) fail('UNKNOWN_COMMAND', `"${cmd}" is not an eyestruct command`)
  const impl = typeof impl0 === 'function' ? impl0 : impl0.run
  const args = prefix
    ? [...prefix.flags, ...argv0.slice(prefix.after + 1)]
    : argv0.slice(1)
  // The host-owned locations: gistory keeps its eyes at labs/.eyes (next to
  // crashledger.json), other repos keep the .eyes default. usage() promised
  // these flags; they were parsed nowhere before - the defaults were the
  // only honored path. flags objects are READ here once and travel inside
  // ctx, so every verb resolves the same two files the dispatch named.
  const code = await impl({
    argv: args,
    cwd: process.cwd(),
    json: args.includes('--json'),
    manifest: flagValue(args, '--manifest'),
    ledger: flagValue(args, '--ledger'),
  })
  process.exit(code === true || code === undefined ? 0 : code)
}

function flagValue(argv, flag) {
  const i = argv.indexOf(flag)
  return i === -1 ? null : argv[i + 1]
}

main().catch((err) => {
  if (err instanceof FailError) {
    // The exit contract, applied at the boundary. A refusal here is the
    // product working as specified, not a crash.
    process.stderr.write(err.message + '\n')
    process.exit(err.exit)
  }
  process.stderr.write(`eyestruct: internal error: ${err && err.message}\n`)
  process.exit(2)
})
