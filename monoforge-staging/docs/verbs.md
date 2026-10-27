---
version: '1.0'
permalink: verbs/
layout: default
title: Verbs
description: Every monoforge command is one short process - stamp, doctor, cut, lock, and the opt-in lint-packs lane. Four factory verbs plus the pack-lint passthrough, zero dependencies; the doctor refuses to ship generated green.
nav_order: 2
---

# Verbs

Four factory verbs, zero dependencies, plus the opt-in lint-packs
passthrough. `monoforge help` prints all of it; this page is the playbook
for each verb and the config that feeds it.

## new - stamp a fleet repo

```bash
monoforge new <dir>
```

Stamps a repo from the proven template blocks into `<dir>`, driven by a
`factory.json` in `<dir>`. Inputs are validated hard before anything is
written: a half-specified factory is refused, never half-created, and a
directory holding anything besides `factory.json` is refused - never
half-merged.

```json
{
  "name": "kebab-name",
  "species": "the one-liner kind",
  "pitch": "the one-line pitch",
  "description": "the long form",
  "siteDomain": "https://x.creadev.org",
  "docsPath": "docs.creadev.org/x   (optional, defaults to this)",
  "version": "0.9.0                 (optional)"
}
```

Every `__TOKEN__` in the template layer maps to a factory config key
(`__NAME__`, `__SPECIES__`, `__PITCH__`, `__DESCRIPTION__`,
`__VERSION__`, `__SITE_URL__`, `__DOCS_URL__`, plus the stamp
attribution tokens). The stamp writes `.monoforge-stamp.json` - the
record of what actually emitted - and the doctor's truth-slot scan is
scoped to exactly those files, so prose that documents the FORGE-TODO
convention never self-flags.

## doctor - the truth battery

```bash
monoforge doctor [dir]
```

Runs the truth battery against a stamped tree. Findings print as
`FAIL/WARN <id>: <message>` and end with the count line; exit 0 is
PASS only when nothing failed. The battery refuses: unfilled
`FORGE-TODO` slots (scoped to the stamp manifest), bad package.json
paths, a publish workflow without its 0.x refusal, and broken docs
gates. **Generated green is never shipped** - a doctor that warns into
green would be the politeness theater the fleet refuses.

## cut - the component-family workspace

```bash
monoforge cut [dir]
```

Cuts a component workspace from a declared source tree
(`cutlist.json` + `factory.json` required, both in `[dir]`). The cut
records its source revision in the receipts, declares its shortfalls
instead of stubbing them, and stamps per-component packages with their
own files whitelists. See the
[component-family PRD](https://github.com/dhaupin/monoforge/blob/main/labs/prd-creadev-mono.md)
for the cut law and generation ordering.

## lock - archive with a checksum

```bash
monoforge lock [dir]
```

Doctor first, then doctor-gated archive: a `sha256` record plus the
archive file land together. A failing doctor refuses the lock - the
archive is only ever a receipt for a green tree.

## lint-packs - the pack lint lane

```bash
monoforge lint-packs [--deep] [--json] [--against <lib>] [dir]
```

The packstruct passthrough (crashtest's issue #32 shape, eyestruct's
proven port): runs `packstruct lint` over the factory's own install -
`node_modules/.bin` first, then PATH - never downloading or bundling one.
The exit code IS the verdict: 0 clean, 1 findings, 2 setup refusal. Until
the factory's own packs land there is no packstruct dependency to honor,
so the verb today is the loud setup refusal naming the exact fix (`npm i
-D packstruct@<exact>`) - a never-working requested lane is a broken
config, never a silent skip. Default dir: the packs ROOT; an explicit dir
passes through untouched.

## The release ladder

0.9.x is manual npm publish; 1.0.0 flips to OIDC trusted publishing
(the stamped `publish.yml` refuses 0.x versions so the flip is
deliberate, never accidental). The runbook lives in DEPLOY.md.

<div class="crosslinks">
<p><strong>More in these docs:</strong>
<a href="{{ '/' | relative_url }}">home</a> ·
<a href="{{ '/packs/' | relative_url }}">packs</a></p>
</div>
