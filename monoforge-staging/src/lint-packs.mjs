// monoforge lint-packs - the opt-in packstruct passthrough (issue-shaped
// after crashtest's lint-packs verb, issue #32, ported from eyestruct's
// lib/lint-packs.js): when the factory's own packs land, the pack lint
// lane runs packstruct over the repo's own install - node_modules/.bin
// first, then PATH - never downloading or bundling one (zero-dependency
// law of the factory: no install step exists to run).
//
// Policy (pinned, honest-skip vs loud):
//   - explicitly invoked with no packstruct installed -> exit 2 naming the
//     fix (a never-working requested lane is a broken config, not a skip)
//   - present but exits non-zero -> verdicts pass through verbatim; the
//     exit code rides (0 clean / 1 findings / 2 packstruct's own config
//     class).
// Passthrough fidelity: the exit code IS the verdict. The default dir is
// the packs ROOT (never packs/public alone - the gistory footgun that
// reads as "0 packs checked, missing packs/public/public/"); an explicit
// dir passes through UNTOUCHED.
//
// Usage: monoforge lint-packs [--deep] [--json] [--against <lib>] [dir]

'use strict'

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

export const PACKSTRUCT_FIX =
  'fix: npm i -D packstruct@<exact> - install packstruct as an EXACT devDependency (same commit -> same findings applies to the linter too; this lane never downloads one)'

function packstructInstalled(cwd) {
  if (existsSync(path.join(cwd, 'node_modules', '.bin', 'packstruct'))) return 'local'
  const probe = spawnSync('packstruct', ['--version'], { encoding: 'utf8' })
  if (probe.error && probe.error.code === 'ENOENT') return null
  return 'path'
}

function spawnPackstruct(cwd, args) {
  const source = packstructInstalled(cwd)
  if (!source) return { error: { code: 'ENOENT' } }
  if (source === 'local') {
    return spawnSync(path.join(cwd, 'node_modules', '.bin', 'packstruct'), args, { encoding: 'utf8', stdio: 'inherit' })
  }
  return spawnSync('packstruct', args, { encoding: 'utf8', stdio: 'inherit' })
}

function flagValue(argv, flag) {
  const i = argv.indexOf(flag)
  return i === -1 ? undefined : argv[i + 1]
}

function posArg(argv) {
  return argv.find((a) => !a.startsWith('--') && a !== flagValue(argv, '--against'))
}

// Run the lint lane, return the process exit code (0 green / 1 findings /
// 2 setup refusal). The factory keeps its zero-dep law until the packs
// land: no packstruct dep is installed here, so today's invocation is the
// loud exit 2, never a silent skip.
export function runLintPacks(opts = {}) {
  const cwd = opts.cwd || process.cwd()
  const argv = opts.argv || []
  const args = ['lint', posArg(argv) || 'packs']
  if (argv.includes('--deep')) args.push('--deep')
  if (opts.json) args.push('--json')
  const against = flagValue(argv, '--against')
  if (against !== undefined) args.push('--against', against)
  process.stdout.write(`monoforge lint-packs: running packstruct over ${args[1]} (the repo's own install - never downloaded); ${args.join(' ')}\n`)
  const res = spawnPackstruct(cwd, args)
  if (res.error && res.error.code === 'ENOENT') {
    console.error(PACKSTRUCT_FIX)
    return 2
  }
  // Passthrough fidelity: the exit code IS the verdict.
  return res.status ?? 1
}

export default { run: runLintPacks }
