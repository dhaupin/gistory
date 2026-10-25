# The struct-family ecosystem (draft stone 2026-10-25)

Three legs share one spine. Each replaces a class of manual test people have
scattered in their repos with a deterministic artifact, an append-only
ledger, an explicit adopt path, and a CI gate on drift. This file is the
map; individual receipts stay in each repo's own brain.

## The legs

| Leg | Repo | Layer | Replaces (the scattered manual tests) |
|-----|------|-------|----------------------------------------|
| TEXT | `poststruct` | baked HTML: head, links, sitemap, site hygiene | "glance at the meta description", hand-walked link checks, "did the 404 bake" |
| EYES | `eyestruct` (magpie) | pixels: look / look-diff / `.eyes/` visual memory + raster gate | "open the page and look", screenshot reviews that evaporate, the og-image escape-soup receipt |
| ATTACK | `crashtest` | adversarial campaigns against live surfaces: relay takes-over, races, oracles, floods | redteam spreadsheets, one-off "try to break it" scripts |

The bake itself comes from the un-baked leg: freestruct/prestruct render
(`npx prestruct build` here in gistory). The legs cascade cheap-to-expensive:

```
bake (prestruct) -> TEXT audit (poststruct) -> PIXELS look (eyestruct) -> ATTACks (crashtest)
```

Text is the cheaper diff so it gates first - `eye-text-leg` in eyestruct's
pack family encodes exactly that ordering.

## Where the packs complement

- **`eye-shapes`** (eyestruct): self-attack, the daemon's own adversarial
  campaign, in the crashtest pack shape with the crashledger-semantics
  packledger (`packs/eye-ledger.json`).
- **`eye-ci-gate`** (eyestruct): the crashledger-verifier any struct-leg repo
  pulls - today run by eyestruct's zero-dep runner, tomorrow by the
  crashtest harness when a non-relay scenario lane lands. The contract is
  already moduleCtx-shaped.
- **`eye-text-leg`** (eyestruct): the poststruct integration inside the eye.
  Found + fixed a real hole writing it: control characters refused at the
  ledger write surface (UNSAFE_TEXT; DEL is the CLI-facing vector since the
  OS refuses NUL in argv first).
- **`sync-relay-shapes`** (gistory): the family's reference pack, the shape
  all of the above was derived from.
- poststruct's audit returns typed findings and a `--json` schema; eyestruct
  consumes nothing from it today BY DESIGN (the legs are independent gates),
  the *framework gate* is where they compose.

## The framework gate (this repo as integration host)

`npm run framework:gate` runs the legs that apply to gistory in one command
with the family exit contract (0 green / 1 fail / skips are NAMED, never
fake passes):

- TEXT: `poststruct-staging/bin/cli.mjs dist/` - audited 4 baked pages on
  first run, surfaced 3 real prose findings (description lengths, missing
  og:image dims) that no DOM-gate had flagged.
- EYES-ART: `eyestruct-staging raster` over the horcrux stones + favicon.
- EYES-MEM: the `.eyes/` ledger gate - honest SKIP until gistory adopts its
  own `.eyes/` (eyestruct-staging runs it on itself today).

## Adopted for real (2026-10-25, same day)

- **gistory now owns `.eyes/`**: manifest pin
  (`local-chrome@154.0.8037.57` + resvg), two committed baselines
  (home lander dark 77934B, settings dark 55881B), two ledger rows
  (ratified:false, canon stays CI-cut), gate green. First receipt from the
  adoption itself: dark and light at the same viewport capture
  BYTE-IDENTICAL frames - the lander is theme-invariant today, and a future
  real light theme will trip `diff` against exactly these baselines. The
  framework gate's EYES-MEM leg is no longer a skip: it fails CI on
  unexplained drift, family crashledger semantics.
- **poststruct ships `eyes-reference`** (`packs/public/eyes-reference` +
  `scripts/run-packs.mjs`, `npm run packs|packs:adopt`): the og:image
  pixel-reference pack. Every social image a baked page declares must be
  REAL pixels - file exists, magic bytes parse (PNG/JPEG/SVG), PNG IHDR and
  JPEG SOF-walk dimensions agree with declared og:image:width/height, size
  plausible; SVG refs route through the EYES-leg eyestruct raster gate (the
  interop direction). Remote https refs verify deterministically through an
  armed LOCAL twin perm; absent twin stays a docketed BOUNDED, never a fake
  pass. First run on gistory: the production og-image.png verified
  1200x630 / 127506B through `public/og-image.png`.
- **CI**: `.github/workflows/ci.yml` now runs the framework gate right
  after the prestruct prerender (the baked pages exist by then), next to
  the crashtest campaign - the full family cascade gates every push.
  A missing optional resvg in a clean CI checkout is a NAMED capability
  skip, not red.

## The conformance lanes (2026-10-25, later still)

**packstruct Part 2, unparked by DOING it:** the second half of conformance
(`packstruct audit-conformance`, SPEC section 7) is now run on both staging
hosts, and the audited loaders were tightened until they HONORED it rather
than the lane being written around them:

- **eyestruct** (`scripts/run-packs.cjs`): 1/8 → **8/8 honored**. The pack
  loader now enforces the SECTION 2 grammar at load (kebab name + dir match
  + collision, schemaVersion 1, dotted version, description, relative
  entry), accepts the spec's ESM-default entries (`export default` fixtures
  are inert on purpose — run(ctx) is a campaign concern, not a load
  concern), and still runs the real campaign with the crashledger exit
  contract (23 cases, 0 exploited, unchanged).
- **poststruct** (`scripts/run-packs.mjs`): the single-pack hard-wire is now
  a multi-pack discovery loop with the same grammar. 8/8 honored; the real
  eyes-reference pack still renders its PASS verdicts byte-for-byte and the
  self-test is 8/8.
- Both hosts now CARRY the pin: packstruct **1.0.0 exact** as a
  devDependency (the crashtest convention: same commit → same findings
  applies to the linter too), `lint:packs` + `conform:packs` scripts, and
  `npm run check` runs the whole chain (docs → packs → lint → conformance).
- The consumers/collaboration map after all this: poststruct publishes
  eyes-reference which raster-gates SVGs through eyestruct (EYES-ART leg);
  eyestruct's eye-text-leg extends poststruct's text discipline into the
  .eyes/ ledger; gistory's framework gate composes TEXT + EYES-ART +
  EYES-MEM + ATTACK per push; and packstruct now audits that the pack
  loaders of the TEXT + EYES legs are grammar-true, not just their packs.

## The attachment byte channel (2026-10-25, gistory)

The images groundwork's other deliberate hole is closed the same day:
cross-device bytes ride POST/GET `/sync/attach` — the payload-external,
write-auth'd, byte-budgeted channel. Blind relay preserved (bytes are the
same AES-GCM `iv.cipher` envelope the push payload uses); size gate names a
refusal when the decrypt disagrees with the merged metadata; devices PUT at
save and GET any referenced id they lack after merges; backups gain an
opt-in `attachments` block (Settings "include images") restored through the
caps. Smoke 411/411 (new §15), barrage C1 fuzzes the route, migration
0005 + flattened schema verified, campaign baseline 0 new / 0 regressed.

## The ratification lane + MCP (2026-10-25, later)

- **`eyestruct ratify`** - canon is now machine-cut: re-capture every
  manifested route in the pinned environment; byte-identical slots ride
  append-only `ratify` rows behind their `ratified:false` proposals. Drift
  is named per slot and never edits the ledger. Ran live on gistory:
  both baselines reproduced byte-identical (rows 0003/0004).
- **`eyestruct mcp`** - a real stdio MCP server (zero deps) decoding the
  same call surface: nine tools, named reason-codes as tool errors,
  captureStdout framing seam, perception QoS (map by default, pixels on
  request). Any image-capable client can now SEE: `look` with
  `include_image` pays the pixel cost only when it wants pixels.
- **Ratification CI lane** - `.github/workflows/eyes-ratify.yml` (manual
  dispatch): drip provision browser -> bake -> static serve -> ratify ->
  append-only ledger commit. First dispatch may NAMED-fail on OS-class
  drift (honest, by design); adopt-by-re-run inside the CI environment is
  the only cut path, which is the whole point.
- **packstruct v1.0.0 lane live for both staging packs** - the lint found
  the missing default export on eyes-reference's birth day. One
  grammar-less ship would have carried it into the tarball.

## What "consistent framework" means, mechanically

1. One artifact grammar: crashtest's crashledger => eyestruct's
   `.eyes/ledger.json` + packledger. Append-only, atomic writes, corrupt =
   loud exit 2, drift unexplained = exit 1, canon is CI-cut.
2. One refusal discipline: named reason-codes + exit contract 0/1/2, no
   bare stack traces (gistory probes, eyestruct verbs, crashtest verdicts).
3. One adoption path: nothing self-heals silently; changes re-baseline
   through an explicit row (`adopt --note`, `--adopt`, re-run).
4. One place per test-class: the mapping table at the top is the ritual -
   if a swept manual test fits no row, that is a new leg or a new pack, not
   a bespoke script.

## Restore receipts (2026-10-25)

- `poststruct-staging/` re-entered the workspace beside `eyestruct-staging/`
  (clone of dhaupin/poststruct). The 0.9.0 SOURCE was recovered from the
  deleted `horcrux/poststruct-0.9.0-lock.tar.gz` in that repo's git history
  (`git show 22fc13c~1:...`) - the exact transplant tar the gistory-era
  staging carried; self-test 8/8 PASS on arrival.
- `eyestruct-staging/` lives here with its own 6-commit history (rig shell
  -> engine wiring -> baseline dogfood -> packs) plus the tracked
  `horcrux/eyestruct-staging-git-2026-10-25.tar.gz` transplant receipt.
- Nested `.git` dirs of both staging trees are gitignored in the parent
  (gitlink guard); the histories remain canonical upstream and ride the
  tar receipts where there is no remote.
