---
version: '1.0'
permalink: search/
layout: default
title: Search
description: Static full-text search over the monoforge docs, powered by Pagefind indexing the final baked HTML.
nav_order: 4
---

# Search

<div id="search"></div>
<link href="{{ '/pagefind/pagefind-ui.css' | relative_url }}" rel="stylesheet">
<script src="{{ '/pagefind/pagefind-ui.js' | relative_url }}"></script>
<script>
  new PagefindUI({ element: '#search', showSubResults: true })
</script>

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/' | relative_url }}">home</a> ·
<a href="{{ '/verbs/' | relative_url }}">verbs</a> ·
<a href="{{ '/packs/' | relative_url }}">packs</a></p>
</div>
