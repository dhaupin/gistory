# Changelog

All notable changes to `gistory-sync` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/). Old synced payloads stay mergeable within the same major: optional fields added in a minor keep old copies mergeable, so devices running different package versions converge in one chain.

## [Unreleased]

## [1.1.1] - 2026-11-12

### 2026-11-12 - the Dependabot flow lands (railyard#31)

`.github/dependabot.yml` now carries the family flow: a weekly (Monday) pass, grouped minor/patch updates in one pull request, majors alone, and the `github-actions` ecosystem so the SHA-pinned refs move without a hand-edit. npm directories `/`. The config header names the family caveat - a tool whose output is committed as canon can have a "minor" release that changes the canon (the eyestruct 1.1.0 overlay case), so a bump arrives as a pull request that runs CI. The shape is proved and guarded on the parent (`dhaupin/creadev` PR #38; `dhaupin/railyard#31`). No version bump.

### 2026-11-10 - light mode by default (web + docs)

Owner directive: the family defaults to light. The product sites and docs sites shipped dark-first (a persisted `light` was the opt-in); now light is the first paint and a persisted `dark` theme is the opt-in. Shape: `<html>` pins `data-theme="light"`, the pre-paint bootstrap applies only a persisted `dark`, and the `theme-color` meta flips to the light paper. The CSS token blocks are untouched (the light block is already the second half of one set), so no palette, toggle handler, or gate changed.

- `docs/_layouts/default.html` - the pre-paint bootstrap drops the OS-preference fallback for a `light` default (a persisted `dark` still wins).
- `src/index.css` - the 404 page drops its `prefers-color-scheme: dark` override, so a JS-less 404 is light unless the app's persisted dark is applied.
- No change to the app: `src/index.css` was already light-first (`:root` light, `body.dark`).
- Receipts: `npm test` 60/60; `npm run lint:docs` PASS.


### 2026-11-03 - breadcrumbs on (engine + this site)

Google Search Console showed the family's properties under a breadcrumbs enhancement with 0 results. Recon split the fleet: the docs sites run freestruct (auto BreadcrumbList since 1.1.0); the product sites run prestruct, whose `buildJsonLd()` is site-wide by contract and could never emit a per-route trail. prestruct gained engine-level `breadcrumb: true` (injectMeta owns the route path), and this repo turned the discovery surface on in its configs.

- `docs/freestruct.config.yml` - `breadcrumb: true` (freestruct carries auto BreadcrumbList since 1.1.0).
- `ssr.config.js` - `breadcrumb: true` (active once the prestruct engine feature ships).
- Receipts: docs config validates against the pinned engine; docs sync:check PASS where generated.
- No version bump; a discovery-surface opt-in.


### Changed

- **Family devDependency pins advance to the current cuts.** `crashtest` `^1.1.0 -> ^1.3.0`, `eyestruct` `1.0.0 -> 1.1.0`, `freestruct` `^1.2.0 -> ^1.3.0`, `packstruct` `1.0.0 -> 1.1.0`, and `prestruct` `^1.2.0 -> ^1.3.0`. The committed `labs/crashledger.json` + `labs/run-meta.json` were regenerated under crashtest 1.3.0: the verdict set gains three REFUSED rows and nothing regresses (0 new, 0 regressed, 0 verdict changes).
- **The crashtest CI action is pinned, and its version input is now set.** `crashtest.yml` moves off the v1.0.0 action ref to the v1.3.0 commit (`8738287`) and now passes `version: '1.3.0'` - without it the action installed `crashtest` latest, a float, so the gate could drift under a passing run.
- **The docs-lane caller SHA moves to freestruct v1.3.0 (`7dfb172`)** with `freestruct-version` `1.2.0 -> 1.3.0`; the living `docs/ci.md` + `docs/playbooks/index.md` freestruct references move with it.
- **The family prestruct floor moves to `^1.3.0`.** `scripts/check-prestruct-pins.cjs` refuses any declaration below 1.3.0 (the SSRF-guard security round), and the guard's own battery gains the inverse case - the old `^1.2.0` floor now fails.

### Fixed
- **The `.gitignore` docs block carries the in-tree Jekyll + pagefind products (2026-11-10 sweep, coreforge#48).** Propagated from the coreforge adopter sweep (dhaupin/coreforge#52): a local `bundle exec jekyll build` + pagefind run drops its products beside the source, and the belt-and-suspenders block named only some of them. It now carries `docs/.jekyll-cache/`, `docs/.jekyll-metadata`, `docs/pagefind/`, and `docs/pagefind*`, so a local build leaves no untracked noise. No version bump.

- **Two legacy `labs/.eyes` ledger rows point at the artifact, not the slot directory.** `row-0005` and `row-0006` named `home/desktop-1280-dark` and `settings/desktop-1280-dark` - slot DIRECTORIES, the pre-`adopt <route>/current.png` form. eyestruct 1.1.0's gate reads the ledger with lstat truth, so a row pointing at a non-file is `DANGLING_ROW` (the class eyestruct#17 fixed on the write side), and the pin advance turned that latent defect into a red `eyes-mem` leg on a clean tree. Both rows now name `<slot>/current.png`, the shape their sibling rows already use; the gate reports `2 visual artifact(s) all explained by 12 ledger row(s)`.
- **The `sync-smoke` legacy first-byte check no longer flakes.** `tests/sync-smoke.ts` asserted that a legacy blob's first byte is never the tag byte by reading the first byte of the *ciphertext* - but AES-GCM output is indistinguishable from random, so it landed on `0x01`/`0x02` about 0.8% of runs and reddened `CI/verify` on a clean tree (two consecutive failures on the pin-advance PR, ~0.006% if truly random). The tag byte (`TAG_RAW 0x01` / `TAG_DEFLATE 0x02`) rides at the front of the *plaintext*, and legacy plaintext is JSON starting with `{` (`0x7b`), so the invariant holds by construction. The check now reads the plaintext fixture it already builds - deterministic, same intent, and it still bites if the engine's legacy framing ever collides.

## [1.1.0] - 2026-11-06

The hardening round since v1.0.0. The hash router - the app's entry point - no longer crashes on a malformed shared link, and the docs lane folded into the family's one reusable workflow. Every fix is battery-pinned.

### Fixed

- **The hash router no longer crashes on a malformed URL.** `parseRoute` decoded each query value with a bare `decodeURIComponent`, which throws `URIError` on a bad percent-escape - so a shared link like `#/project?id=100%` threw at app init and on every `hashchange`, uncaught, into a white screen. Decoding now goes through a `safeDecode` that falls back to the raw text (the same guard the serve/probe layers already carry), so a pasted URL degrades to a literal value instead of a crash. `test/router.test.cjs` pins it against the real source (transpiled with the repo's own TypeScript) and bites both ways.

### The docs-lane consolidation (2026-11-04)

The family built docs from four topologies; the two reusable lanes had drifted (ruby 3.2 vs 3.4, pagefind `latest` scrape vs npm pin). The docs lane is now ONE canonical reusable workflow in `dhaupin/freestruct`, and this repo is a thin caller of it.

- `.github/workflows/docs.yml` calls `dhaupin/freestruct/.github/workflows/docs-lane.yml@22bb7e9b2634d6cdd966963d9e25c7f892577276`, keeping only the trigger, permissions, concurrency, and this repo pins.
- ruby 3.4; the docs truth gates (`scripts/check-docs.mjs`) stay in `ci.yml` (via `bun run lint`), since a caller cannot carry extra steps.
- No version bump; a workflow consolidation, not a released surface.

### Security

- **Pins, never floats (packstruct#69).** Every GitHub Action `uses:` in `.github/workflows/` names a 40-hex commit SHA (tag kept in the trailing comment), never a floating `@v4`/`@v1`. A new guard, `scripts/check-action-pins.cjs`, refuses any floating ref, a branch, or a `docker://` image; it runs as `npm run lint:pins` inside the `prepublishOnly` gate and CI, and its own battery (`test/check-action-pins.test.cjs`) proves it bites both ways.

### Fixed

- **The release ladder's `verify` job no longer races `release`.** `verify` now declares `needs: [publish, release]`, so it waits for the GH release object and its attached tarball before judging them. A bare `needs: publish` ran `verify` CONCURRENTLY with `release`: on a fresh cut the registry read replicas had not settled and the asset was not yet attached, so a publish that in fact succeeded failed red and needed a manual re-run (the packstruct 1.1.0 first cut). `verify` still stands alone in verify-only mode (`publish` and `release` both skipped). The propagation poll budgets also widened: the release-attach poll 120s -> 300s, and the registry poll in `scripts/verify-release.cjs` 120s -> 360s. `test/release-verify.test.cjs` pins the dependency so a regression fails by name.

## [1.0.0] - 2026-11-03

### Security

- **Wake-target subscribe now enforces a push-service egress allow-list (SSRF, dhaupin/gistory#55).** `POST /sync/subscribe` requires no write secret by design, and it validated `endpoint` only as "an https URL" — so a caller could point the relay's wake fan-out at any host, and the relay would later `fetch` it with a VAPID-signed POST. `endpoint` must now be an https URL on an allowed push-service host (`isAllowedPushEndpoint`: `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`), refused at subscribe time and re-checked in `wakeOne` before every fetch — so a row written before the rule (or by a bug) is pruned, never dialed. The refusal is a distinct `[wake] blocked (egress allow-list)` tail line. New crashtest probe `sync-relay-shapes/subscribe-egress-allowlist` pins it (REFUSED), and `sync:smoke` §10/§11 cover both the subscribe-time refusal and the fan-out re-check.

- **Device membership is now gated on the chain write secret.** The chain id is public by design (it is the PBKDF2 salt and rides the pairing token), so keying the device roster on it alone let anyone who knew a chain id inject device rows, rename any member, and read the member list. `handshake` now registers a device row — and returns the roster — only when the request presents the chain's correct write secret, and `/sync/status` reveals the roster only to a registered member. A secretless (or wrong-secret) handshake still answers `200` with head/version/writeAuth, so a read-only device keeps reading; it just neither joins the roster nor sees it. This retires three crashtest accepted risks — `phantom-device-rows`, `member-rename-nuisance`, and `status-nonmember-read` now read REFUSED (ledger: 56 REFUSED / 6 BOUNDED → 59 REFUSED / 3 BOUNDED, 0 EXPLOITED).

### Fixed

- **The expected-set probe no longer parses `npm pack --dry-run --json`.** The phone's npm answers that probe with empty stdout even under `--loglevel=error`, so the ladder's `JSON.parse` failed and read as a capability failure on a clean tree (the `always-auth` warning was a red herring on stderr). The ladder now derives the expected set from a REAL `npm pack` of the checkout, listed by the same `tarList` the served tarball already goes through - the code path the forbidden scan proved works on the phone.

- **The staged publish `.npmrc` no longer writes the deprecated `always-auth` line.** npm >=9 warns `Unknown project config "always-auth"` on it, and that warning reaches the child processes the `prepublishOnly` gate spawns. The staged file is now exactly one line (the `${NPM_TOKEN}` expansion).

### Added

- **An offline test for the vendored phone publish lane (`scripts/ship-from-download.cjs`).** The lane itself was already committed byte-identical from the family copy source; it had no test here. This adds `test/ship-from-download.test.cjs` (temp dirs + an injected runner, no network) and runs it in CI, proving the lane assembles + refuses correctly and that the publish token never lands in a staged file, in argv, or in the log. The wrong-folder-zip case (`NOT_A_PACKAGE_TREE`, the Android `<repo>-main/<repo>-main` extraction shape) is one of the named refusals it covers.

### Changed

- **Changelog + release-notes standardized to the family shape.** `CHANGELOG.md` is now Keep-a-Changelog end to end (a `## [Unreleased]` block over `## [version] - date` sections) and `scripts/release-notes.cjs` is the family's single superset extractor: it reads the KAC heading, still reads the older bare (`## 1.2.0`) and v-prefixed (`## v1.2.0`) forms, closes the version token so `## [1.2.0]` never matches a `## [1.2.0-rc.1]`, and refuses a version with no section by name. One extractor across the family means one release-body shape everywhere.

### Fixed

- **The release ladder no longer races registry propagation, nor false-flags a branch-name `target_commitish`** - both surfaced by the crashtest 1.2.0 live cut. `scripts/verify-release.cjs` polls `dist-tags.latest` **and** the version entry through npm's post-publish propagation window instead of reading once (the first read saw the old `latest`), and the `release` job retries `npm pack <pkg>@<ver>` the same way (it read `ETARGET: no matching version` seconds after publish). The release check now accepts GitHub's `target_commitish` default-branch name and treats only a 40-hex SHA as a commit claim (a branch name is not drift; the tag is the identity). Two pins in the release-verify leg hold both fixes.

### Changed

- The publish lane adopts the family release ladder (eyestruct@4e2b552): one `publish.yml` with three jobs — `publish` (0.x refused, tag==version gate, `npm publish --provenance`) → `release` (the GH release body extracted from the changelog via `scripts/release-notes.cjs`, refused if empty) → `verify` (`scripts/verify-release.cjs` re-asserts the served tarball's sha512 against the registry integrity, provenance presence, the full pack ladder, and the release object's target commit). The separate `release.yml` folds into the ladder's `release` job. The `release` job also attaches the served tarball to the GitHub release (`npm pack gistory-sync@<version>`), and `verify` asserts the asset's sha512 equals the registry integrity - the GH release and the npm artifact are the same bytes. The pack ladder also runs offline every push (`test/release-verify.test.cjs`, wired into `prepublishOnly` as `release:verify`).
- gistory is no longer the family's factory (forge-role decouple). The staging mounts (`monoforge-staging/`, `poststruct-staging/`) and the family registry (`mounts/`, incl. the snapshot tars) are removed — poststruct and monoforge graduated to their own repos and are the source of truth, each with its own CI. The forge-role workflows retire (`monoforge-ferry`, `staging-tars`, `mount-stone-mirror`, `mono-web-emit`, `mono-rig-emit`, `doctor-fix-emit`, `identity-emit`) along with the dead tar scripts and the family-stone cutter. `ci.yml` drops the `staging-hosts` job and the `poststruct-staging` install step; `framework-gate.mjs` drops the poststruct TEXT/TEXT-REF legs; `stone-ferry.yml` now re-cuts gistory's own stone only. Every gistory self-CI lane (the verify job, docs, crashtest, migrate, the eyestruct EYES-ART/EYES-MEM legs, `birth-gate.mjs`) stays. The factory role moves to railyard; the other forge machinery is left in place for now.

### Fixed

- The docs lane goes green again: `docs.yml`'s `build` job had failed on every push since 2026-10-27 because the ferry pinned `freestruct@1.1.0`, whose `--strict` internal-link checker resolved a root-absolute nav href (`/gistory/why`) against the output root instead of stripping the configured `basePath`, so every nav link on the baseurl'd docs site read as broken and `--strict` exited 1. freestruct 1.2.0 lands the fix (the checker now strips the exact configured `basePath` before resolving; freestruct#32). The pin rides to `^1.2.0` and the `docs/ci.md` ferry claim tracks it.

### Added

- The staging integration branch is now a permanent CI surface (gistory#30): `ci.yml` runs on push to `staging` as well as `main`, `docs.yml` watches both but its deploy job is gated to `main` (`if: github.ref == 'refs/heads/main'`) so a green build on staging never publishes the live docs site, and a new `staging-ff-sync.yml` fast-forwards `staging` to `main` after every promotion (non-destructive refspec; a divergence fails the job instead of rewriting history). The remaining write-side workflows (`migrate.yml`, `stone-ferry.yml`, `mono-web-emit.yml`, `staging-tars.yml`, `monoforge-ferry.yml`, `mount-stone-mirror.yml`, `tasks-insert.yml`) keep their `main`-only triggers deliberately: widening them would let a staging-era commit reach D1 or a live surface before promotion, which is the trap the issue named.
- **The lint lane goes green (gistory#30).** The vendored family scripts (`scripts/unwrap-prose.cjs`, `scripts/ship-from-download.cjs`) are copied byte-as-is from the eyestruct copy source, but the flat ESLint config was still grading them as this repo's TS/React code - 9 errors (CJS `require`, the sanitizer's deliberate control-character regexes, dead buffer vars) had left `staging`'s CI red on the Lint step, which undercuts the point of a permanent CI surface. They are ignored now (the copy contract needs the bytes identical, so editing them is not an option); the lane reports 0 errors, 5 advisory warnings.

- The supporting trio lands on both surfaces: the landing site gains `/why` (the problem: good prompts are written once and lost), `/what` (what Gistory is, as its parts: library, templates, organization, sync), and `/about` (who builds it, the struct family, the license) - wired through `ssr.config.js` + `src/AppLayout.tsx`, linked from the lander nav. The docs tree gains `docs/why.md`, `docs/what.md`, and `docs/about.md`, reachable from a new docs nav "About" section.

### Changed

- **The rig rides prestruct `^1.2.0`** (was `^1.1.0`), taking the react-router 7 prerender seam fix (prestruct#68). The root app pins react-router-dom 7 (`^7.18.4`, real ESM) and sets `ssr.noExternal: ['react-router-dom', 'react-router']` - exactly the shape that hit the two-instance seam (the engine's `StaticRouter` and the app's router loading as separate module instances, each with its own React contexts). 1.2.0 loads `StaticRouter` through the app's own Vite SSR registry, so the two now share one instance; `ssr.noExternal` is kept (still required to keep the app's `react-router-dom` in Vite's SSR module graph). The root app runs React 19, and 1.2.0 deliberately bounds its react peer to `>=18 <19` (prestruct#58 ask 1; the react-19 lane is prestruct 1.3.0), so a targeted `overrides` entry (`prestruct.react: "$react"`) lets the proven-good React 19 tree satisfy the peer while the ceiling stays honest. The lock is edited in place (fetch-don't-transport; the registry-derived form churns 400+ unrelated optional/peer lines under a newer npm). Build re-verified end to end with the prerender cache cleared: `Done. 6/6 pages rendered`, audit 0 failures.

- `Message` edits carry their own timestamp: merge compares `updatedAt ?? createdAt` for both the tombstone check and the win check, so a content edit wins by recency regardless of which device made it. Older payloads without the optional field stay mergeable unchanged (the fallback keeps them on the shared base).

## [0.9.0] - 2026-10-22

The engine's first npm release, published from the gistory monorepo ([dhaupin/gistory](https://github.com/dhaupin/gistory)) where the app, relay, and red-team suite share one verify battery with it.

### Added

- **E2EE sync engine** — `SyncAgent`: PBKDF2 (`passphrase + chainId`) → AES-GCM-256 key derivation, full-state encrypted push/pull against a blind relay, `GS1-…` pairing tokens (chain id + write secret), and the storage seam (IndexedDB, localStorage fallback) that runs in Node ≥ 18, web workers, and the browser.
- **Pure merge rules** — `mergePayload` & friends: timestamped last-write-wins with a deterministic deviceId tie-breaker, tombstones so deletes sync and never resurrect, per-key merges for settings, variables, and synced view-state (drag order + collapse).
- **QoS scheduling** — `SyncQos`: debounced pushes, mid-push coalescing into one follow-up, exponential backoff with jitter honoring the server's `Retry-After`, terminal-failure awareness so refused pushes idle instead of looping.
- **Shared models & helpers** — threads/projects/messages, deleted registries, variable pools with dead-scope sweeping, view-state maths (`pruneView`, `rankBetween`, `moveWithinSubset`), and sync error shaping.
- **TypeScript declarations** — one self-contained ESM bundle (`dist/lib/index.mjs`) plus declaration output in the same tarball.

### Security

- Write auth on every chain: the write secret is minted by the creating device, travels in the pairing token, and is stored server-side only as a SHA-256 hash — the relay never holds anything derived from the passphrase.
- The relay is blind by design: it sequences and stores ciphertext it cannot decrypt; unsecured-chain takeover paths are closed at creation time.

### Notes

- The React app and the relay ship from the monorepo, not from this package.
- Self-hosting the relay, pairing flows, and maintenance runbooks live in [DEPLOY.md](https://github.com/dhaupin/gistory/blob/main/DEPLOY.md); user documentation at [docs.creadev.org/gistory](https://docs.creadev.org/gistory).
- Releases run on version tags via npm Trusted Publishing (OIDC) — see the repo's `AGENTS.md` for the release runbook.

[0.9.0]: https://github.com/dhaupin/gistory/releases/tag/v0.9.0
