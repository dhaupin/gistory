---
title: "Check catalog"
description: "Every poststruct check by module - head, site, links, i18n, a11y-lite, language, feeds - each individually disableable, scoped to the file-on-disk contract."
author: "Creadev.org"
lang: "en"
date: 2026-10-23
last_modified_at: 2026-10-23
nav_order: 2
layout: default
version: 0.9.0
permalink: /checks
---

# Check catalog

Every check is individually disableable via config (`poststruct.config.js`) and
scoped to the file-on-disk contract - poststruct only ever reads files.

| Module | Status | Enforces |
|---|---|---|
| head | shipped | title/meta description/canonical/OG(7)/Twitter(4) sets, og:image raster-format, JSON-LD parses |
| site | shipped | sitemap.xml parity, robots.txt sitemap pointer, 404 noindex contract |
| links | M1 | internal link graph vs files present, `_redirects`, anchor targets |
| i18n | M2 | html lang, hreflang reciprocity |
| a11y-lite | M2 | informative-image alt, form labels, viewport |
| language | M2 | dash classes, AI-cliche lexicon (taste lives in packs) |
| feeds | M3 | RSS/Atom well-formed, canonical parity |

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/' | relative_url }}">home</a> ·
<a href="{{ '/packs' | relative_url }}">packs</a> ·
<a href="{{ '/search' | relative_url }}">search</a></p>
</div>
