---
version: '1.0'
permalink: /
layout: default
title: monoforge
description: The fleet factory - stamps fleet repos from the proven template blocks (docs system, workflows, release ladder, gates), doctors them with the truth battery, and locks them with a checksum. The doctor refuses unfilled FORGE-TODO slots: generated green is never shipped.
---
# monoforge

The struct-family factory: stamp a repo from proven template blocks, doctor it for truth, lock it verifiably.

```bash
monoforge new ./my-tool      # stamp a fleet repo from factory.json
monoforge doctor ./my-tool   # the truth battery (refuses FORGE-TODO, broken gates)
monoforge lock ./my-tool     # doctor must pass, then archive + checksum
monoforge cut ./family       # component-family workspace from a living lib
```

The release ladder: 0.9.x is manual npm; 1.0.0 flips OIDC trusted publishing
(publish.yml refuses 0.x versions). See DEPLOY.md in the repo.

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/search/' | relative_url }}">search</a></p>
</div>
