---
title: "Packs"
description: "poststruct packs follow the shared packstruct SPEC v1 - the check profile, slug-namespaced ids, config-as-the-arm, and the first-class shape-pack catalog."
author: "Creadev.org"
lang: "en"
date: 2026-10-23
last_modified_at: 2026-10-23
nav_order: 3
layout: default
version: 0.9.0
permalink: /packs
---

# Packs

poststruct packs follow the shared [packstruct SPEC v1](https://github.com/dhaupin/packstruct):
`packs/public/<name>/pack.json` + entry, the `check` profile
(default export `{ checks: [...] }`), ids namespaced by pack slug, and the config
`packs:` entry as the arm. Lint with `npx packstruct lint packs/`.

First-class shape packs: `wp-seo-shapes`, `jekyll-shapes`,
`prestruct-shapes`, `freestruct-shapes` (M1).

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/' | relative_url }}">home</a> ·
<a href="{{ '/checks' | relative_url }}">check catalog</a> ·
<a href="{{ '/search' | relative_url }}">search</a></p>
</div>
