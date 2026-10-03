// The in-page collector used by scripts/ui-audit.mjs.
//
// IMPORTANT: this function is serialized with toString() and evaluated inside
// the browser, so it must stay fully self-contained — no imports, no closure
// over module scope.

export function collectFindings() {
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) !== 0
  }

  const path = (el) => {
    const parts = []
    let node = el
    let depth = 0
    while (node && node.nodeType === 1 && depth < 3) {
      let s = node.tagName.toLowerCase()
      if (node.className && typeof node.className === 'string' && node.className.trim()) {
        s += '.' + node.className.trim().split(/\s+/).slice(0, 2).join('.')
      }
      parts.unshift(s)
      node = node.parentElement
      depth++
    }
    return parts.join(' > ')
  }

  const parseColor = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '')
    if (!m) return null
    const p = m[1].split(',').map((x) => parseFloat(x.trim()))
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }

  const lum = (c) => {
    const f = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }

  const ratio = (a, b) => {
    const l1 = lum(a)
    const l2 = lum(b)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }

  const bgOf = (el) => {
    let node = el
    while (node && node.nodeType === 1) {
      const s = getComputedStyle(node)
      if (s.backgroundImage && s.backgroundImage.includes('gradient')) return null // not machine-checkable
      const c = parseColor(s.backgroundColor)
      if (c && c.a === 1) return c
      node = node.parentElement
    }
    return parseColor(getComputedStyle(document.body).backgroundColor)
  }

  const hasOwnText = (el) => {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true
    return false
  }

  const accName = (el) => {
    const lb = el.getAttribute('aria-labelledby')
    const ref = lb
      ? lb
          .split(' ')
          .map((i) => (document.getElementById(i) || {}).textContent || '')
          .join(' ')
          .trim()
      : ''
    return (
      ref ||
      (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.getAttribute('alt') ||
        el.textContent ||
        ''
      ).trim()
    )
  }

  const overflowEls = []
  const contrast = []
  const tinyText = []
  const smallTargets = []
  const noName = []
  const unlabeled = []
  const clipped = []
  let gradientSkips = 0
  const vw = window.innerWidth

  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)

    if (r.right > vw + 1 || r.left < -1) {
      overflowEls.push({ el: path(el), left: Math.round(r.left), right: Math.round(r.right), vw })
    }

    const tag = el.tagName.toLowerCase()
    const interactive =
      ['button', 'a', 'select', 'input', 'textarea'].includes(tag) || el.getAttribute('role') === 'button'

    // Inputs should carry the full 44px+ comfortable target where possible, but
    // 32px is the floor we hold the UI to. Text inputs are exempt: they are
    // sized by their content and font, and their hit area is the whole row.
    const isTextInput = tag === 'input' || tag === 'textarea'
    if (interactive && !isTextInput) {
      if (r.height < 32 || r.width < 32) {
        smallTargets.push({ el: path(el), w: Math.round(r.width), h: Math.round(r.height) })
      }
    }
    if (interactive && !isTextInput && !accName(el)) noName.push({ el: path(el), tag })

    if (isTextInput && !el.getAttribute('aria-label') && !el.getAttribute('placeholder') && !el.getAttribute('title')) {
      let labelled = false
      if (el.id && document.querySelector('label[for="' + el.id + '"]')) labelled = true
      if (el.closest('label')) labelled = true
      if (!labelled) unlabeled.push({ el: path(el), tag })
    }

    if (hasOwnText(el)) {
      const fs = parseFloat(s.fontSize)
      if (fs < 12) tinyText.push({ el: path(el), px: fs, sample: (el.textContent || '').trim().slice(0, 30) })
      const bg = bgOf(el)
      if (!bg) gradientSkips++
      else {
        const fg = parseColor(s.color)
        const large = fs >= 24 || (fs >= 18.66 && parseInt(s.fontWeight, 10) >= 700)
        const need = large ? 3 : 4.5
        const cr = fg ? ratio(fg, bg) : 0
        if (cr < need) {
          contrast.push({
            el: path(el),
            ratio: Math.round(cr * 100) / 100,
            need,
            color: s.color,
            bg: 'rgb(' + [bg.r, bg.g, bg.b].join(',') + ')',
            px: fs,
            sample: (el.textContent || '').trim().slice(0, 30),
          })
        }
      }
    }

    const clipsX = el.scrollWidth > el.clientWidth + 2 && s.overflowX !== 'visible' && el.clientWidth > 0
    if (clipsX && hasOwnText(el)) {
      clipped.push({
        el: path(el),
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        sample: (el.textContent || '').trim().slice(0, 30),
      })
    }
  }

  const ids = {}
  const dupIds = []
  for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1
  for (const k in ids) if (ids[k] > 1) dupIds.push({ id: k, count: ids[k] })

  return {
    vw,
    docW: document.documentElement.scrollWidth,
    overflowX: document.documentElement.scrollWidth > vw + 1,
    gradientSkips,
    overflowEls,
    contrast,
    tinyText,
    smallTargets,
    noName,
    unlabeled,
    clipped,
    dupIds,
  }
}

/** In-page probe: geometry + computed styles for the controls in `selector`. */
export function measureControls(selector) {
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  }
  const cs = (el) => {
    const c = getComputedStyle(el)
    return {
      padding: c.padding,
      radius: c.borderRadius,
      border: c.borderStyle + ' ' + c.borderWidth,
      background: c.backgroundColor,
      fontSize: c.fontSize,
    }
  }
  return [...document.querySelectorAll(selector)].map((el) => ({
    tag: el.tagName.toLowerCase(),
    classes: typeof el.className === 'string' ? el.className : '',
    text: (el.textContent || '').trim().slice(0, 40),
    label: el.getAttribute('aria-label') || '',
    ...box(el),
    ...cs(el),
  }))
}
