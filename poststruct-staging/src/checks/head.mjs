// src/checks/head.mjs - per-page head hygiene. Ported from the battle-tested
// creadev audit script (round-trip tested on 16 production routes, negative
// test proven: doctored output -> FAILs -> exit 1).
import { grabMeta } from '../core.mjs'

export const OG = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name', 'og:locale']
export const TW = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']
export const LB_RECOMMENDED = ['name', 'url', 'image', 'logo', 'telephone', 'priceRange', 'openingHoursSpecification', 'geo', 'sameAs']

export function auditHead(pageModel, f, { is404 = false } = {}) {
  const { page, html, head } = pageModel
  const label = is404 ? page : page

  // 404 contract: noindex, nothing else strict. 404s are not indexable pages,
  // so applying the full head contract there would be noise, not signal.
  if (is404) {
    const robots = grabMeta(head, 'name', 'robots') || ''
    if (!/noindex/.test(robots)) f.fail(label, 'head/404-noindex-missing', '404 page missing noindex robots directive')
    return
  }

  // title
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/)
  if (!title || !title[1].trim()) {
    f.fail(page, 'head/title-missing', 'missing <title>')
  } else {
    const t = title[1].replace(/&amp;/g, '&').length
    if (t > 65) f.warn(page, 'head/title-length', `title ${t} chars (> 65, may truncate)`)
    if (t < 10) f.warn(page, 'head/title-length', `title ${t} chars (suspiciously short)`)
  }

  // description
  const desc = grabMeta(head, 'name', 'description')
  if (!desc) f.fail(page, 'head/description-missing', 'missing meta description')
  else if (desc.length < 70 || desc.length > 165) f.warn(page, 'head/description-length', `description ${desc.length} chars (outside 70-165, may truncate)`)

  // canonical
  const canonical = head.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/)
  if (!canonical || !canonical[1]) f.fail(page, 'head/canonical-missing', 'missing canonical link')
  else if (!/^https?:\/\//.test(canonical[1])) f.fail(page, 'head/canonical-relative', `canonical not absolute: ${canonical[1]}`)

  // OG + Twitter sets
  for (const prop of OG) {
    if (!grabMeta(head, 'property', prop)) f.fail(page, `head/${prop}-missing`, `missing ${prop}`)
  }
  for (const name of TW) {
    if (!grabMeta(head, 'name', name)) f.fail(page, `head/${name}-missing`, `missing ${name}`)
  }

  // og:image hygiene: SVG og:image invisibly blanks Facebook/X/LinkedIn
  // previews - the bug class that cost a real site its share cards.
  const ogImage = grabMeta(head, 'property', 'og:image')
  if (ogImage && /\.svg($|\?)/i.test(ogImage)) {
    f.fail(page, 'head/og-image-svg', `og:image is SVG (${ogImage}) - most social scrapers cannot render it; ship a raster PNG/JPG`)
  }
  if (ogImage && !grabMeta(head, 'property', 'og:image:width')) {
    f.warn(page, 'head/og-image-dims', 'og:image:width/height/alt absent - some scrapers want dims')
  }

  // JSON-LD
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  if (!blocks.length) f.warn(page, 'head/jsonld-absent', 'no JSON-LD structured data')
  for (const b of blocks) {
    let d
    try { d = JSON.parse(b[1]) } catch (e) { f.fail(page, 'head/jsonld-invalid', `invalid JSON-LD: ${e.message}`); continue }
    const objs = Array.isArray(d) ? d : (d['@graph'] ? d['@graph'] : [d])
    for (const o of objs) {
      if (!o['@type']) { f.warn(page, 'head/jsonld-typeless', 'JSON-LD node without @type'); continue }
      if (o['@type'] === 'LocalBusiness' || (Array.isArray(o['@type']) && o['@type'].includes('LocalBusiness'))) {
        const missing = LB_RECOMMENDED.filter(k => !(k in o))
        if (missing.length) f.warn(page, 'head/jsonld-localbusiness', `LocalBusiness missing recommended: ${missing.join(', ')}`)
      }
    }
  }

  // h1 sanity
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)]
  const text = h1s.map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean)
  if (!text.length) f.warn(page, 'head/h1-absent', 'no non-empty <h1>')
  else if (text.length > 1) f.warn(page, 'head/h1-multiple', `${text.length} <h1> elements (prefer one)`)
}
