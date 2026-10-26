// src/lock.mjs - forge lock: the final pass. The doctor must be clean
// (fails refuse the lock; warns carry with a note), then the archive is
// stamped with a checksum so the lock is verifiable rather than verbal.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import doctor from './doctor.mjs'

export default async function lock(dir, opts = {}) {
  const r = await doctor(dir, opts)
  if (r.counts.fail > 0) {
    return { ok: false, error: `lock refused: ${r.counts.fail} doctor fail(s) - fix first, locks do not ship broken`, doctor: r }
  }
  let pkg
  try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) } catch { pkg = {} }
  // factory.json is the config-of-record: name/version come from it when the
  // authored npm layer is not yet real (rank: package.json outranks factory.json
  // only where the tool itself is versioned in npm; the factory config outranks
  // the dir name).
  let fcfg = {}
  try { fcfg = JSON.parse(readFileSync(join(dir, 'factory.json'), 'utf8')) } catch { fcfg = {} }
  const name = pkg.name || fcfg.name || dir.split('/').pop()
  const version = pkg.version || fcfg.version || '0.9.0'
  const out = opts.out || `${name}-${version}-lock.tar.gz`
  const outPath = join(dir, '..', out)

  // archive via a staging tree so the tar root is the versioned folder
  const stage = join(dir, '..', `${name}-lockstage`)
  rmSync(stage, { recursive: true, force: true })
  const archiveDir = join(stage, `${name}-${version}`)
  cpSync(dir, archiveDir, { recursive: true }) // includes .git: the lock is a resumable repo
  execFileSync('tar', ['czf', outPath, '-C', stage, `${name}-${version}`])
  rmSync(stage, { recursive: true, force: true })

  const sha = execFileSync('sha256sum', [out], { cwd: join(dir, '..'), encoding: 'utf8' }).split(' ')[0]
  return { ok: true, archive: out, sha: sha.slice(0, 16), doctor: r }
}
