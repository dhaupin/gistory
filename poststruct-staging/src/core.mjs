// src/core.mjs - the walk + extraction helpers. Attribute-ORDER tolerant:
// engines emit aligned multi-space attributes, and a naive single-space
// regex false-negatives on their own output (caught on the first audit).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export class Findings {
  constructor() { this.fails = []; this.warns = [] }
  fail(page, id, message) { this.fails.push({ level: 'fail', page, id, message }) }
  warn(page, id, message) { this.warns.push({ level: 'warn', page, id, message }) }
  get counts() { return { fail: this.fails.length, warn: this.warns.length } }
  get hasFails() { return this.fails.length > 0 }
}

export function walkHtml(dir) {
  if (!existsSync(dir)) throw new Error(`No ${dir}/ directory - run the build first.`)
  let out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out = out.concat(walkHtml(p))
    else if (name.endsWith('.html')) out.push(p)
  }
  return out
}

export function loadPage(dir, path) {
  const html = readFileSync(path, 'utf8')
  return { page: relative(dir, path), html, head: html.split('</head>')[0] }
}

// Order-tolerant meta grab: tries both attribute orders.
export function grabMeta(head, attr, name) {
  const m = head.match(new RegExp(`<meta[^>]+${attr}="${name}"[^>]*content="([^"]*)"`))
    || head.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]*${attr}="${name}"`))
  return m ? m[1] : null
}
