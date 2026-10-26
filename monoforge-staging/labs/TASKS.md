# labs - monoforge (staging mount)

Rolling work log for the monoforge staging tree, in the family TASKS
convention. The two PRDs here are carried byte-exact from
dhaupin/monoforge (labs/, upstream commit f8e45fb):

- prd-factory.md — the factory itself (new / doctor / lock / cut verbs)
- prd-creadev-mono.md — the component-family profile's first customer

## 2026-10-26 — the mount stands up in gistory

- The staged tool is 0.9.0 UNCHANGED: the tree unpacks from
  `horcrux/monoforge-0.9.0-lock.tar.gz` (tarball-first landing, sha-gated
  ferry), because a mount and its lock archive must not be allowed to
  drift apart in transit.
- What the mount ADDS over the standalone repo, beyond the tool:
  `labs/TASKS.md` (this file) and the horcrux receipts
  (`horcrux/README.md`, lock archive in place). The minted provisioner
  stone stays owned by dhaupin/monoforge — it does not ride this mount
  (size class already burned the payload lane once tonight).
- Family battery lane (own CI under gistory `staging-hosts`): the
  self-test `node test/run.mjs` — stamp + doctor + lock refusals per
  PRD §5 — runs straight off the zero-dep tree; no install step needed.
- tar-move-plan.md carries the monoforge row: → dhaupin/monoforge
  (repo already exists with labs/ + horcrux/; move day merges the tool
  tree onto it and keeps those dirs intact).

## Honest limits tonight

- Doctor was NOT run against this mount itself: the doctor battery is
  written for STAMPED repos (factory law, FORGE-TODO slots) and the
  mount is a write-repo host, not a stamped output. Its own self-test
  exercises doctor on a freshly stamped temp tree instead.
- The templates/ blocks are the 2026-10-24 extraction and predate
  tonight: drift against the two struct instances is the known, watched
  risk (PRD §6), not something tonight changes.
- **Completion sprint (2026-10-26, pre-move).** 1) Template-layer drift
  repaired at the SOURCE: the docs layout shipped packstruct's nav
  (SPEC v1 / linter pages) and footer identity, the configs shipped
  packstruct's description, and a backreference artifact rode both -
  every stamped repo would have inherited another tool's identity.
  Templates now emit __SPECIES__/__DESCRIPTION__ tokens and a home+search
  nav (the monoforge instance adds verbs/packs); the doctor-scoped
  stamp-manifest law is untouched (self-test still green endpoints:
  bad-config refused, stray dir refused, stamp ok, unfilled doctor FAIL,
  refilled doctor PASS). 2) docs playbook grew from 2 pages to 4:
  verbs.md (usage lines match bin/forge.mjs help exactly) and packs.md
  (the contract + SPEC v1 link + the honest "no packs shipped yet by
  design"). 3) site/ landing built per the PRD inventory: slogan, verb
  grid, receipts-only numbers, limits, terms/privacy static pages
  (footer links no longer point at 404s). Frontmatter/links/style/
  language gates all PASS on the new pages.
