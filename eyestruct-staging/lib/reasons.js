// Named reason-codes + the exit contract. No bare stack traces leave the CLI:
// failures print a NAME and a one-line explanation, in prose and in --json.
//
// fail() THROWS a FailError instead of process.exit: a library must never own
// process lifetime (an in-process caller - a unit test, the future MCP server
// - died with the whole runner otherwise). The CLI boundary converts the
// error into the exit contract; only the boundary exits.
//
// Exit contract (prd-eyes "Design rulings"):
//   0  green, or a result that is fully explained
//   1  drift/refusal with a reason-code
//   2  setup/capability error (missing manifest, missing pinned browser)

'use strict'

const CODES = {
  UNKNOWN_COMMAND: 1,
  MISSING_MANIFEST: 2,
  MISSING_PINNED_BROWSER: 2,
  MISSING_RENDER: 2,
  LEDGER_CORRUPT: 2,
  MANIFEST_CORRUPT: 2,
  UNRECORDED: 1,
  DANGLING_ROW: 1,
  PIN_MISMATCH: 1,
  ADOPT_NOTE_REQUIRED: 1,
  RASTER_BAD_XML: 1,
  RASTER_TRIVIAL: 1,
  WALK_EMPTY: 1,
  CROP_TARGET_MISSING: 1,
  CROP_TOO_BIG: 1,
  BAD_VIEWPORT: 1,
  BAD_THEME: 1,
  CAPTURE_BLOCKED: 1,
  CAPTURE_TOO_SKELETAL: 1,
  NO_BASELINE: 1,
  UNSAFE_TEXT: 1,
  MCP_POST_MVP: 2,
}

const REASONS = {
  UNKNOWN_COMMAND: 'not an eyestruct command',
  MISSING_MANIFEST: 'no .eyes/manifest.yml - run `eyestruct init` first',
  MISSING_PINNED_BROWSER: 'the pinned browser is not installed on this machine',
  MISSING_RENDER: 'no raster renderer available (install the optional @resvg/resvg-js package)',
  LEDGER_CORRUPT: 'the ledger file is not parseable append-only JSON rows',
  MANIFEST_CORRUPT: 'the manifest does not parse as the pin + route matrix schema',
  UNRECORDED: 'a committed .eyes/ artifact has no ledger row explaining it',
  DANGLING_ROW: 'a ledger row references an artifact that no longer exists',
  PIN_MISMATCH: 'capture ran on a pin other than the manifest baseline pin',
  ADOPT_NOTE_REQUIRED: 'adopt requires --note explaining the change',
  RASTER_BAD_XML: 'the artifact does not parse as strict SVG/XML',
  RASTER_TRIVIAL: 'the artifact rendered to nothing or an implausibly small payload',
  WALK_EMPTY: 'the manifest declares no routes to walk',
  CROP_TARGET_MISSING: 'the --region selector matched nothing on the page',
  CROP_TOO_BIG: 'the --region selector is over the cheap-layer size cap',
  BAD_VIEWPORT: 'viewport must be WxH within the sane range',
  BAD_THEME: 'theme must be dark|light',
  CAPTURE_BLOCKED: 'the pinned browser could not complete the capture',
  CAPTURE_TOO_SKELETAL: 'the capture is implausibly small (a blank frame is not a look)',
  NO_BASELINE: 'no committed baseline to diff against - capture with `look` then `adopt`',
  UNSAFE_TEXT: 'a text field carries a control character that would poison downstream readers',
  MCP_POST_MVP: 'the MCP surface lands after the CLI receipts are proven',
}

function emit(code, extra) {
  const reason = REASONS[code] || code
  const line = `eyestruct[${code}]: ${reason}${extra ? ' - ' + extra : ''}`
  return { exit: CODES[code] === undefined ? 1 : CODES[code], code, line }
}

class FailError extends Error {
  constructor(code, extra) {
    const out = emit(code, extra)
    super(out.line)
    this.name = 'FailError'
    this.code = code
    this.exit = out.exit
  }
}

/** Refuse with a named reason-code. Throws; the CLI boundary exits. */
function fail(code, extra) {
  throw new FailError(code, extra)
}

module.exports = { CODES, REASONS, emit, fail, FailError }
