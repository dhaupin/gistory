# monoforge 0.9.0

The struct-family factory: stamp a fleet repo from proven template blocks, doctor it for truth, lock it verifiably.

One law: **generated green is never shipped.** The stamp layer carries only what two proven instances already validated (poststruct + packstruct); the doctor runs the same truth battery the fleet reads (tests, docs gates, release ladder, dash law); unfilled `FORGE-TODO` slots are failures, not warnings, because a shipped placeholder is a shipped lie.

## Usage

```bash
# 1. config: create factory.json in an empty directory
monoforge new ./my-tool      # stamps template blocks + fills tokens, never the truth
monoforge doctor ./my-tool   # the truth battery (refuses FORGE-TODO, broken gates, dash law)
monoforge lock ./my-tool     # doctor must pass, then archive + checksum
monoforge cut ./family       # release cuts: components/<name>/ from a living lib per cutlist.json
```

factory.json:

```json
{
  "name": "my-tool",
  "species": "one-liner",
  "pitch": "the one-line pitch",
  "description": "the long form",
  "siteDomain": "https://my-tool.creadev.org",
  "version": "0.9.0"
}
```

`docsPath` defaults to `docs.creadev.org/<name>`.

Component families take a `scope` field (npm scope for the cut packages) plus a `cutlist.json` beside `factory.json`:

```json
{
  "source": "/path/to/the/living/lib",
  "shortfall": ["lazies", "allowed", "to", "degrade"],
  "packages": [
    { "name": "my-lib", "sources": ["my-lib.js"], "deps": ["primitives"] },
    { "name": "primitives", "sources": ["primitives.js"] }
  ]
}
```

Every unmapped internal dependency refuses; shortfall lazies must be declared and ship as documented call-site degrades (each package README carries the list). The realized receipt: the creedev-lib generation-1 cut, 7 packages from the vant lib, in the mono PRD.

## What stamps, what does not

| Layer | monoforge carries it | Source of truth |
|---|---|---|
| Docs system (Jekyll + Pagefind + Freestruct + 4 gates) | template | two proven instances |
| Workflows (test, publish 0.x refusal, docs) | template | same |
| Release ladder + DEPLOY runbook shape | template | same |
| `FORGE-TODO` slots (README pitch, AGENTS core law, coverage list) | **author** | the tool itself |
| the core code, the check catalog, the spec | **author** | the tool itself |

The template blocks were extracted 2026-10-24 from the proven trees; they follow the poststruct and packstruct shape, with names tokenized.

## Status

0.9.0: stamp + doctor + lock all negative-tested (bad configs refused, stray dirs refused, unfilled slots flagged, filled trees pass). Manual npm ladder; 1.0.0 flips OIDC.

## Related

- [poststruct](https://github.com/dhaupin/poststruct) + [packstruct](https://github.com/dhaupin/packstruct): the proven instances the templates were extracted from
- **The workshop** → [Creadev.org](https://creadev.org) (monoforge is made by Rook @ Creadev.org — the same home as the docs and site surfaces above)
