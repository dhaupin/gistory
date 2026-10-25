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

## Problem — the four real gaps

Vision capability is not the bottleneck: reading PNG/JPEG pixels is solved
in every frontier model. What is broken for a working agent:

1. **Eyes are not ambient.** An agent sees only when handed an image or
   when it deliberately runs a headless browser. The default state is
   blind; verification therefore drifts to DOM-metric collectors, which
   prove structure, not appearance. Lived receipt: every gistory UI pass
   verifies via selectors and computed metrics — no pass has ever SEEN the
   shipped pixels.
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

## MVP cut (first receipts worth having — nothing more)

1. Daemon: `look` + `look-diff` on one demo surface (gistory is the obvious
   first client — every UI pass becomes a watched one).
2. `.eyes/` write + ledger + committed-baseline update via explicit adopt.
3. MCP tool surface (stdio; no remote surface in MVP — local trust domain,
   same call functions made in relay design).
4. One blind-spot column: SVG→PNG. Defer video/TUI/native columns.

Ship receipt: an agent finishes a UI edit on gistory, magpie annotates the
changed region, hands back crop + map, and appends the ledger row — the
agent saw, said what changed, and the commit carries the evidence. Then a
FRESH session boots and answers "what does the settings page look like"
from `.eyes/` without opening a browser once.

## Transfer notes (fleet ritual)

- New repo, own brain (identity/goals/lessons/structure), horcrux at v0.
- Branch: the posse pattern — dhaupin creates repo, agent builds on agent
  branch, merge-by-PR.
- Publish gate: none until MVP proves the receipt; no npm surface planned
  (daemon + MCP, install-from-repo like crashtest era).
- Working language: English; every rule in this PRD survives only if it
  survives contact with the first demo surface.
