---
title: "poststruct - audit what shipped"
description: "The zero-dependency CLI that audits the HTML that actually ships: the head module and the site module, the release ladder, and the packstruct pack system."
author: "Creadev.org"
lang: "en"
date: 2026-10-23
last_modified_at: 2026-10-23
nav_order: 1
permalink: /
layout: default
version: 0.9.0
---
# poststruct

Zero-dependency CLI that audits the HTML that actually ships: head hygiene, link
integrity, DOM shape - with the exact per-check catalog and the pack system below.

```bash
npx poststruct audit dist/          # walks a baked tree, head + site modules
```

The release ladder: 0.9.x is manual npm; 1.0.0 flips OIDC trusted publishing
(`publish.yml` refuses 0.x versions). See DEPLOY.md in the repo.

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/checks' | relative_url }}">check catalog</a> ·
<a href="{{ '/packs' | relative_url }}">packs</a> ·
<a href="{{ '/search' | relative_url }}">search</a></p>
</div>
