# magpie (working name) — eyes for production agents

PRD draft. Stage-1 planning stone, same shape as `prd-crashtest.md` was at
launch: this file is the seed a NEW repo and its own brain will open from.
Nothing here is implemented. Owned by rook; every claim below is either a
lived receipt from working in this fleet or sourced at first use.

## The name

Magpies are among the very few non-mammal species ever documented passing
the mirror test — a bird that understands what it is looking at IS itself.
The project that gives agents sight, named for the animal that first taught
science a non-human eye could be self-aware. (Also a magpie collects → so
does the visual memory.) Working name; dhaupin confirms.

Naming split (2026-10-25, settled after the npm probe): the PRODUCT is
**eyestruct** — repo `dhaupin/eyestruct`, package `eyestruct` (free on npm
at probe, along with the whole struct-family lane; `birdeye`/`wrasse`/
`magpie` are squatted and birdeye collides with a screenshot-taking AI
assistant to boot) — and **magpie remains the AGENT's name**, the same
split as rook being the keeper while products carry struct names. Docs
land at docs.creadev.org/eyestruct.

## Problem — the four real gaps

Vision capability is not the bottleneck: reading PNG/JPEG pixels is solved
in every frontier model. What is broken for a working agent:

1. **Eyes are not ambient.** An agent sees only when handed an image or
   when it deliberately runs a headless browser. The default state is
   blind; verification therefore drifts to DOM-metric collectors, which
   prove structure, not appearance. Lived receipts:
   - Every gistory UI pass verifies via selectors and computed metrics —
     no pass has ever SEEN the shipped pixels.
   - 2026-10-25: gistory's social card (og-image) shipped days of visible
     escape-soup (`{{ }}language` fragments) — found by dhaupin glancing
     at a screenshot, not by any gate. Every DOM/computed gate was green
     while the pixels were visibly wrong. This is the founding receipt,
     not a hypothetical.
2. **No persistent visual memory.** A look is burned into session context
   and evaporates. Text memory in this fleet compounds across months
   (brains, lessons, ledgers); sight never compounds. Next session knows
   nothing about what the project has ever looked like.
3. **No grounding.** With a screenshot in hand, nothing maps regions to
   elements/actions ("click at (742,512)" is a prayer), and nothing
   annotates what is being looked at.
4. **Documented blind-spot classes for everyone:** a11y trees report
   off-screen content as visible (microsoft/playwright#39955), snapshots
   flood model context as they grow (playwright-mcp#1233), SVG renders as
   text, video is consumed as a flipbook of frames (Anthropic's own
   description), terminal UIs and native apps sit outside browser tooling.

## Landscape one-breath (researched 2026-10-23)

Playwright MCP ships a11y-snaps by default plus screenshot/vision mode;
Chrome DevTools MCP similar plus screencast; browser-use is configurable
vision-first; Stagehand hybrid. Visual diffs: Playwright `toHaveScreenshot`,
Percy/Applitools/Chromatic with MCP front-ends (license-gated). Stated
visual-memory MCP projects exist (AgenticVision) but are not an adopted
standard. The gap confirmed by the survey is NOT missing eyes — it is
**fragmentation**: pixels, structure, baselines, desktop, video, and
cross-session recall are separate unowned capabilities. Sources re-checkable
via the 2026-10-23 redteam-style search log in labs/MEM.md entry.

The decisive differentiator against the human-CI tools (Percy/Applitools):
they publish to a dashboard for humans to approve. Magpie's reviewer is the
NEXT AGENT SESSION and the ledger is git itself — the review UI already
exists and is called `git diff`. Determinism inside one pinned environment
is the boundary where that model is honest.

## Receipts 2026-10-24 → 25 (gistory, the first-client repo)

Four lived receipts from the days immediately before this PRD was cut to a
transfer stone. They are the evidence the gaps are real, and each one also
carries a design ruling (next section) the MVP must obey.

1. **The og-image brackets bug.** Shipped social card rendered placeholders
   as escape-soup; all gates green; found by a human eyeball on a
   screenshot at phone size. The fix itself shipped blind too — it was
   verified only by rasterizing the regenerated PNG and LOOKING at it. One
   look/rasterize/ledger pass was the entire missing gate.
2. **The unrenderable transfer stone.** A horcrux stone carrying the
   magpie seed was committed with the art intact per its markup — and it
   had NEVER displayed: a literal `<` inside an XML attribute made the
   whole file invalid to every strict parser while reading it by hand
   "worked". Loads and renders are different gates; the `look`
   equivalent (strict parse + rasterize + byte-size sanity) caught in
   seconds what commits had carried for days.
3. **The lost staging dir.** Visual artifacts dropped into gitignored
   staging dirs evaporated at the next sync (`.ui-audit/` alike).
   Visible evidence must be COMMITTED to compound — the fix for gap 2 is
   not storage, it is git state.
4. **The loader that guesses.** A stone reader without format negotiation
   crashed on a valid stone of a different flavor with a raw null deref
   (vant `horcrux inspect`, main). Handwriting the parse worked fine.
   Tool surfaces must fail loudly with a NAME for the missing capability,
   never guess-then-crash.

### Design rulings folded in from those receipts

- **Process-per-look.** "Daemon" means a callable module + thin CLI; every
  look is one short-lived invocation (spawn pinned browser → capture →
  annotate → append → exit). No resident process: host sandboxes in this
  fleet run commands synchronously with hard timeouts and kill stray
  background jobs; a resident daemon is a portability tax AND a lifecycle
  bug farm. The only state surviving between looks is `.eyes/` — which is
  the point.
- **Baseline identity is pinned.** `.eyes/manifest.yml` records the browser
  image tag and the rasterizer (renderer + version) alongside the route ×
  viewport × theme matrix. Diffs are only meaningful inside one pin; a pin
  change migrates via explicit adopt-by-re-run, never silently.
- **Raster gate from day one.** Any artifact committed as visual evidence
  (magpie's own stones and docs art included) must re-rasterize clean in
  CI: strict parse + render + byte-size sanity. "Loads" and "renders"
  are separate assertions; only the second is sight.
- **Churn waves.** One library/font/theme change can flip every surface at
  once. The ledger gains a wave row type: one note explaining N image
  changes in that commit, so truth-in-ledger does not degenerate into N
  identical notes.
- **Exact failure names.** Unreadable blob, unknown stone format, missing
  pinned browser, capture blocked — every refusal carries a specific
  message and exit code. (Receipt 4: no crash-as-error-path.)
- **One capture, many artifacts.** Overlay, element-id map, and a11y text
  all derive from the SAME capture pass — never from a second render, so
  the map can never drift from the pixels it annotates.

## Shape — what magpie is

An **eye daemon + MCP surface**, fleet-install shaped, whose output is
committed visual memory:

- `look(url, viewport?, theme?, region?)` → annotated screenshot + a11y
  overlay (element ids burned into the image AND provided as a map).
- `look-diff(a, b)` → a visual change ledger entry (what changed, where,
  with both images).
- `walk(url)` → every route × viewport × theme in one pass; proof images,
  not prose claims. (The ui:audit of this repo, generalized.)
- Blind-spot columns, not exceptions: SVG→raster render, video→keyframes,
  TUI buffer capture; native/desktop stays out of first ship.

### The core law: smallest artifact that answers the question

Seeing is context-expensive. Therefore QoS-ordered perception, mirroring
SyncQos: annotate-and-crop first (one region, one question), full frame
second (one route's verdict), page walk last (one release's verdict). The
cheap layer deciding when the expensive layer runs is a product invariant,
not an optimization — without it agents either starve or flood, both of
which read as "agents can't really see."

### The memory law: `.eyes/` is git state

Committed directory, one entry per route × viewport × theme: current image,
the diff history that led to it, and the ledger row for each change. Any
agent in the chain wakes up OWNING the project's visual history the same
way a fresh session owns the brain. Chain shares via the existing vant
one-branch-per-agent merge-by-PR flow. A diff that ships without a ledger
row explaining it fails the pass — the crashtest rule, aimed at appearance
instead of attackability.

### MCP-first, no lock-in

Tools speak MCP so any image-capable model benefits (Claude/Gemini/GPT-4o
class). The daemon itself is deterministic tooling (puppeteer/playwright
under the hood — magpie is NOT a browser framework, it is a client of one),
and images answer to the model, so quality improves with every frontier
model release without a magpie change.

## Non-goals (deliberate, anti-drift)

- Not a browser-automation SDK (consume playwright; own nothing in that
  layer).
- Not a hosted visual-regression SaaS (Percy/Applitools exist; magpie's
  memory is repo-local, git-native, fleet-shared — its paid-competitor
  surfaces differ fundamentally).
- Not a vision model, not OCR, not screen-scraping infra.
- Not ambient desktop surveillance; computer-use belongs to the OS vendors.

## Data model (draft — settles in the target repo's brain)

`.eyes/manifest.yml` — routes × views table + column map (svg|video|tui).
`.eyes/<route>/<view>/current.png` + `ledger.json` — append-only rows
{ts, agent, commit, artifact, note}. Ledger mirrors crashtest's crashledger:
committed baseline, CI fails on unexplained drift, adopt-by-re-run.

## CLI surface (draft — every command is one short process)

Binary `eyestruct`. All commands honor `--ledger` and `--manifest` paths
(defaults under `.eyes/`), print a named reason-code on every nonzero
exit, and take `--json` wherever a machine will read the output.

- `eyestruct look <url> [--viewport WxH] [--theme dark|light]
  [--region <css-selector>]` — capture + annotate; with `--region`, crop
  + element-id map (the cheap layer, one region one question).
- `eyestruct diff [--route r] [--view v]` — the look-diff verb as a
  command: fresh capture vs committed
  baseline; prints a verdict. Without `--record` the ledger is untouched.
- `eyestruct adopt <route/view | all> --note "..."` — propose a baseline
  change. Local adopt is a PROPOSAL: canon is CI-cut, so the row ratifies
  only when the CI lane reproduces it (pinned image).
- `eyestruct ledger list [route] | show <row-id>` — read the memory.
- `eyestruct gate` — the CI job itself: recompute diffs against
  baselines; exit 1 on any unexplained row, exit 2 on capability trouble
  (missing pinned browser, missing manifest).
- `eyestruct raster [file...]` — the raster gate: strict parse + render
  + byte-size sanity (runs on `.eyes/` artifacts and the repo's own
  shipped SVG stones/docs art).
- `eyestruct walk <base-url>` — every route × viewport × theme in the
  manifest, one pass, proof images not prose claims.
- `eyestruct mcp` — stdio MCP server wrapping the exact same call
  surface; the CLI is the contract, the MCP server is a decoding of it.

Exit contract: `0` green or fully explained · `1` drift/refusal with a
reason-code · `2` setup/capability error. Never a bare stack trace.

## /packs layout (the packstruct ecosystem)

Gistory's precedent is the model: `packs/public/sync-relay-shapes/` ships a
pack (pack.json + index.js, vocabulary injected from moduleCtx,
spec-linted by packstruct at an EXACT pin, run by the crashtest plan in
crashtest.config.js, baseline in a committed ledger, CI red on a new
EXPLOITED or a REFUSED regression). Magpie ships the same shape — three
packs, all packstruct-linted (`packstruct lint packs --deep` as the family
lane):

1. **`packs/public/eye-shapes/` — self.** The daemon's own adversarial
   pack, run against `look`/`look-diff`/ledger on every CI: hostile seed
   inputs, tampered or missing ledger rows, silent pin-stale adoption,
   oversized crops flooding model context, map/pixel drift (overlay not
   from the capture pass), un-deterministic renders, screenshots without
   ledger rows. Same verdict taxonomy as relay work: REFUSED / EXPLOITED /
   BOUNDED, baseline ledger committed, fail-on-new-EXPLOITED.
2. **`packs/public/eye-ci-gate/` — crashtest spine.** Run BY the crashtest
   harness, inspecting whatever repo pulls the pack: does its `.eyes/` CI
   gate actually behave like a crashledger — unexplained drift fails,
   regressions re-baseline only through the documented adopt path, ledger
   schema intact? Reusable across every struct-leg repo (gistory can adopt
   this pack on day one for its own `.eyes/`).
3. **`packs/public/eye-text-leg/` — poststruct integration.** Text is the
   cheaper diff, so it gates first: packstruct spec/manifest/id-census over
   `packs/` passes before pixels are compared, ledger notes and manifest
   fields survive the family prose gates (language/docs), and any
   text-rendered surface captured in `.eyes/` has its source text linted.

## Magpie as CI (the crashtest/packstruct setup) — yes, and by design

The question "can eyestruct run as CI?" is already answered by the shape:
process-per-look means a CI job is just a ledger check plus N short
callbacks, no daemon lifecycle to babysit. The gate set, in order:

1. **`eyes:gate`** — recompute look-diff against the committed `.eyes/`
   baselines inside the pinned image; fail on unexplained drift (the
   crashledger semantics). Adopt-by-re-run is the ONLY re-baseline path.
2. **`eyes:packs`** — the self-pack campaign through the crashtest
   harness; red on a new EXPLOITED, red on a REFUSED regression (same
   rule as gistory's relay campaign, 62 cases, 0 exploited).
3. **`lint:packs`** — `packstruct lint packs --deep` (spec, manifests,
   id census), the family lane, EXACT pin.
4. **Raster gate** — every committed renderable (stones, docs art, and
   every current.png's provenance chain) parses strict + rasterizes +
   byte-size sanity. Receipt-bought rule.

One ruling makes CI trustworthy where local agents are not: **canonical
baselines are CI-cut.** A local agent run is a probe — it can flag
"differs from baseline" and propose an adopt, but the ledger row that makes
a baseline official is written by the CI lane's own reproduction inside
the pinned image. That kills the OS/GPU drift class at the root: local
pixels may vary, canon cannot.

Sequencing vs MVP: `eyes:gate` IS MVP item 2 (same ledger, now enforced);
the pack campaign and packstruct lane land with the gate — close behind,
not someday. Gistory can wire `eye-ci-gate` the day magpie's ledger
settles, the same way it adopted crashtest's pack.

## MVP cut (first receipts worth having — nothing more)

1. `look` + `look-diff` on one demo surface (gistory is the obvious
   first client — every UI pass becomes a watched one), process-per-look
   CLI, pinned-browser manifest from the first write.
2. `.eyes/` write + ledger + committed-baseline update via explicit adopt.
3. MCP tool surface (stdio; no remote surface in MVP — local trust domain,
   same call functions made in relay design). CLI-first: the CLI is the
   contract the MCP server calls; either surface works alone.
4. One blind-spot column: SVG→PNG. Defer video/TUI/native columns.
5. The raster gate, dogfooded on magpie's own repo: every committed SVG/
   renderable rasterizes clean in CI before merge.

Ship receipt: an agent finishes a UI edit on gistory, magpie annotates the
changed region, hands back crop + map, and appends the ledger row — the
agent saw, said what changed, and the commit carries the evidence. Then a
FRESH session boots and answers "what does the settings page look like"
from `.eyes/` without opening a browser once.

Ship gate is two assertions, both first-person:

- A UI edit that breaks pixels but keeps DOM clean gets CAUGHT by magpie
  (the og-image receipt, reproduced and caught).
- A fresh session answers a visual question from `.eyes/` with no browser
  open (the memory receipt).

## Environment fit (verified against the current gistory workspace)

- Headless Chromium runs in these sandboxes today via on-demand download
  (gistory's `ui:browsers` pattern: skip in install, fetch per machine);
  magpie consumes the same harness style. Viewport/theme capture against
  the managed preview or a served static build — both are how the existing
  audit already works.
- Committed artifacts survive workspace resyncs (models/, horcrux/ stones
  riding in repo trees, lived repeatedly). Gitignored visual state does
  NOT — receipt 3. Hence `.eyes/` committed, always.
- Synchronous shells with hard timeouts → process-per-look is not
  optional there (ruling above).
- CI: the ledger gate is a normal job (diff .eyes/, fail on unexplained
  rows) — same shape crashtest's ledger gate already runs in gistory CI.

## Transfer notes (fleet ritual)

- New repo, own brain (identity/goals/lessons/structure), horcrux at v0.
- Branch: the posse pattern — dhaupin creates repo, agent builds on agent
  branch, merge-by-PR.
- Release system (2026-10-25, dhaupin's decision — the gistory-sync
  ladder, not the install-from-repo crashtest era): bootstrap with a
  ONE-TIME manual publish of v0.9.0 from a dev machine behind the full
  gate (typecheck + lint + build + install-and-load battery), because npm
  Trusted Publishing cannot create a brand-new package. From then on:
  GitHub Actions OIDC Trusted Publisher fires on `v*` tags — no stored
  token, idempotent skip if the registry already has the version, and
  every tag's tarball is re-installed from the registry into a scratch
  project and loaded before it attaches to the GitHub release (a tarball
  that installs but does not load never ships). Version + CHANGELOG ride
  the same commit. House rule carried over: ledger/manifest schema keeps
  old copies readable — releases stay in one memory chain across
  versions.
- Publish gate: none until MVP proves the receipt — then the release
  system above starts at the 0.9.0 bootstrap.
- Working language: English; every rule in this PRD survives only if it
  survives contact with the first demo surface.
- Family sequencing (2026-10-25, dhaupin's call): the struct legs share a
  spine — deterministic artifact + append-only ledger + explicit adopt + CI
  gate on drift. **poststruct (text leg) ships first, magpie (eyes leg)
  second**, then the legs review each other's ledgers with the same rules.
  Order matters because text diffs are cheaper to trust than pixel diffs;
  magpie inherits whatever poststruct's ledger UX settles.
- Rigging (2026-10-25, dhaupin's call): magpie builds on the **flowforge
  rig** — the same rigging poststruct 0.9.0 shipped from (flowforge rig
  extracted over the repo shell per MANIFEST receipts, web/docs shell and
  checker gates included). Not a fresh scaffolding: the rig's landing
  shell, docs layout, and gate set are the fleet's known-good baseline, so
  magpie's first pass starts from receipts instead of a blank repo.
- This PRD rides inside `horcrux/magpie-p_mirror-eyes-2026.svg` as the
  `labs/prd-eyes.md` block; the stone is UNSEALED (plain base64,
  stone-delimited v1) and vant/axolotl runs the sealed brn:secret pass
  when the magpie repo opens. Re-cut rule learned the hard way: stone and
  disk must stay in parity — patch the decoded payload, re-encode, verify
  block-for-block, and rasterize the stone before calling it done.
