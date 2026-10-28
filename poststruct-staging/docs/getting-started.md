---
title: "Getting started"
description: "Install poststruct, run the first audit over a baked directory, and read the findings. Files on disk only: the fence is timeless by construction."
author: "Creadev.org"
lang: "en"
date: 2026-10-28
last_modified_at: 2026-10-28
nav_order: 2
layout: default
version: 0.9.0
permalink: /getting-started
---

# Getting started

poststruct audits baked HTML: the built output your static site, your
prerender, or your SPA shell actually ships. It is a zero-dependency CLI
(Node 20 or newer) and it reads files on disk only.

## Install

```bash
# run it straight from npm, no install
npx poststruct audit dist/

# or pin it as a devDependency for CI
npm install --save-dev poststruct
```

## First audit

Point `audit` at any directory of baked HTML (default: `dist`):

```bash
npx poststruct audit dist/           # human output, one line per finding
npx poststruct audit dist/ --json    # {schema: 1, counts, findings}
```

A clean run prints one summary line. Findings print one per line, and the
process exits exactly:

| Exit | Meaning |
|---|---|
| `0` | clean, or warnings only. Safe to deploy. |
| `1` | at least one FAIL finding. Gate the deploy here. |
| `2` | usage or environment error (no directory to walk). |

## What the audit reads

The **head** module checks every page: title present and in band,
description present and in band, canonical present and absolute, the OG
and Twitter tag sets, og:image in a raster format (an SVG og:image FAILs:
most social scrapers cannot render it), JSON-LD that parses with the
LocalBusiness recommended fields, h1 sanity, and the 404 noindex
contract. The **site** module checks the tree: a sitemap.xml with `loc`
entries and lastmod, and a robots.txt that points at it.

The full list, per module and per status, lives in the check catalog.

## CI

poststruct gates on its exit code, so the CI wiring is one step:

```yaml
- run: npx poststruct audit dist/
```

The CI page carries the family-shaped battery, and the packs page shows
how poststruct's own audits are shaped once the pack loader realizes in
your repo.

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/' | relative_url }}">home</a> ·
<a href="{{ '/checks' | relative_url }}">check catalog</a> ·
<a href="{{ '/playbooks' | relative_url }}">playbooks</a></p>
</div>
