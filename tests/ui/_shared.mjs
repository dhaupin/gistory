// Tiny harness shared by tests/ui/*.mjs — not a test itself (underscore-prefixed
// files are skipped by run.mjs).

export function createChecker(suiteName) {
  const results = []
  return {
    results,
    check(label, ok, detail) {
      results.push({ label, ok: !!ok, detail })
    },
    eq(label, actual, expected) {
      const ok = JSON.stringify(actual) === JSON.stringify(expected)
      results.push({
        label,
        ok,
        detail: ok ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      })
    },
    atLeast(label, actual, min) {
      const ok = typeof actual === 'number' && actual >= min
      results.push({ label, ok, detail: ok ? undefined : `expected >= ${min}, got ${actual}` })
    },
    report() {
      const failed = results.filter((r) => !r.ok)
      console.log(`\n--- ${suiteName} ---`)
      for (const r of results) {
        console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.label}${r.detail ? ' -> ' + r.detail : ''}`)
      }
      console.log(`  ${results.length - failed.length}/${results.length} checks passed`)
      return failed.length
    },
  }
}

/** Wait for exactly one new file to appear in `dir` and return its path. */
export async function waitForDownload(dir, timeoutMs = 15000) {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const files = fs.readdirSync(dir).filter((f) => !f.endsWith('.crdownload'))
    if (files.length) return path.join(dir, files[0])
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`no download appeared in ${dir} within ${timeoutMs}ms`)
}
