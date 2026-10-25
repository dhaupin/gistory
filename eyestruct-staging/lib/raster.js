// eyestruct raster - the raster gate. Strict parse + render + byte-size
// sanity for every artifact committed as visual evidence. If no renderer is
// available the gate refuses honestly (MISSING_RENDER, exit 2) - it NEVER
// fake-passes, because "loads" and "renders" are separate assertions and
// only the second is sight (the unrenderable-stone receipt).

'use strict'

const fs = require('fs')
const { fail } = require('./reasons')

function run(ctx) {
  const files = ctx.argv.filter((a) => !a.startsWith('--') && !isFlagValue(ctx.argv, a))
  if (!files.length) fail('UNKNOWN_COMMAND', 'raster needs at least one file')

  let Renderer
  try {
    ;({ Resvg: Renderer } = require('@resvg/resvg-js'))
  } catch {
    fail('MISSING_RENDER')
  }

  const results = []
  for (const file of files) {
    const svg = fs.readFileSync(file, 'utf8')
    let png
    try {
      png = new Renderer(svg, {}).render().asPng()
    } catch (err) {
      fail('RASTER_BAD_XML', `${file}: ${err.message}`)
    }
    if (png.length < 512) fail('RASTER_TRIVIAL', `${file}: rendered ${png.length} bytes`)
    results.push({ file, opaque: png.length })
  }
  if (ctx.json) process.stdout.write(JSON.stringify({ ok: true, results }, null, 2) + '\n')
  else for (const r of results) process.stdout.write(`raster OK  ${r.file}  (${r.opaque} bytes opaque)\n`)
  return 0
}

function isFlagValue(argv, a) {
  const i = argv.indexOf(a)
  return i > 0 && argv[i - 1].startsWith('--') && !argv[i - 1].includes('=')
}

module.exports = { run }
