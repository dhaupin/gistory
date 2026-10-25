// eyes-reference - the eye companion pack, poststruct side (the TEXT leg
// points at EYES). The family law it encodes: the text layer's job is not
// just to check that og:image tags EXIST - it must verify the referenced
// pixels are real, or markup can pass every text gate while the rendered
// image is escape soup (the founding og-image receipt).
//
// THE CONTRACT with the target (moduleCtx['eyes-reference']):
//   distDir          -> the baked site directory to scan
//   raster(rel)      -> { code, out } of the eyestruct raster gate for one
//                       file inside distDir (interop: the EYES leg is the
//                       renderer of record for vector art)
//   twinLookup(url)  -> { buf, label } | null - optional local mirror of a
//                       REMOTE image ref; when armed, the pixel battery runs
//                       against the twin and the verdict says so explicitly
//   readdir(rel) / exists(rel) / readBuf(rel) / text(rel) -> fs helpers
//
// Verdict taxonomy (family): REFUSED / BOUNDED / PASSED / EXPLOITED.

export const PKG = 'packs/public/eyes-reference'

export const REQUIRED_KEYS = ['distDir', 'raster', 'readdir', 'exists', 'readBuf', 'text']

function take(ctx, key) {
  const value = ctx?.[key]
  if (value == null) throw new TypeError(`${PKG}: moduleCtx['eyes-reference'].${key} is missing`)
  return value
}

function walkRecursive(readdir, relPrefix) {
  const out = []
  for (const name of readdir(relPrefix || '')) {
    const rel = relPrefix ? `${relPrefix}/${name}` : name
    if (/\.(html|htm)$/i.test(name)) out.push(rel)
    else if (Array.isArray(safeReaddir(readdir, rel))) out.push(...walkRecursive(readdir, rel))
  }
  return out.sort()
}

function safeReaddir(readdir, rel) {
  try { return readdir(rel) } catch { return null }
}

export function collectImageRefs(html, pageRel) {
  const refs = []
  const tagRe = /<meta[^>]+(?:og|twitter):(image|image:width|image:height|image:alt)[^>]*>/gi
  for (const tag of html.match(tagRe) || []) {
    const prop = /(?:og|twitter):(image(?::width|:height|:alt)?)/i.exec(tag)?.[1]?.toLowerCase() || ''
    const content = /content\s*=\s*"([^"]*)"/i.exec(tag)?.[1] || /content\s*=\s*'([^']*)'/i.exec(tag)?.[1]
    if (content != null) refs.push({ page: pageRel, prop, content })
  }
  return refs
}

export function pngDims(buf) {
  // PNG: 8-byte signature, IHDR at +8, width/height at IHDR+4/+8 (big endian)
  if (buf.length < 24) return null
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return 'not-png'
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

export function jpegDims(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 'not-jpeg'
  // Walk SOF markers for real dims (progressive + baseline both covered).
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) break
    const marker = buf[i + 1]
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue }
    const len = buf.readUInt16BE(i + 2)
    const sof = marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3
    if (sof) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
    i += 2 + len
  }
  return null // dims unknown; blocked entries are a FAIL, never a silent pass
}

function isSvg(buf, rel) {
  const head = Buffer.from(buf.subarray(0, 300)).toString('utf8')
  return (
    /\.svg$/i.test(rel || '') ||
    head.includes('<svg') ||
    head.includes('<?xml')
  )
}

const isPng = (buf) => buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
const isJpeg = (buf) => buf[0] === 0xff && buf[1] === 0xd8

class Refs {
  constructor() { this.rows = []; this.ok = true }
  passed(id, detail) { this.rows.push({ pack: 'eyes-reference', id, verdict: 'PASSED', detail: String(detail || '').slice(0, 220) }) }
  failed(id, fault) { this.ok = false; this.rows.push({ pack: 'eyes-reference', id, verdict: 'EXPLOITED', fault }) }
  bounded(id, owner, bound, detail) { this.rows.push({ pack: 'eyes-reference', id, verdict: 'BOUNDED', owner, bound, detail: String(detail || '').slice(0, 220) }) }
}

/**
 * The pixel battery for one image buffer. Returns
 *   { ok: true, detail }                       - all checks green
 *   { ok: false, fault: {...} }                - a named finding
 * opts.renderSvg(rel) is the EYES-leg raster interop; absent, an SVG twin
 * reports PASSED for bytes-but-dims-unverifiable only when magic says SVG
 * and the twin offered no renderer (a bounded nuance, not a fake pass).
 */
function checkImageBuffer(id, buf, opts = {}) {
  const { rel = 'twin', renderSvg = null, declared = { w: null, h: null } } = opts
  if (!buf || buf.length < 512) {
    return { ok: false, fault: { problem: 'image payload implausibly small for a social card', bytes: buf ? buf.length : 0 } }
  }
  if (isSvg(buf, rel)) {
    if (renderSvg) {
      const r = opts.renderSvg(rel)
      if (r && r.code === 0) return { ok: true, detail: `SVG rasterizes clean via eyestruct (${buf.length}B)` }
      return { ok: false, fault: { problem: 'og:image SVG refuses the raster gate (loads is not renders)', exit: r?.code, out: String(r?.out || '').slice(0, 200) } }
    }
    return { ok: true, detail: `SVG bytes load (${buf.length}B); raster interop needs the local path - the EYES leg owns the render when a twin is all we hold` }
  }
  if (!isPng(buf) && !isJpeg(buf)) {
    return { ok: false, fault: { problem: 'og:image is neither PNG nor JPEG (magic bytes)', head: Buffer.from(buf.subarray(0, 12)).toString('hex') } }
  }
  const dims = isPng(buf) ? pngDims(buf) : jpegDims(buf)
  if (dims === 'not-png' || dims === 'not-jpeg') {
    return { ok: false, fault: { problem: 'magic mismatch during the image parse', rel } }
  }
  if (!dims) {
    return { ok: false, fault: { problem: 'no image dimensions parsed (truncated head or blocked entry)', bytes: buf.length } }
  }
  if ((declared.w != null && declared.w !== dims.w) || (declared.h != null && declared.h !== dims.h)) {
    return { ok: false, fault: { problem: 'declared og:image dimensions disagree with the real pixels', declared: { w: declared.w, h: declared.h }, real: dims } }
  }
  return { ok: true, detail: `real ${isPng(buf) ? 'PNG' : 'JPEG'} ${dims.w}x${dims.h}, ${buf.length}B` }
}

export function run(ctx) {
  for (const key of REQUIRED_KEYS) take(ctx, key)
  const readdir = (rel) => ctx.readdir(rel)

  const results = new Refs()
  const pages = walkRecursive(readdir, '')
  if (!pages.length) {
    results.failed('baked-pages-found', { problem: `no .html under ${ctx.distDir} - bake first; the pack cannot audit what was never built` })
    return { ok: results.ok, rows: results.rows }
  }

  const images = new Map() // declared ref -> [{ page, prop, content }]
  for (const pageRel of pages) {
    const html = ctx.text(pageRel)
    for (const ref of collectImageRefs(html || '', pageRel)) {
      if (ref.prop === 'image') {
        const list = images.get(ref.content) || []
        list.push(pageRel)
        images.set(ref.content, list)
      }
    }
  }

  if (!images.size) {
    // "Not declared at all" is the TEXT leg's finding (poststruct flags it).
    // The eye checks what exists; faking a row here would be a fake pass.
    results.passed('social-image-refs-present', 'no og/twitter image declarations found - text leg owns that finding, the eye verifies what exists')
    return { ok: results.ok, rows: results.rows }
  }

  for (const [ref, referencingPages] of images) {
    const id = `og-image:${ref}`
    // Declared dims come from whichever page declares them (first non-null).
    let declared = { w: null, h: null }
    for (const pageRel of referencingPages) {
      const refs = collectImageRefs(ctx.text(pageRel) || '', pageRel)
      const dw = refs.find((r) => r.prop === 'image:width')
      const dh = refs.find((r) => r.prop === 'image:height')
      if (dw && declared.w == null) declared.w = Number(dw.content)
      if (dh && declared.h == null) declared.h = Number(dh.content)
    }

    if (ref.startsWith('http://') || ref.startsWith('https://')) {
      // Absolute URLs hand the pixels to a remote host; sockets belong to
      // the crashtest lane. A local twin, when armed, makes the battery
      // deterministic again - and the verdict says so explicitly.
      const twin = typeof ctx.twinLookup === 'function' ? ctx.twinLookup(ref) : null
      if (twin && twin.buf) {
        const verdict = checkImageBuffer(id, twin.buf, { rel: twin.label || 'twin', declared })
        if (verdict.ok) results.passed(id, `${verdict.detail} (verified through a local twin: ${twin.label || ref})`)
        else results.failed(id, { ...verdict.fault, mirrored: twin.label || ref })
      } else {
        results.bounded(id, 'eyes-reference@0.1.0', 'remote-hrefs-out-of-scope', `${ref} on ${referencingPages.join(', ')} - no local twin armed; the EYES leg can look it with the pinned browser`)
      }
      continue
    }

    const rel = ref.replace(/^\.\//, '').replace(/^\//, '')
    if (!ctx.exists(rel)) {
      results.failed(id, { problem: 'og:image points at a file that does not exist', referencedBy: referencingPages })
      continue
    }
    const buf = ctx.readBuf(rel)
    const verdict = checkImageBuffer(id, buf, {
      rel,
      declared,
      renderSvg: (svgRel) => ctx.raster(svgRel),
    })
    if (verdict.ok) results.passed(id, verdict.detail)
    else results.failed(id, verdict.fault)
  }

  return { ok: results.ok, rows: results.rows }
}

// SPEC section 3: every entry carries a default export - the loader loads
// the default; the named exports above are the packlint census surface.
export default { run, PKG, REQUIRED_KEYS }
