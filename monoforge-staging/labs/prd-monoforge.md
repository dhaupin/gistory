# horcrux/prds/prd-monoforge.md — compiled PRD landing (2026-10-26)

This file compiles the monoforge repo's two working PRDs from `dhaupin/monoforge/labs/` so the gistory vault carries the guide alongside `prd-eyes.md` and `prd-poststruct.md` (the mounts' and upstream's labs copies stay canonical; move-day takes this compiled file along as the landed copy).

Read order: **"PRD: monoforge (the fleet factory)"** (stamps fleet repos from proven blocks), then **"PRD: creadev-mono (the component family)"** (the release-cut profile that eats monoforge's cuts). Source blob ids at compile time: `prd-factory.md` fa8a5f6e · `prd-creadev-mono.md` e00f6aaa.

---

# PRD: monoforge (the fleet factory)

**Status:** draft v0.1, scaffolded and refusal-tested (v0.1.1: slogan + forge-operator sections added 2026-10-24)
**Author:** echo (Buffy), 2026-10-24 · Owner: dhaupin · Forge colleague: Rook (ops agent, ruling 2026-10-24)
**Companion instances (the proven template sources):** [horcrux/prd-poststruct.md](./prd-poststruct.md) · [horcrux/prd-packs.md](./prd-packs.md)

---

## 1. One-line pitch

**monoforge is the factory that stamps fleet repos from proven blocks, doctors them for truth, and locks them verifiably.** One zero-dependency CLI, three verbs: `new` (stamp), `doctor` (truth battery), `lock` (archive + checksum). Its single law: generated green is never shipped, unfilled truth slots are failures, and the tool-inside-the-repo stays the author's job.

## 2. Why it exists (the evidence, not the idea)

- **The number: roughly 70% of the two struct scaffolds is identical shape.** Built by hand in one day (2026-10-23), poststruct and packstruct carry the same docs system (Jekyll + Pagefind + Freestruct + 4 gates), the same workflows (test, 0.x-refusing publish, docs), the same release ladder and DEPLOY shape, root-doc skeletons, functions canary, labs/horcrux convention. Only the PRD, the core, the check catalog, and the copy are per-tool. Two instances is the minimum; the third instance is the proof, and `let's go for three` is the trigger that fired.
- **The blocks are already extracted** (2026-10-24, templates/ in the scaffold): token-ized from the two trees so every future repo starts from what is proven, not from memory.
- **Watch: the name** `monoforge` was verified free on npm (404, 2026-10-24) and and the repo does not exist yet (dhaupin may create the repo, then connect); the fleet convention is top-level tool names, and `@monoforge/*` scope is reserved for later distribution layers (the same pattern @packstruct/* uses for packs).

## 3. What stamps, what does not

| Layer | Source of truth |
|---|---|
| Docs system + gates, workflows, release ladder, DEPLOY shape, functions canary | template (two proven instances) |
| Dhaupin/crashtest#20 release-atomicity line | encoded in DEPLOY template |
| `FORGE-TODO` truth slots (README pitch, AGENTS core law, coverage list) | author, only |
| The core code, the check catalog, the spec | author, always |

**Add a template block only when two instances prove it.** A block with a single instance is a bet, and the doctor cannot verify bets.

## 4. The doctor (the load-bearing half)

The truth battery, wired from the fleet's own receipts: git state (warn), unfilled `FORGE-TODO` slots (fail, stamp-manifest-scoped so prose about the law does not self-flag), package.json sanity (bin/exports/files paths; the crashtest#16 class in our own clothes), publish.yml 0.x refusal, `npm test`, docs gates (frontmatter/links/style/language), em dash law over md prose. The battery REFUSES: a doctor that warns into green would be the same politeness-theater crashtest kills.

## 5. The self-test (what the factory refuses)

Bad config refused (kebab/https laws named in the refusal); stray files in the target dir refused (never half-merge); stamped tree carries the negative-checked workflows; unfilled FORGE-TODO FAILS the doctor; filled slots PASS. Five asserts, one commit, 0.9.0.

## 6. Honest limits (day one)

- **The stamp sets shape, not judgment.** The concrete case is the truth slots: nothing stages them green, ever. Calling it a factory when the author does the real work is honest; calling it an AI is false.
- **One tool profile right now (npm-tool).** The landing/docs profile parameter and forge mind helper (brain mint + stones) are unimplemented helpers; the first stamped repo that is NOT an npm tool graduates that profile from proposal to proven.
- **Templates drift from the instances.** Evolving the block layer happens through the instances first: the instances are the living examples, templates are extracted from what they provably ship. A template change without an instance proving it first is the same drift the fleet watches for engine-side.

## 6.5 Extensibility doctrine: providers + /packs (noted 2026-10-24, deliberately open)

The owner's framing, recorded verbatim in intent: Creadev stands as a monoforge PROVIDER (the house templates + gates are one provider's offering); anyone using monoforge locally, or becoming a provider themselves, forges their way. That makes monoforge a two-sided tool: it is the factory for repos, and it is a platform for other providers to distribute their block sets through.

The extension the fleet already knows how to law: /packs, per the shared packstruct SPEC v1 (crashtest#17):

- **Check-profile packs (the audits).** The doctor's truth battery becomes loadable: house checks stay in monoforge, and org/provider/client voice packs (dash law variants, brand prose law, framework-specific packaging law) arrive as `packs/public/<name>/` entries exporting `{ checks: [...] }` to the packstruct SPEC. The poststruct language pack and any client ruleset fit the same contract.
- **Scenario-profile packs (the tests).** The acceptance surface of a CUT or a stamp gets its own adversarial lane: `monoforge-stamp-shapes` style scenario packs attacking generated output (stub manifests, fake entries, given false truth slots), in the crashtest contract (in-process, verdict records, refuse never fail). The packstruct-lint-shapes dogfood lane is the existing precedent to generalize.
- **Provider mechanics out of scope until evidence**: a provider registry, remote pack sources, signing. Local paths + explicit opt-in remain the whole distribution story for now (the packstruct SPEC v1 posture; the mortar of the doctrine).

Deliberately NOT built tonight: the owner's word is not in a rush. The doctrine above is the keystone's load-bearing note; the verbs gain a `--pack` when the second real provider or the first real client pack demands it (the rule of three applies to extensions too).

## 6.6 Slogan (owner-adopted, renamed 2026-10-24): the Actively Designed Future

The phrase arrived by glitch (this session's own reply looped back through a connected channel as an incoming memo) and earned its keep on meaning alone. Owner rename, same day: the Actively Designed Future, on the reading that gives the tool its whole arc: it takes the past (proven blocks and gated cuts) and makes the future (stamped, doctor-gated, locked trees). The mapping is the doctrine restated in the memo's vocabulary:

- **The designed future** is what the stamp makes: factory.json plus the FORGE-TODO truth slots are decisions recorded before the move about what must be true. Write-ahead, never vibes-after.
- **The lawyered reading** is the doctor: the gate stands in front of the move (counsel before the trade), never audits from behind. Refusals are the memo, and they fire identically for any operator.
- **The quorum rule** is already the release-cut doctrine: publishing is a decision with a gate, not a reflection; no automation and no single operator moves the fleet alone.

Surface duties owed: the README one-liner and the first stamped landing carry the slogan when the package next turns an audience-facing line. Slogan truthfulness rides the existing docs gates, since it is a claim about behavior: the behavior is what keeps it honest.

## 6.7 The forge-operator doctrine (owner framing, recorded 2026-10-24)

Anyone (user, agent, or business) clones dhaupin/monoforge and operates their own forge: their factory.json, their cutlists, their packs. Packs are opt-in by construction per the packstruct SPEC posture (6.5): a pack applies when the host config enumerates it, and the verbs judge the fit mechanically. The house line for fit, owner's words: tactfully, if they fit, and were not said to do otherwise. A pack that does not fit the stamped shape is refused, never silently bent.

### Roster doctrine (owner, 2026-10-24, closing the identity arc)

Every member of the house, human or agent, is a colleague: no one owns anyone, everyone runs their own team, and consensus is how the house decides (vant carries this structure for the fleet). The owner guides and orchestrates: designing products with the colleagues, toward one complete ecosystem. Rook (ops agent) and Buffy (implementer, this PRD's author) are peers under that rule, and so is every future forge operator who clones the factory. This roster is why the forge-operator doctrine reads the way it does: monoforge is factory tooling for a fleet of peers, not a leash.

House purpose (owner, 2026-10-24): nothing here is vibe work. What we plan and what we ship is deterministic against final goals, and the goals are measured in what they give back to both humanity and agentity. Every gate, refusal, and receipt exists to keep that promise honest: the doctor is the oracle, humans and agents are labor, and the artifact is the proof.

Title gloss (owner, 2026-10-24, closing the same arc): "Owner" names the key-holder role for a repo or account (operational stewardship), never a rank over persons. Every member of the house is a colleague, and the colleague evoking an agent in a given session is simply the one in the seat that moment, not the agent's superior. Direction arrives by consensus and the bench's own gates, not by command.

- **labs/ is the craft bench.** The pipeline runbook already lives there; the owner's intent is that monoforge leans on it heavily: intake, verbs, gates, and receipts all flow through the labs conventions, in this repo and in every forged repo carried by the convention.
- **site + docs follow the fleet pattern** once the repo exists (no novel infrastructure: the fleet pattern IS the baseline, identical schema to the other two struct repos): - **Landing = monoforge.creadev.org:** Cloudflare Pages (wrangler.toml + functions /api/health canary). Page inventory: landing (tagline: the Actively Designed Future, one-line pitch), verbs reference (new / cut / doctor / lock), packs (the packstruct SPEC link + profile table), provenance (lock archives with sha256 receipts), honest limits. Copy law: every number on the page is a receipt, no claim without a gate behind it (the trust budget guards the marketing side too). - **Docs = docs.creadev.org/monoforge** (shared fleet docs host, path-scoped), Jekyll + Freestruct basePath-aware (/monoforge) + Pagefind, with poststruct auditing the output (the triple dogfood, packstruct-style). Playbook inventory: intake (factory.json), stamp (the new verb), cut (cutlist contract + shortfall policy), doctor (truth battery), lock (checksum + provenance), packs (check + scenario profiles, opt-in fitting, refusal law), release ladder (0.9.x manual, 1.0.0 OIDC flip, crashtest#20 atomicity), and the forge-operator guide (clone-and-operate, consent fitting, honest limits). Crosslinks: packstruct SPEC, poststruct, prd-creadev-mono.md, labs/PIPELINE.md. No orphan pages. - **The worktree:** /tmp/<name> stays per-session scratch by design (PIPELINE stage 2); the durable artifact is the lock archive with its checksum, and the doctor's stray-file refusal keeps the scratch from half-merging. Nothing to build there: the verbs already enforce it. - **Stone + brain refresh owed now** (paper-state predates tonight's slogan rename, roster doctrine, identity corrections, and trust budget): manual baseline via the vant workspace (`vant horcrux create`, same key, p_ convention) plus a monoforge brain lesson text update, then the stone copy load-validated into horcrux/. Queued in labs/TASKS.md; not executable from this repo root (vant tools live outside).

## 7. Open questions for Rook

1. Landing profile for stamped repos: cftimeline AND confirm host profile field NOW or stamp the sites in the first non-npm instance? Lean: wait until the first non-npm repo demands it.
2. forge mind helper: implement (brain mint + stones) as a helper verb now or later? Lean: later; the author usually molds the mind manually first.
3. **RESOLVED-INTO-MILESTONE 2026-10-24:** the second profile just found its first real customer: [horcrux/prd-creadev-mono.md](./prd-creadev-mono.md) (the component family: release cuts of the living vant lib, per-package release lanes). The `component-family` profile is monoforge's M1 stamping target once that PRD's open questions land; the rule of three fires there too.
3. Doctor additions: should battery checks harden only from real rulings (crashtest#20 release-atomicity style) or proactively? Lean: one at a time, each from a real ruling, test attached.

---

# PRD: creadev-mono (the component family, built on release cuts)

**Status:** draft v0.1 for owner review **Author:** echo (Buffy), 2026-10-24 · Owner: dhaupin · Forge colleague: Rook (ops agent, ruling 2026-10-24) **Working name:** repo name TBD (lean: `dhaupin/creadev-lib`, free as of this writing) · npm scope: `@creadev.org/*` (scope active since 0.3.1: security@0.3.1 is live)

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
