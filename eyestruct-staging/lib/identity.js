// Who captured? Agent + commit ride named environment keys; the ledger
// records them for the receipt trail. Absent values degrade to neutral
// stamps so tests and one-off runs stay deterministic.
'use strict'
module.exports = {
  agent() { return process.env.EYESTRUCT_AGENT || 'local-agent' },
  commit() { return process.env.EYESTRUCT_COMMIT || 'uncommitted' },
}
