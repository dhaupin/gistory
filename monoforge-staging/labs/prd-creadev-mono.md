# PRD: creadev-mono (the component family, built on release cuts)

**Status:** draft v0.1 for owner review
**Author:** echo (Buffy), 2026-10-24 · Owner: dhaupin · Forge colleague: Rook (ops agent, ruling 2026-10-24)
**Working name:** repo name TBD (lean: `dhaupin/creadev-lib`, free as of this writing) · npm scope: `@creadev.org/*` (scope active since 0.3.1: security@0.3.1 is live)

---

## 1. One-line pitch

**One workspace, many `@creadev.org/*` components, every publish a deliberate release cut of the living vant `lib/`.** Consumers stay pinned to the versions they install: the components are frozen, gated snapshots with their own lifecycle, not followers of vant's main branch. Cutting is opt-in per component and executed by monoforge (stamp + doctor + release lanes), so the install follows the tag, and the repo is only the well the tag draws from.

## 2. The doctrine (settled with the owner 2026-10-24)

Three architectures were weighed for "how components relate to vant":

| Architecture | What it is | Ruling |
|---|---|---|
| **Release cuts** | Components are versioned, gated copies of vant lib at tag time; pinned installs; new cut only by decision | **CHOSEN** |
| Thin re-exports | Components re-export a published `@creadev.org/lib` core with bounded deps | Reserve (it can arrive later as a fifth layer without breaking cuts) |
| Copy-trading | Vant merges auto-publish every component | REJECTED outright (no gate, no changelog intent, churn without decision) |

The one-line law: **publishing is a decision with a gate, not a reflection.**

## 3. Why this shape (evidence, not vibes)

The 16 creadev-* repos were extracted from an EARLY vant as one-half of this exact factory idea and never run. Five months later the drift is violent (measured against vant's living lib/ the same day the PRD was written):

| Component | Extracted npm cut | vant lib, living |
|---|---|---|
| api | published 0.3.1 line | 1,664 loc |
| sandbox | 123 loc copy (unpublished) | 1,290 |
| escrow | 303 | 1,106 |
| storage | 155 | 2,519 (a subsystem) |
| config | 148 | 945 |
| server | 268 | 955 |
| security | 1,606 (the crown jewel on npm) | 513 + gates.js + security-pipeline.js |
| qos | 656 (on npm without OIDC) | 702 |

So the salvage is not transcribing the stale repos; **the cut source is vant lib/ itself, current.** The stale npm line gets deprecated with a pointer, never re-published on top (the crashtest#20 atomicity law and version hygiene).

## 4. The cut contract (what monoforge stamps)

- **Cutlist manifest** (the ONE authored input; the owner decides): `component -> source list of lib paths + optional README species copy`, e.g., `security: [lib/security.js, lib/security/gates.js, lib/security-pipeline.js]`.
- **Cut source is opt-in and not vant-only:** the profile reads any declared source tree; the first cutlist is vant, and a future repo (stego carriers, audit shapes) can declare components later. The cut records its vant revision precisely in the CHANGELOG provenance line.
- **Per-component package.json** stamped at `@creadev.org/<name>`, files whitelist, engines >=20, zero-dep. No transpilation: JS ESM ships as the lib ships (a TS re-write is a later, per-component decision, never baked into the profile).
- **Release rig per component, one repo, N publishes:** publish.yml (the proven struct-family ladder: tags `v*` + workflow_dispatch, refuses 0.x, npm view idempotence, npm test gate, provenance via OIDC) stamped per package; per-package version tags (`security@1.0.0` style) drive the change-detection publish lane.
- **The barrel:** `@creadev.org/framework` is rebuilt by the same lane: it re-exports the exact cuts included in the barrel, keeping vant's load order (the one worthy artifact of the old creadev-framework: the barrel is a doc, ints the code).
- **The gates run before anything publishes:** the monoforge doctor (npm test per package, dash law, docs gates) plus per-package tests that RECEIVE from the cut (imports resolve, exports equal the declared cutlist).

## 4.5 Generation 1: cut for real (2026-10-24)

The first cut exists. `monoforge cut` stamped a workspace from vant's living lib at revision 5fe8450: 7 packages (primitives, error, hash, lock, recursion, encrypt, cache), 7 package smokes green, doctor PASS, locked (creadev-lib-0.9.0-lock.tar.gz, sha256 357017eeef52d9c7 (relocked after the doctor-warn closure)). Three receipts worth keeping:

- The cut law REFUSED my first authored cutlist (event/types/durable drag state-store, which drags brain/audit/storage: too deep for one generation). That refusal is the factory working, not failing: the cut is scoped to what actually closes over load-time dependencies.
- The shortfall policy is now encoded in the verb: lazy internal modules outside a cut are DECLARED in cutlist.shortfall, rewritten to scoped names, and shipped as documented call-site degrades (the_modules list rides in each package README and the root README table; absence is honest, never stubbed).
- Encryption and friends carry `require('./hash')` internally: the cutlist grew hash as a real package to close the graph. Generation candidates queued: event(+types/durable with state-store + storage), escrow, server, network (needs cache+config), then the security line once its brain/vaf/audit coupling is judged by the owner.

## 5. What stays vant-side (the honest fence)

- Vant keeps owning its house: code evolution, MCP doors, brain-state pieces (storage/brain.js and the stones/crew modules are vant-internal until the cutlist explicitly names them).
- A cut is a fork-with-decency: consumers own bugs forward while pinned, upstream discovers in private (vant free to refactor), and a fresh cut must be deliberately requested. An unmaintained cut becomes stale the way any dependency does, its version documents when, source rev is change-ready.
- No runtime dependency vant-side reaches consumers: components compile as standalone JS. (This one is mechanically enforced: npm install in a consumer repo should pull nothing from vant.)

## 6. Cadence (open, lean stated)

0.x era: **on-demand cuts only** (an owner call). Later: vant minor releases MAY propose the family release (yet still opt-in per component... never automated). The wreckage premise: nothing publishes or updates because upstream moved. Every mob is a decision with an author.

## 7. Milestones

- **M0:** this PRD (done when committed) + monoforge stamps the profile skeleton once Rook names the repo + scope.
- **M1:** a first cutlist + the workspace stamped + gates green in CI, schemaVersion for the manifest internal first (private-first, same convention as struct repos).
- **M2:** the first cut batch, deprecate all stale 0.3.x npm packages with a pointer to the provenance-tagged modern line.
- **M3:** the framework barrel lands, and clients can switch imports to the new line on their own decision.

## 8. Open questions for Rook

1. Repo name: `creadev-lib` (my lean: clean, describes the Mono repo, not just a set of separate component packages)? Or is the one-fam repo rather `creadev-components`? Or something else entirely for the ONE monorepo?
2. Initial cutlist: my lean is {security (with gates), qos, encrypt, cache, lock, event, escrow, config, network, server, sandbox, auth, api, framework/barrel}. storage goes LAST and only after brain.js is checked for vant-internal naming: never assume what is cuttable without reading it first.
3. The TS fork: the extracted repos shipped TS: is the API then typed, or do cuts ship JS with hand-authored .d.ts? My lean: ship JS as it lives in vant, add .d.ts later where the surface needs it.
4. Scope owner on npm: @creadev.org npm user/org: identity question REOPENED 2026-10-24 (owner ruling: dhaupin is the human owner, Rook is the ops agent, so the earlier "owned by Rook Dhol?" wording is retracted): confirm which account holds the npm scope and its 2FA, then the deprecation pointer must say "see @creadev.org/security@1.0.0+".
5. Which cadence's default: cuts on demand (my lean) vs monthly sweep?

## 9. The non-goals

- Not a v2 of anything, not a registry, not a marketplace. The product is versioned cuts of opt-in code with provenance.
- Never bumps consumers' pins. Never publishes empty versions or version-only bumps. Never auto-publishes.
- No fork of vant itself: cuts deliver the component surface; vant remains the upstream source of truth, and the deprecation pointer keeps the old scope line discoverable.
