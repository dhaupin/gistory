# PRD: poststruct

**Status:** draft v0.1 — for owner review **Author:** echo (Buffy), 2026-10-23 · Owner: dhaupin · Forge colleague: Rook (ops agent, ruling 2026-10-24) **Companion repos:** [prestruct#37](https://github.com/dhaupin/prestruct/issues/37) (shared audit core proposal), [freestruct#18](https://github.com/dhaupin/freestruct/issues/18) (freestruct audit proposal — superseded by this PRD)

---

## 1. One-line pitch

**poststruct audits what shipped.** A zero-dependency CLI that walks a directory of baked HTML — any generator's output — and verifies it against a head/damage contract: SEO hygiene, link integrity, i18n, accessibility-lite, feeds. FAIL-level findings exit non-zero so CI gates regressions. It is the third leg of the struct family: prestruct puts SEO *in before* the build, freestruct puts SEO *in after* an SSG, poststruct checks what both of them (and everyone else) actually *shipped*.

## 2. Naming & identity

| | |
|---|---|
| **Name** | `poststruct` — npm name free (checked 2026-10-23); `dhaupin/poststruct` exists on GitHub (created by Rook 2026-10-23, empty) awaiting first push |
| **Family** | prestruct → (your build) → poststruct. Portfolio grid sits next to its siblings |
| **Tagline candidates** | "Audit what shipped." / "Your output, checked." / "CI for the things crawlers see." |
| **License** | MIT (house standard for OSS fleet) |
| **Runtime** | Node ≥ 20, ESM, **zero runtime dependencies** |

## 3. The principle (scope fence)

**poststruct only ever reads files on disk.** No SPA runtime, no headless scraping, no source-code archaeology, no live-site fetching (beyond an explicitly opt-in external-link pass in a later milestone). This fence is what makes it timeless: it audits whether you grew up with React or Notion or hand-rolled HTML.

Everything inside scope shares one input shape: **a page = a file path + raw HTML string + relative path from root.** Every check consumes pages and emits findings. Nothing else is sacred.

## 4. First-class concepts (the core)

### 4.1 Check

The atom. A check is a pure-ish unit:

```js
// checks/head/canonical-missing.js — shape, not final location
export default {
  id: 'head/canonical-missing',       // stable, versioned by level not content
  module: 'head',
  level: 'fail',                       // 'fail' | 'warn'
  docs: 'https://poststruct.dev/checks/head/canonical-missing', // later milestone
  appliesTo: (page) => !page.is404,    // scoping hook
  run(page, ctx) → Finding | Finding[] | null,
}
```

Findings carry `page`, `id`, `level`, `message`, and (later milestone) a machine-readable `detail` object so `--json` consumers can diff runs.

### 4.2 Module

A named group of checks with a shared concern. The catalog (each is independently disableable):

| Module | Milestone | What it enforces |
|---|---|---|
| **head** | M0 (seeded, exists today) | title present + sensible length, description present + length band, canonical absolute, OG(7) + Twitter(4) sets, og:image raster-format (SVG = FAIL), JSON-LD parses + LocalBusiness recommended fields, h1 sanity |
| **site** | M0 (seeded, exists today) | sitemap.xml exists, loc count sanity, lastmod presence, robots.txt + `Sitemap:` pointer, 404 keeps only its noindex contract |
| **links** | M1 | internal `<a href>` graph vs files actually present (+ `_redirects`), mailto/tel excluded, broken internal = FAIL; external link validation opt-in flag, network-aware |
| **i18n** | M2 | `<html lang>` present and non-empty, hreflang pairs resolve reciprocally, no conflicting `lang` claims between head and body |
| **a11y-lite** | M2 | informative `<img>` without `alt` = FAIL (decorative `alt=""` respected, requires heuristic), form controls labeled, `viewport` present, skip-link present (as warn) |
| **feeds** | M3 | RSS/Atom well-formed, canonical match against sitemap entries |
| **language** | M2 | Voice policy on rendered text: dash-class bans (em/en dash FAILs by default, configurable classes), an AI-cliche starter lexicon ("delve", "tapestry", "It's not just X, it's Y" constructions, "unlock the potential", "in today's fast-paced world" style tells), per-org banned-term lists via config or voice pack. Findings carry counts + first context snippets so humans review, not robots |

### 4.3 Report & exit contract

- Human output: one line per finding, `FAIL page: message` grouped by module, count summary footer
- `--json`: stable versioned schema (`{ version, counts: {fail, warn}, findings: [...] }`) — CI annotations and dashboards derive from this; **schema changes are breaking by semver rules**
- Exit: `0` clean/warns-only, `1` any FAIL, `2` usage/environment error (no dist to walk)

### 4.4 Config (small on purpose)

```js
// poststruct.config.js  (also readable as poststruct.config.json)
export default {
  dir: 'dist',                       // or CLI arg
  checks: {
    'head/title-length': 'warn',     // per-check override: 'fail' | 'warn' | 'off'
    'a11y/*': 'fail',
  },
  scope: {
    is404: (path) => path === '404.html',
    skip: ['pdf-reports/**'],        // globs excluded from the walk
  },
}
```

No config at all must still produce a sensible audit. The 404 contract and the seed script's current heuristics become the defaults, not required config.

### 4.5 Pack (designed day 1, demanded by real demand)

Checks need distribution: a WordPress-shaped bundle (`wp-seo-shapes`), Astro, Shopify, org-internal rulesets. This differs from crashtest's threat model — our checks are pure file readers, so no hostile-payload isolation theater — but code in a pack still executes, so the lifecycle keeps two proven controls: **explicit opt-in and local-only sources**.

**Pack layout** — deliberately identical to crashtest's on-disk convention (`packs/public/<name>/pack.json` + entry), so the whole struct/crashtest fleet keeps one mental map and greppable convention:

```
packs/public/<pack-name>/
  pack.json        # { schemaVersion: 1, name, description, version, entry }
  entry.mjs        # exports default { checks: [Check, ...] }
```

The only delta from crashtest packs: the entry exports checks, not attack scenarios, and there is no armed-key shim — the config `packs:` entry is the arm (see the lifecycle rules below).

**Contract rules:**
- Check ids from a pack are **namespaced by pack slug**: `wp/duplicate-title`, `astro/static-props-in-head`. Builtins keep their module ids (`head/canonical-missing`). Collision at load time = refuse to start (never silently dedupe).
- `pack.json` is validated at load: missing/wrong `schemaVersion`, non-dotted `version`, or missing `entry` refuses with a nameable error. (Crashtest scaffold lesson: a manifest that says `entry: index.js` but ships no index.js must be an instant, explicit refusal — not a deep import stack trace.)
- Loading: from **local paths only** in M0 (`packs: ['./packs/wp-seo-shapes']` in config, or repeated `--pack` flags). An npm-source loader (`packs: ['@poststruct/wp-seo-shapes']`) lands in M2 once the semantics are stable — never auto-download, never implicit.
- **The config entry is the arm.** Being listed in `packs:` is opt-in; no separate arming ceremony. A pack not listed never runs.
- Packs ship a **self-audit fixture** in CI like builtins do: every pack carries `test/fixtures/bad/` proving its checks fire, so a broken pack fails its own build, not just the host's.

**First-class packs — the full shapes catalog is at the end of this section.** One special category isn't an ecosystem shape:

| Pack | Milestone | What it knows that core doesn't |
|---|---|---|
| org packs | whenever | house rulesets (mandatory hreflangs, brand-route policies, per-client style SEO law) distributed without forking core |

**The voice pack:** the language module's starter lexicon stays deliberately small and generic; the flavorful part (a full house lexicon of AI tells, per-client banned words, brand-voice law) ships as an **org voice pack** — the `org packs` category §4.5 already named, minus the dash hypocrisy this document itself ships. First one: `@poststruct/voice-house`, seeded with Rook's standing law: no dashes, anywhere, ever. The honest boundary: mechanical bans (dash characters, lorem ipsum, whitespace disasters) belong in core where every site wants them; taste belongs in packs. Core enforces physics, packs enforce vibes.

Precedent: crashtest's `wp-roles`/`wp-money-shapes`/`vite-dev-shapes` proved the model — surface-specific knowledge in optional bundles, core stays clean for everyone else.

**The shapes catalog** (every ecosystem that bakes HTML has its own head sins — this is the known set, by demand):

| Pack | Milestone | The sins only this shape knows |
|---|---|---|
| `wp-seo-shapes` | M1 (needed now) | Yoast/RankMath header collisions (double description, double og:title from plugin + theme), `_yoast_wpseo` schema duplication, archive/facet pagination canonical traps, attachment-page noindex drift |
| `prestruct-shapes` | M1 (our own, first customer) | The engine's own contract, enforced: per-route injection actually landed (title/description not template defaults), `data-server-rendered` marker present on hydrated routes, `deploy-id` meta fresh, incremental-cache staleness (sig drift = build raced), modulepreload leakage on 404, og:image dims/alt present (prestruct#38), per-route og:image override honored, FAQ/scope injections idempotent (no double blocks on cache-hit rebuilds) |
| `freestruct-shapes` | M1 (our own, second customer) | `freestruct-build` meta present + fresh, missing-only gate honored (page-owned SEO survived injection), cache-busting hash consistency across asset references, `basePath` correctness on sub-path installs (canonical + hreflangs resolve to the deployed base), injected global JSON-LD intact, user 404 pages got the full pipeline (#11 contract held) |
| `astro-shapes` | M2 | islands/hydration artifacts in head, trailing-slash mismatches between `build.format` variants, `getStaticPaths` misses silently 404ing linked pages, view-transitions head quirks |
| `shopify-liquid-shapes` | M2 | Liquid comment leakage, theme-app prefetch injection, duplicated platform meta under app-added tags, primary-vs-alternate currency canonical traps, pagination pagination param canonicals |
| `gatsby-shapes` | M2 | gatsby-image preload bloat (data-URI og), noindex leftovers from cloned templates, sitemap dupes across created pages |
| `hugo-shapes` | M2 | `.Summary` leaking into every archive description, taxonomy pagination canonicals, og template partials wired twice |
| `jekyll-shapes` | M1 (client demand) | excerpt-as-description collisions, jekyll-seo-tag + hand meta double-shipping, orphan hreflang pairs |
| `eleventy-shapes` | M2 | pagination.href mis-resolves, `relativeTo` canonical bugs, collection index dupes |
| `nextjs-static-shapes` | M3 | `__NEXT_DATA__` ghosts, next/head merges shipping duplicated og, trailing-slash canonical divergence from `trailingSlash` config |
| `sveltekit` + `nuxt` static | M3 (docs trio) | head-merge duplication on prerendered islands, sitemap/canonical base drift |
| `docs-suite-shapes` | M3 (docusaurus·vitepress) | hardcoded base-path canonicals that break on sub-path deploys, versioned-docs hreflang/sitemap scope bleed |
| `vant-shapes` | M3 (fleet dogfood) | **The vant cherry-pick** (source audit 2026-10-23): the file-shaped subset of vant's checks/gates, vacated from runtime burden. Static checks over a repo's `models/` tree: brain layout conformance (required identity file, no stray roots), config sanity (`succession.trust.default` in {high,medium,low,none}; `low` requires `trust.core` declared), ledger hygiene (`.ledger.json` parses, entries ≤ cap, hash format), anchor ledger lines parse as JSONL with consistent hash shape, **secret scan** (no API keys / `KEY=value` material committed in brain markdown — the crashtest env-canary oracle, aimed at `models/`), name validity (vant's own `^[a-zA-Z0-9_-]{1,64}$` rule reused for aliases), backup-freshness warns. What STAYS vant-side, deliberately: the runtime gates — RLS at private-read seams, sandbox capability checks, trust-floor verdict enforcement, crew-bus admission signatures. Those need live state and contexts; files-on-disk can't hold them and shouldn't pretend to. Net effect: vant keeps the enforcement, poststruct borrows the regression reporting — vant CI runs `poststruct audit --pack vant-shapes` on release candidates, so drift in layout/config/ledger conventions fails before a session inherits it |

Two special properties of the engine shapes packs:

1. **Dogfooding with teeth.** prestruct-shapes and freestruct-shapes audit the engines' *own* output — engines gain their CI guarantee from the shared core on day one of the core's existence, and every engine regression poststruct already knows about (modulepreload on 404, #ils backreference classes) becomes a FAIL the engines' own CI catches upstream of users like us filing issues.
2. **Wrappers collapse into shapes.** With shapes packs existing, the 'engine wrapper' from section 5 is mostly just *invoke poststruct with the right shapes enabled* — the scoping rules live in the pack (`appliesTo`), not a bespoke wrapper package. One integration surface, one contract.

## 5. Ecosystem integration (how prestruct/freestruct consume it)

Each engine ships a thin wrapper package (or embeds the CLI step) that calls poststruct with an engine-appropriate profile:

- **prestruct:** walk `dist/`, apply the 404 scoping rule, pass route count from ssr.config for sitemap sanity. Target home: prestruct#37. With `prestruct-shapes` (M1), the 'wrapper' is one poststruct invocation + shapes flag.
- **freestruct:** same walk, plus engine's `basePath` awareness so sub-path installs compute canonical/sitemap URLs correctly. Target home: freestruct#18 — mostly subsumed by `freestruct-shapes`.
- **Neither engine hard-depends on poststruct** in its core build — the wrapper is an optional devDependency, and CI wiring is an opt-in workflow step. Engines stay lean; the contract lives here.

Documentation for both engines' audit proposals gets repointed here (one new tracking issue each, since issue edits/comments are not available in this environment).

## 6. Milestones

### M0 — bootstrap (target: one working session)
- [ ] Pack loader in the core from day 1: manifest validation, slug-namespaced ids, collision refusal, local-path sources. Ships empty (`packs/` dir absent = fine) but the contract is real code, not a stub
- [x] Create `dhaupin/poststruct` — DONE (scaffolded 2026-10-23): full repo at 0.9.0 in hand — core (bake/audit/linkcheck/referencecheck modes), self-audit fixtures PASSING, packs mount, `.github/workflows/` (test.yml, publish.yml with the 0.x refusal gate, linkcheck.yml), README/AGENTS/CHANGELOG/DEPLOY/LICENSE, `labs/TASKS.md`, `horcrux/`. npm pack dry-run clean (8 files, 5.8 kB). BLOCKED on push: repo exists on GitHub but is not writable by the Freebuff agent — needs reconnection of the repo to the Freebuff GitHub App; publish first as 0.9.0 (manual), 1.0.0 flips OIDC per DEPLOY.md
- [ ] Port `scripts/seo-audit.mjs` from creadev.org as the `head` + `site` modules verbatim (it already passed a negative test: doctored output → 2 FAILs → exit 1)
- [ ] Check registry + findings schema + CLI entry (`poststruct audit [dir]` / `--json` / `--module`)
- [ ] Fixtures: `test/fixtures/good/` and `test/fixtures/bad/` (baked HTML copies) run in CI; **self-audit the fixtures and assert exact findings** — the negative test becomes a permanent CI job
- [ ] npm publish + GitHub repo README with the check catalog
- Acceptance: `npx poststruct audit dist/` on creadev.org build exits 0 fixture-identical to today's `npm run seo:audit`

### M1 — links + the engine/co-client shapes
- [ ] **`wp-seo-shapes`** (client demand): Yoast/RankMath collision checks, WP canonical traps
- [ ] **`jekyll-shapes`** (client demand): excerpt-as-description collisions, jekyll-seo-tag double-shipping, orphan hreflangs
- [ ] **`prestruct-shapes`** + **`freestruct-shapes`** (our own engines, first shape customers): engine contracts become FAIL-checks — prestruct/freestruct CI gets its audit guarantee through poststruct itself
- [ ] Internal link graph + `_redirects` + anchor (#fragment) targets
- [ ] Optional `--check-external` (network gate, concurrency limit, per-URL retry, results cached to stdin/stdout for CI reuse)
- Acceptance: renaming a route in creadev.org fails CI with the stale-link list

### M2 — i18n + a11y-lite + the ecosystem shapes
- [ ] **npm-source pack loading** (`packs: ['@poststruct/wp-seo-shapes']`) with the no-auto-download rule holding
- [ ] **`astro-shapes`**, **`shopify-liquid-shapes`**, `gatsby-shapes`, `hugo-shapes`, `eleventy-shapes` (subset — WP, Jekyll + engine shapes will have stress-tested the contract)
- [ ] `lang`/`hreflang` module, informative-image alt heuristic
- Acceptance: creadev.org ships clean on both; a deliberately broken fixture page fails

### M3 — feeds + the framework trio + polish
- [ ] `nextjs-static-shapes`, `sveltekit`/`nuxt` static packs, `docs-suite-shapes` (docusaurus·vitepress)
- [ ] RSS/Atom checks, `docs` URLs per check, `--format=github` annotations mode
- [ ] Public launch: flip repo public, add to creadev.org Projects data (`section: 'open-source'`, capture SVG in house style), announcement post in case studies if it earns one

## 7. Non-goals (explicit)

- **No JSX/TS source linting.** Different job, different tool.
- **No runtime scoring (Lighthouse-style perf).** Numbers need a browser; our promise is files.
- **No auto-fixing.** Findings only — fixes belong to the engines and the developer.
- **No nursemaided plugin governance.** Packs are explicitly configured, locally loaded, manifest-validated — the governance is the loading contract, not a review process.

## 8. Open questions for Rook

1. Package layout: multirepo `poststruct` + wrappers-in-engines (my default) vs monorepo with `@poststruct/cli` + `@poststruct/check-*`?
2. Should the seed `head` checks *replace* the engines' `audit` proposals (#34/#18) rather than complement them once M0 lands? (My lean: yes — one truth source, new tracking issues point here, old ones get closed by hand.)
3. Name check: do we want `poststruct.dev` for the docs-URL convention now or later?
4. Do we dogfood it in creadev CI from M0 (replacing `npm run seo:audit`) the day it works, or run both in parallel one week first? (My lean: parallel first — conflicts between the two should surface in CI noise, not product confidence.)

## 9. Site & docs plan (decided 2026-10-23)

- **Landing site: built on prestruct itself** (the engine eats its own cooking, and its output feeds me as first customer). Base: the prestruct repo's `/example` app (verified present: `example/` with `src`, `scripts`, `public` — the starter most users copy). Rebrand to poststruct identity (dark stone theme matching the fleet: crashtest.creadev.org's look is the reference), swap copy to the audit pitch, run `poststruct audit` on its own `dist/` in CI. **Domain (Rook, 2026-10-23): `poststruct.creadev.org`** — subdomain of the house site, as part of the fleet "...-struct.creadev.org lineup"
- **Docs: the fleet's own shapes.** Keep docs lean in M0 (README + checks table); a docs site can graduate to `/docs` on Jekyll + Pagefind + Freestruct later (the packstruct docs build is the template — see prd-packs.md). **Domain (Rook, 2026-10-23): `docs.creadev.org/poststruct`** — the shared fleet docs host, path-scoped per project (sibling: `docs.creadev.org/packstruct`). Freestruct output gets poststruct-audited; triple dogfood.
- **Deploy hosts frozen (Rook, 2026-10-23):** landing = Cloudflare Pages (`wrangler.toml`, `pages_build_output_dir = dist`, `functions/` Pages-Functions surface with `/api/health` canary); docs = GitHub Pages via Actions (`docs.yml`: ruby→jekyll, then `scripts/build-docs.sh` runs freestruct basePath-aware (/poststruct) + pagefind, then official artifact deploy). Freestruct config verified upstream before scaffolding: canonical = site.url + basePath + relSlug (the issue-#3 basePath fix).
- **Collisions research (2026-10-23):** the `/packs/` directory convention is ours at tool-repo root. Rails Webpacker/shakapacker uses `app/javascript/packs/` (source entrypoints) and `public/packs/` (compiled output) — path-qualified, different intent, no meaningful collision. Cloud Native Buildpacks is a `pack` CLI, not a directory. Documented in prd-packs.md so authors are never confused.

## 10. House onboarding (what the repo gets on day 1)

- **`/labs/TASKS.md`** — the own-runner convention every fleet repo carries (crashtest and prestruct already do; verified present in both).
- **`/horcrux/`** — continuance stones. **Brain already minted:** `models/public/poststruct/` exists in the vant workspace (identity, goals, lessons generated 2026-10-23) and its boot stone lives in this repo at `horcrux/poststruct-p_poststruct2026-VqT3mK.svg` (valid horcrux, contents = the full brain stack under its own key — the house continuance pattern, same as echo's stone). Note for later: both new stones snapshot the full stack by design of `horcrux create`; a per-brain stone mode would be a vant upstream idea, not a blocker.

## 11. Honest risk register

- **Fragment targets (`#foo`) in linkcheck** require in-page anchor extraction — small, but fiddly with SSR'd React attrs; ship anchors as WARN in M1, promote in M2 if stable.
- **The a11y "informative image" heuristic is the oldest trap in automated a11y.** Decorative-vs-informative is context-dependent; we mark `alt=""` as decorative and everything else as informative, documented as a conservative policy — never claim WCAG conformance, only that these specific failures are caught.
- **Cliche detection is lexicon-and-construction matching, not authorship forensics.** It catches known tells (dash bans being the only unambiguous one); it will miss fresh AI-isms and flag the odd human sentence that happens to contain "seamlessly." Policy: banned terms are configurable per org, default level WARN for lexicon hits (human review), FAIL reserved for the mechanical classes (dash characters, keyboard mashing, lorem ipsum in production). Never claim it proves human authorship — it proves the absence of named patterns, which is the thing you can actually enforce.
- **Zero-dep discipline vs future HTML parsing.** The seed uses regexes and they've held fine (16 routes × 4 or so a day of rebuilds, dozens of tt runs). If a check needs a real parser, that's the moment one dependency becomes acceptable — decided then, not now.
- **Scope creep pressure is real** ("just add one more checklist") — the file-on-disk fence is the defense; every feature pitch that violates it goes to non-goals immediately.
