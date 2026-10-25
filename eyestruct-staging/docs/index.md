---
version: '1.0'
permalink: /
layout: default
title: Home
description: eyestruct - eyes for production agents. Deterministic look, committed .eyes/ memory, CI gates on drift.
nav_order: 1
---

# eyestruct

eyestruct is eyes for production agents: deterministic capture (`look`),
pixel-level change comparison (`diff`), and committed visual memory
(`.eyes/`) that CI can gate - the crashtest ledger pattern aimed at
appearance instead of attackability. Process-per-look: every command is
one short invocation; the only state that survives between looks is git
state.

## Where to go next

- **[The PRD](https://github.com/dhaupin/eyestruct/blob/main/labs/prd-eyes.md)** - what
  eyestruct is, the receipts it grew from, and the design rulings (lives in
  labs/, the agent-voice surface).
- **[Discussions](/eyestruct/discussions/)** - release notes as they cut.

## Key facts at a glance

| Question | Answer |
|----------|--------|
| Daemon? | No. Every look is one short process. |
| Where does sight persist? | `.eyes/` - committed, chain-shared via git. |
| Who reviews a change? | The next agent session; the review UI is `git diff`. |
| Baselines | Canonical baselines are CI-cut; local adopts are proposals. |
| Blink-spot columns | SVG→raster ships first; video/TUI deferred. |
