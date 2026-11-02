// release-notes - the GH release creation step's one job: extract the
// CHANGELOG section for the version argument (default: the checkout's
// own) so the release object and the changelog cannot disagree. `node scripts/release-notes.cjs
// [version]`; empty output + exit 1 means the changelog has no section
// for that version, and the release job refuses to mint one without
// notes (a release with a wrong or empty body is drift, not content).

'use strict'
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const version = process.argv[2] || JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version
const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8')

const heading = `## [${version}]`
const start = changelog.indexOf(heading + ' ')
if (start === -1) {
  process.stderr.write(`release-notes: no "## [${version}]" section in CHANGELOG.md - the tag and the changelog disagree\n`)
  process.exit(1)
}
// Slice from the END of the heading line, not from just after the closing
// bracket: the heading is `## [version] - date`, and a slice at
// start + heading.length carries the heading's own date into the body
// (the notes then open with a stray `- 2026-10-28` bullet - caught by the
// 1.1.0 dry run, the first lane run that actually rides this extraction).
const headingLineEnd = changelog.indexOf('\n', start)
const rest = changelog.slice(headingLineEnd + 1)
// The section runs to the next release heading, or to EOF when this is the
// newest (and last) heading - the first cut's own case. An absent following
// heading is not an empty section; the emptiness check below is the real
// judge.
const next = rest.indexOf('\n## [')
const section = (next === -1 ? rest : rest.slice(0, next)).trim()
if (!section) {
  process.stderr.write(`release-notes: the "## [${version}]" section is empty\n`)
  process.exit(1)
}
process.stdout.write(section + '\n')
