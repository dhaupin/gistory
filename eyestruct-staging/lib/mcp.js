// eyestruct mcp - the stdio MCP surface. THE PRINCIPLE: the CLI is the
// contract, the MCP server is a decoding of it - same verbs, same named
// reason-codes, same exit CONTRACT semantics mapped to MCP tool errors,
// and never a process exit inside a server (`fail()` throws FailError;
// the boundary here converts it, exactly like bin/eyestruct.js does).
//
// Transport: newline-delimited JSON-RPC 2.0 over stdio (the MCP stdio
// transport shape). Zero dependencies; the verbs are the library modules
// the CLI itself calls - one writer of truth per store, always.
//
// Perception follows the CORE LAW (smallest artifact that answers the
// question): `look` returns the element map + meta by DEFAULT; the pixels
// ride as image content only when the client asks (include_image). An
// image-capable model burns the pixels when it needs them; a metric-only
// query never pays for them.
//
// Tools:
//   look(url, viewport?, theme?, region?, include_image?)
//   diff(url, against?, viewport?, theme?)
//   adopt(artifact, note)          -> unratified proposal, canon CI-cut
//   ratify(base_url)               -> re-capture vs baseline (CI-cut proof)
//   ledger_list(route?) | ledger_show(id)
//   gate() | raster(files[]?) | walk(base_url)

'use strict'

const fs = require('fs')
const path = require('path')

const { FailError } = require('./reasons')

function readStdinLines(onLine, onEnd) {
  let chunk = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (d) => {
    chunk += d
    let i
    while ((i = chunk.indexOf('\n')) !== -1) {
      const line = chunk.slice(0, i).trim()
      chunk = chunk.slice(i + 1)
      if (line) onLine(line)
    }
  })
  process.stdin.on('end', onEnd)
}

function manifestRead(cwd, ctx) {
  return require('./manifest').read(cwd, ctx || {})
}

function flagValue(argv, flag) {
  const i = argv.indexOf(flag)
  return i === -1 ? null : argv[i + 1]
}

function engine() {
  const engine = require('./engine')
  if (typeof engine.capture !== 'function') throw new FailError('MISSING_PINNED_BROWSER')
  return engine
}

// --- Verb decodings (library-level, never a subprocess) --------------------

const DEFAULT_VIEWPORT = '1280x800'
const DEFAULT_BASE_URL = 'http://localhost:5178'

async function toolLook(cwd, args) {
  const m = manifestRead(cwd, {})
  const url = args.url
  if (!url) throw new FailError('UNKNOWN_COMMAND', 'look needs an http(s) or file:// url')
  const includeImage = !!args.include_image
  const cap = await engine().capture({
    url,
    argv: [],
    pin: m.pin,
    viewport: args.viewport || DEFAULT_VIEWPORT,
    theme: args.theme,
    region: args.region,
  })
  const candDir = path.join(cwd, '.eyes-candidates')
  fs.mkdirSync(candDir, { recursive: true })
  let file = null
  if (includeImage) {
    const base = (Date.now() % 100000) + 'mcp.png'
    file = path.join(candDir, base)
    fs.writeFileSync(file, cap.png)
  }
  const content = [{
    type: 'text',
    text: JSON.stringify({
      verdict: 'captured',
      bytes: cap.png.length,
      elementsMapped: cap.map.length,
      version: cap.version,
      map: cap.map,
      note: 'candidate artifact; baseline + ledger go through adopt',
    }, null, 2),
  }]
  if (includeImage) {
    content.push({ type: 'image', data: Buffer.from(cap.png).toString('base64'), mimeType: 'image/png' })
  }
  return content
}

async function toolDiff(cwd, args) {
  const m = manifestRead(cwd, {})
  const url = args.url || DEFAULT_BASE_URL + '/'
  const eyesDir = path.dirname(m.file)
  let baselineFile
  if (args.against) baselineFile = path.join(eyesDir, args.against)
  else baselineFile = path.join(eyesDir, slotOfFirst(m), 'current.png')
  if (!fs.existsSync(baselineFile)) throw new FailError('NO_BASELINE', path.relative(cwd, baselineFile))
  const cap = await engine().capture({
    url,
    argv: [],
    pin: m.pin,
    viewport: args.viewport || DEFAULT_VIEWPORT,
    theme: args.theme,
  })
  const baseBytes = fs.statSync(baselineFile).size
  const same = cap.png.length === baseBytes
  return [{
    type: 'text',
    text: JSON.stringify({
      verdict: same ? 'SAME' : 'DIFFERS',
      bytes: { baseline: baseBytes, fresh: cap.png.length },
      elementsMapped: cap.map.length,
      note: same
        ? 'fresh capture matches the committed baseline (memory is honest)'
        : 'drift! the NEXT step is diff/adopt in the CLI - a local DIFFERS becomes canon only via adopt + CI-cut',
    }, null, 2),
  }]
}

function slotOfFirst(m) {
  const first = m.routes[0]
  if (!first) throw new FailError('NO_BASELINE', 'manifest declares no routes')
  const slug = (first.path === '/' ? 'home' : first.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')) || 'page'
  return `${slug}/${first.view}`
}

function toolAdopt(cwd, args) {
  const ledger = require('./ledger')
  if (!args.artifact) throw new FailError('UNKNOWN_COMMAND', 'adopt needs the artifact target (route/view or slot/current.png)')
  const note = args.note // enforce at the same surface the CLI does
  if (!note || !note.trim()) throw new FailError('ADOPT_NOTE_REQUIRED')
  const row = ledger.append(ledger.ledgerPath(cwd, {}), {
    type: 'adopt',
    agent: require('./identity').agent(),
    commit: require('./identity').commit(),
    artifact: args.artifact,
    note,
    ratified: false,
  })
  return [{ type: 'text', text: JSON.stringify({ proposed: row.id, ratified: false }, null, 2) }]
}

async function toolRatify(cwd, args) {
  const m = manifestRead(cwd, {})
  if (!m.routes.length) throw new FailError('WALK_EMPTY')
  const base = args.base_url || DEFAULT_BASE_URL
  const engineImpl = engine()
  const verified = []
  const unverified = []
  for (const route of m.routes) {
    const slug = (route.path === '/' ? 'home' : route.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')) || 'page'
    const slot = `${slug}/${route.view}`
    const baseline = path.join(path.dirname(m.file), slot, 'current.png')
    if (!fs.existsSync(baseline)) { unverified.push({ slot, reason: 'NO_BASELINE' }); continue }
    const cap = await engineImpl.capture({ url: (base.endsWith('/') ? base.slice(0, -1) : base) + route.path, argv: [], pin: m.pin, viewport: route.viewport, theme: route.theme })
    const same = Buffer.from(cap.png).equals(fs.readFileSync(baseline))
    if (!same) { unverified.push({ slot, reason: 'DIFFERS' }); continue }
    const ledger = require('./ledger')
    const row = ledger.append(ledger.ledgerPath(cwd, {}), {
      type: 'ratify',
      agent: require('./identity').agent(),
      commit: require('./identity').commit(),
      artifact: `${slot}/current.png`,
      note: `reproduced byte-identical (${fs.statSync(baseline).size}B) in the pinned environment (mcp)`,
      pin: m.pin['browser-image'],
      verified: true,
    })
    verified.push({ slot, row: row.id })
  }
  return [{
    type: 'text',
    text: JSON.stringify({ verdict: unverified.length ? 'NOT_REPRODUCIBLE' : 'REPRODUCED', verified, unverified }, null, 2),
  }]
}

function toolLedgerList(cwd, args) {
  const ledger = require('./ledger')
  let rows = ledger.load(ledger.ledgerPath(cwd, {}))
  if (args && args.route) rows = rows.filter((r) => r.artifact && String(r.artifact).includes(args.route))
  return [{ type: 'text', text: JSON.stringify(rows.map((r) => ({ id: r.id, type: r.type, artifact: r.artifact, note: r.note, ratified: r.ratified, verified: r.verified })), null, 2) }]
}

function toolLedgerShow(cwd, args) {
  const ledger = require('./ledger')
  const rows = ledger.load(ledger.ledgerPath(cwd, {}))
  const row = rows.find((r) => r.id === args.id)
  if (!row) throw new FailError('UNKNOWN_COMMAND', `no ledger row ${args.id}`)
  return [{ type: 'text', text: JSON.stringify(row, null, 2) }]
}

function toolGate(cwd) {
  const gate = require('./gate')
  const captured = captureStdoutQuietly(() => gate.run({ cwd, json: true }))
  let parsed = null
  try { parsed = JSON.parse(captured.out) } catch { /* keep the raw shape */ }
  return [{ type: 'text', text: JSON.stringify({ code: captured.code, gate: parsed || captured.out.trim() }, null, 2) }]
}

function toolRaster(cwd, args) {
  const raster = require('./raster')
  const files = (args && Array.isArray(args.files)) ? args.files : []
  const captured = captureStdoutQuietly(() => raster.run({ cwd, json: true, argv: files }))
  return [{ type: 'text', text: JSON.stringify({ code: captured.code, out: captured.out.trim() }, null, 2) }]
}

async function toolWalk(cwd, args) {
  const m = manifestRead(cwd, {})
  if (!m.routes.length) throw new FailError('WALK_EMPTY')
  const base = args.base_url || DEFAULT_BASE_URL
  const engineImpl = engine()
  const rows = []
  for (const route of m.routes) {
    const joined = (base.endsWith('/') ? base.slice(0, -1) : base) + route.path
    const cap = await engineImpl.capture({ url: joined, argv: [], pin: m.pin, viewport: route.viewport, theme: route.theme })
    const candDir = path.join(cwd, '.eyes-candidates')
    fs.mkdirSync(candDir, { recursive: true })
    const file = path.join(candDir, `walk__${route.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'root'}_${route.view}_${route.theme}.png`)
    fs.writeFileSync(file, cap.png)
    rows.push({ route: route.path, view: route.view, file: path.relative(cwd, file), bytes: cap.png.length, mapped: cap.map.length })
  }
  return [{ type: 'text', text: JSON.stringify({ walked: rows.length, rows }, null, 2) }]
}

const TOOLS = [
  {
    name: 'look',
    description: 'Capture real pixels of a surface through the pinned browser: one pass yields the element map (+ optional image), never a second render',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'http(s) or file:// target' },
        viewport: { type: 'string', description: 'WxH (default 1280x800)' },
        theme: { type: 'string', enum: ['dark', 'light'] },
        region: { type: 'string', description: 'CSS selector for the cheap layer' },
        include_image: { type: 'boolean', description: 'pay the pixel cost: attach the PNG' },
      },
      required: ['url'],
    },
    run: toolLook,
  },
  {
    name: 'diff',
    description: 'Fresh capture vs committed baseline; SAME/DIFFERS by byte equality inside the pin',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        against: { type: 'string', description: 'eyes-relative artifact path (default the manifest first route)' },
        viewport: { type: 'string' },
        theme: { type: 'string', enum: ['dark', 'light'] },
      },
    },
    run: toolDiff,
  },
  {
    name: 'adopt',
    description: 'Propose a baseline change. Canon is CI-cut: proposals ride ratified:false until the pinned environment reproduces them',
    inputSchema: {
      type: 'object',
      properties: { artifact: { type: 'string' }, note: { type: 'string' } },
      required: ['artifact', 'note'],
    },
    run: toolAdopt,
  },
  {
    name: 'ratify',
    description: 'Re-capture every manifested route in the pinned env; byte-identical slots ride append-only ratify rows (CI-cut proof)',
    inputSchema: {
      type: 'object',
      properties: { base_url: { type: 'string' } },
    },
    run: toolRatify,
  },
  {
    name: 'ledger_list',
    description: 'The committed memory: every ledger row, optional artifact filter',
    inputSchema: { type: 'object', properties: { route: { type: 'string' } } },
    run: toolLedgerList,
  },
  {
    name: 'ledger_show',
    description: 'One ledger row, complete',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: toolLedgerShow,
  },
  {
    name: 'gate',
    description: 'The CI job: exit-contract verdict on unexplained .eyes/ drift',
    inputSchema: { type: 'object' },
    run: toolGate,
  },
  {
    name: 'raster',
    description: 'Strict parse + render + byte-size sanity for committed renderables (SVG stones)',
    inputSchema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } } } },
    run: toolRaster,
  },
  {
    name: 'walk',
    description: 'Every route x viewport x theme in the manifest, one pass, proof images in .eyes-candidates/',
    inputSchema: { type: 'object', properties: { base_url: { type: 'string' } } },
    run: toolWalk,
  },
]

// --- The JSON-RPC surface ---------------------------------------------------

const SERVER_INFO = { name: 'eyestruct', version: '0.9.0' }
const PROTOCOL_VERSION = '2024-11-05'

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }, null, 0) + '\n')
}

function toolErr(id, code, message) {
  process.stdout.write(JSON.stringify({
    jsonrpc: '2.0', id,
    result: { isError: true, content: [{ type: 'text', text: message }] },
  }, null, 0) + '\n')
}

let stopped = false

/**
 * CLI verbs print to the stream; inside a JSON-RPC tunnel that stdout is
 * FRAMING, not output. Capture it, return to the caller as part of the tool
 * result, and keep the transport honest - a stray console line inside the
 * stdio channel would read as a JSON-RPC parse error on the client side.
 */
function captureStdoutQuietly(fn) {
  const realWrite = process.stdout.write
  const bufferedOutput = []
  process.stdout.write = function (string, a, b, c) {
    bufferedOutput.push(String(string))
    return true
  }
  let code = 0
  try {
    code = Number(fn()) || 0
  } finally {
    process.stdout.write = realWrite
  }
  return { code: code, out: bufferedOutput.join('') }
}

function startServer(cwd) {
  // Promise resolves on transport EOF, so the CLI boundary stays the owner
  // of process lifetime (the bin awaits it, then applies the exit contract).
  return new Promise((resolve) => {
    readStdinLines((line) => {
    if (stopped) return
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error (a request line was not JSON)' } }, null, 0) + '\n')
      return
    }
    const { id, method, params } = msg
    if (method === 'initialize') {
      reply(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO })
      return
    }
    if (method === 'notifications/initialized') {
      // A JSON-RPC notification: intentionally un-answered. Staying
      // silent here is the protocol, not a bug.
      return
    }
    if (method === 'ping') {
      reply(id, {})
      return
    }
    if (method === 'tools/list') {
      reply(id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      })
      return
    }
    if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === params.name)
      if (!tool) {
        toolErr(id, '-32602', `unknown tool: ${params ? params.name : '?'}`)
        return
      }
      Promise.resolve()
        .then(() => tool.run(cwd, params.arguments || {}))
        .then((content) => reply(id, { content }))
        .catch((err) => {
          if (err instanceof FailError) toolErr(id, '-32603', err.message)
          else toolErr(id, '-32603', `internal error: ${err && err.message}`)
        })
      return
    }
    toolErr(id, '-32601', `unknown method: ${method}`)
  }, () => {
    resolve(0)
  })
  })
}

module.exports = { startServer, TOOLS, SERVER_INFO }

if (require.main === module) {
  startServer(process.cwd() || '.')
}
