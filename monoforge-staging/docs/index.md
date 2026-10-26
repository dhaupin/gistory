---
title: "monoforge"
description: "stamps fleet repos from the proven template blocks (docs system, workflows, release ladder, gates), doctors them with the truth battery, and locks them with a checksum. The doctor refuses unfilled FORGE-TODO slots: generated green is never shipped."
author: "Creadev.org"
lang: "en"
date: 2026-10-24
last_modified_at: 2026-10-24
nav_order: 1
permalink: /
layout: default
version: 0.9.0
---
# monoforge

The struct-family factory: stamp a repo from proven template blocks, doctor it for truth, lock it verifiably.

```bash
monoforge new <dir>       # stamp a fleet repo from that dir's factory.json
monoforge doctor [dir]    # the truth battery - unfilled slots fail
monoforge cut [dir]       # component-family workspace (cutlist.json + factory.json)
monoforge lock [dir]      # doctor, then archive with a sha256 record
```

The release ladder: 0.9.x is manual npm; 1.0.0 flips OIDC trusted publishing
(publish.yml refuses 0.x versions). See DEPLOY.md in the repo.

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/verbs/' | relative_url }}">verbs</a> ·
<a href="{{ '/packs/' | relative_url }}">packs</a> ·
<a href="{{ '/search/' | relative_url }}">search</a></p>
</div>
