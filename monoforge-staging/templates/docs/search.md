---
title: "Search"
description: "Static full-text search over the __NAME__ docs, powered by Pagefind indexing the final baked HTML."
author: "Creadev.org"
lang: "en"
date: 2026-10-23
last_modified_at: 2026-10-23
nav_order: 4
layout: default
version: 0.9.0
permalink: /search
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
<a href="{{ '/spec' | relative_url }}">SPEC v1</a> ·
<a href="{{ '/linter' | relative_url }}">linter</a></p>
</div>
