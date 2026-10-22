---
version: '1.0'
permalink: /contributing
layout: default
title: Contributing
nav_order: 7
---

# Contributing

Gistory is developed in the open at
[dhaupin/gistory](https://github.com/dhaupin/gistory). Issues and pull
requests are welcome — to keep reviews fast, run the repo's own battery
before pushing.

## The verification battery

| Gate | Command | What it covers |
|------|---------|----------------|
| Typecheck | `bun run typecheck` | App (`src/`), relay (`functions/`), test code — three strict passes. |
| Lint | `bun run lint` | ESLint (unused vars, hooks, no-undef) + the docs' English-only prose gate. |
| Sync smoke | `bun run sync:smoke` | Real agent crypto + real relay handlers on in-memory SQLite — no account. |
| Database | `bun run db:migrate:check` | Migrations self-verify on a fixture databases. |
| UI harness | `bun run test:ui` / `bun run ui:audit` | Headless browser flows + per-route audits (contrast, targets, overflow). |
| Crashtest | `bun run crashtest:run` | Red-team pack against the relay (committed ledger is the gate). |
| Docs | `npm run lint:docs` | Every page's frontmatter + nav↔permalink + internal links. |

CI runs the first four plus a production build on every push; the browser
suites need Chromium (`bun run ui:browsers` once per machine) so they are
local gates.

## Writing docs

Every page in `docs/` carries five frontmatter fields — `version`,
`permalink`, `layout`, `title`, `nav_order` — and links by its permalink.
The nav lives once in `docs/_data/nav.yml`; the layout reads it, and
`scripts/check-docs.mjs` fails when a page and the nav disagree. Prose is
English-only; `freestruct` post-processes the built site and fails the docs
deploy on broken links.

## Release flow

Every release is a version tag — `npm version patch && git push --follow-tags`
— which publishes `gistory-sync` via npm Trusted Publishing and opens the
GitHub release with the tarball attached. Publishing from `main` directly is
not supported by the workflow's design.

## Architecture reads

`AGENTS.md` in the repository documents the sync architecture deeply:
the encryption layer, the sequence protocol, merge rules, the guards, and
the whole sync specification with its design decisions and known trade-offs.
Start there before proposing changes to the sync surface.
