---
version: '1.0'
permalink: verbs/
layout: default
title: Verbs
description: Every eyestruct command is one short process - look, diff, adopt, ledger, gate, raster, ratify, walk, mcp. The only surviving state is .eyes/.
nav_order: 2
---

# Verbs

Every command is one short process, never a daemon. The only state that
survives between looks is `.eyes/` - committed, chain-shared via git.
Exit contract: `0` green or explained, `1` drift or refusal with a named
reason, `2` setup or capability trouble. No bare stack traces.

## Memory setup

```bash
eyestruct init [--browser-image TAG] [--renderer resvg@V]
```

Writes `.eyes/manifest.yml` (the pin + route matrix, a strict
hand-editable subset) and an empty ledger. Other hosts keep their eyes
next to their own crashledger (gistory: `labs/.eyes`) via
`--manifest`/`--ledger`; the default everywhere else is `.eyes/`.

## Looking and diffing

```bash
eyestruct look <url> [--viewport WxH] [--theme T] [--region SEL] [--browser-exec P]
eyestruct diff <url> [--against PATH]
```

`look` captures one route/view into `.eyes/` and appends a ledger row.
`diff` compares a fresh capture against the committed baseline; a local
look followed by `adopt` is how a change gets proposed.

## Proposing and reading

```bash
eyestruct adopt <route/view> --note "why this change is expected"
eyestruct ledger list [ROUTE] | show ID
```

Local adopts are **unratified proposals** - the note is required at
write time, and canon baselines are cut by CI. The ledger is
append-only and refuses corruption loudly.

## Gating and validating

```bash
eyestruct gate
eyestruct raster [file...]
```

`gate` is the CI job: exit 1 on unexplained `.eyes/` drift. `raster`
does strict SVG parse + render + byte-size sanity - it never fake-passes
without a renderer.

## Canon and coverage

```bash
eyestruct ratify <base-url>
eyestruct walk <base-url>
```

`ratify` re-captures every manifest route in the pinned environment and
cuts byte-identical slots as append-only ratify rows. `walk` runs every
route x viewport x theme in one pass.

## Never glyph-counting

The ledger gates look for **mask-invariant drift** - text edges are
masked so a typo never hides a real visual change, and a policy
re-render never invents one.

## Flags that work everywhere

`--json` (machine output), `--manifest PATH`, `--ledger PATH` (host-owned
memory locations).

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/' | relative_url }}">start</a> ·
<a href="{{ '/discussions/' | relative_url }}">discussions</a></p>
</div>
