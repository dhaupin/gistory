# MEM — crash guard / recovery bank

**This file is disposable.** It exists only so an interrupted pass can be picked
up quickly. Wipe and rewrite it every pass; nothing here is a source of truth.

Last updated: 2026-10-05 (workflow pass — COMPLETE and verified, uncommitted)

---

## Where we are

The whole remaining product roadmap landed in one pass, verified but
**uncommitted** (Changes panel owns delivery; push only on explicit ask):

1. **Onboarding tour** — `src/components/Onboarding.tsx`, wired in App
   (`showOnboarding`, `gistory_onboarded` flag, `finishOnboarding`). Shows only
   when the board is empty AND the flag is unset; every exit path marks seen;
   browsers with existing threads bake the flag in a mount effect.
2. **Cmd/Ctrl+K palette** — `src/components/CommandPalette.tsx`; App owns a
   window keydown toggle and passes threads/projects + nav callbacks. Archived
   threads are hidden; drafts hinted; create rows come from the query.
3. **Draft/archived** — `ThreadStatus` (models.ts); `App.patchThreadMetadata`
   bumps `updatedAt` (content rule); `setThreadStatus`/`setThreadRating` on top
   of it. Home board Archived section (collapse key `section:home-archived`);
   archived threads leave home/sidebar/project-detail/palette.
4. **Trash page** — `src/components/TrashPage.tsx` at `#/trash` (router.ts
   matches `trash` BEFORE the thread-id fallback). Reads the synced tombstone
   registry; a record, not a restore. Sidebar footer link via `onTrash`.
5. **Import adapters** — `src/lib/import-adapters.ts` (`convertImport` sniffs
   gistory/chatgpt/claude); Settings → Snapshot names the format in its status.
6. **Rating editor** — 1–5 star buttons in ThreadView; click current = clear.
7. **Backup nudge** — `getLastExport/setLastExport` (store.ts); Snapshot tab
   stamp + dismissible nudge (never or >14 days).

## Verified this pass (all exit 0, after final edits)

- `bun run typecheck` — 0 across all three passes (src / functions / tests)
- `bun run sync:smoke` — 274/274
- `bun run lint` — 0 errors, 3 known react-refresh warnings (view-state.tsx)
- `bun run ui:audit` — 0 findings over 19 states × 2 themes × 2 viewports
  (new states: onboarding, trash, palette, palette-search; new `press` step)
- `bun run test:ui` — 264/264: export-import 15 · flows 36 · import-adapters 14
  · product 31 · sidebar 8 · snapshot-metrics 32 · sortable 29 · usability 58
  · workflow 41

Suite-expectation updates made this pass (UI changed, suites followed — the
components are correct, do not "fix" them back):
- `snapshot-metrics`: Snapshot tab has 4 buttons now (backup-nudge dismiss is
  icon-only `btn-icon`; exempt from `.btn` base, not from size/radius/name).
- `export-import`: status line is "Imported N thread(s), M project(s) — label".

## Harness gotchas (they will bite again)

- **Grepping the dev server for a marker**: Vite serves esbuild-transformed
  JS — single quotes become double quotes and comments are stripped. Grep a
  bare code token (`grep -cF onboarded`), never `'literal'` or comments. A 0
  that you *know* should match means your marker was wrong, not the server.
- **`clickSelector` dispatches synthetic `el.click()`** — it works "through"
  modal overlays (no hit-testing). A real user CANNOT click under
  `.modal-overlay` (z-index 200 over header 101); flows' first-run journey
  passes under the onboarding tour only because of this. Anything needing real
  user activation (clipboard) must use ElementHandle.click, per the gotcha below.
- `openPage` re-seeds localStorage on EVERY navigation (evaluateOnNewDocument).
  Persistence claims need a seedless sibling page (`page.browserContext().newPage()`).
- Clipboard: naive `navigator.clipboard.writeText = fn` is a silent no-op —
  shadow with `Object.defineProperty`; assert captured write args, not readText.
- Text-matched clicks that must carry user activation use ElementHandle.click.
- The audit's clipped detector skips `text-overflow: ellipsis` (counted as
  `ellipsisSkips`, printed as a Note) — ellipsis is the app's deliberate
  single-line truncation pattern. Clipping WITHOUT ellipsis still reports.

## Verify (run these; preserve exit status)

```bash
bun run typecheck     # 3 passes
bun run sync:smoke    # 274/274
bun run lint          # 0 errors / 3 known warnings
bun run ui:audit      # 0 findings
bun run test:ui       # 264/264 across 9 suites
```

Preview notes: ports 5173–5176 all answer 200 AND serve current code (verified
via marker greps). Test harness picks the newest. If an edit does not appear,
check the served file before trusting any result.

## UI consistency pass (2026-10-05)

- `.dropdown-divider` sat in CSS unused for ages — the divider convention was
  documentation, not behaviour, until ActionMenu started rendering it. Same
  defect shape as hasControlChars and pruneLimits: defined, styled, never
  wired. When you "confirm" a convention by finding its CSS, also grep for
  who *uses* it.
- `.input-name` (all rename fields) was silently outside the shared input
  system: different radius, no focus ring, no inherited font. Selector
  grouping (`input, .input, textarea { … }`) only protects classes you
  remember to add to the group.
- Dead-CSS variants (.input-sm/.input-lg) are documented as dead, not deleted
  — zero references today, harmless, and deleting them is churn without a win.
- Divider check pattern: Puppeteer DOM probe asserting `dividers === 1` and
  last item is Delete. Cheap; no suite asserts it, so the probe is the guard.
- Vestigial dev servers on ports 5173–5175 predate the managed Freebuff
  preview (5176 = newest, what the harness targets). Platform rules forbid
  killing processes from the terminal; they serve current code, so leave them.

## Arrangement wrap-up (2026-10-05)

- "Drag handles for project-detail + sidebar rows" was a STALE queue item —
  `SortableHandle` grips already existed in both surfaces. Before building a
  queued item, grep for it first; the TASKS list has now twice held items that
  were already done.
- `App.unpinAll()` clears thread AND project pins together: the control's count
  is an aggregate, so a per-kind action would make the label lie. The edge-flows
  suite caught that exact draft bug (pinned project survived the click). Each
  unpinned item gets a shared timestamp, matching the individual toggle, so the
  LWW merge clears pins on every device.
- The unpin-all control appears only at ≥2 aggregate pins; below that the
  per-row menu Unpin is the shorter path.
- Mobile header: the full label hides ≤640px and `.home-board .header-left`
  wraps (`min-width: 0` + row-gap). First cut overflowed 390px — ui:audit
  caught it (56 findings); second cut still overflowed by 30px (24); third cut
  is 0. Trust the audit's overflow combos, not eyeballing one viewport.
- `tests/ui/edge-flows.mjs` (24 checks) is permanent — archive-while-viewing,
  palette create-from-query, tour×palette stacking regression, trash Back,
  bulk-unpin + badges. test:ui = 10 suites / 288 checks.

## QC addendum (2026-10-05, post-verification probe)

`tests/ui/_qc-probe.mjs` (throwaway, `_`-prefixed so run.mjs ignores it) probed
four flows the suites miss. **Found and fixed one real defect:** Ctrl+K during
the first-run tour opened the palette OVER it (both overlays share z-index 200,
palette later in DOM) and let the user navigate away with the tour stranded —
same stacking if the last thread was deleted while the palette was open. Fix in
App.tsx: `tourOpenRef` mirror suppresses the Cmd/Ctrl+K toggle and the palette
is not rendered while the tour owns the screen. Probe scenario C now asserts
the fixed behavior; probe re-run 19/19, typecheck/lint/workflow-41 re-run green.
The other three probe scenarios (archive-current-thread + restore, palette
create-from-query, trash Back) passed unchanged.

## If we crash mid-pass, resume here

1. `git status` + read this file and `labs/TASKS.md`.
2. The workflow pass is COMPLETE and verified but uncommitted. Untracked new
   files: `src/components/{Onboarding,CommandPalette,TrashPage}.tsx`,
   `src/lib/import-adapters.ts`, `tests/ui/{workflow,import-adapters}.mjs`,
   plus `bun.lock` (must STAY untracked — CI uses package-lock.json via npm ci).
   Modified: App.tsx, BurgerMenu, HomeBoard, Settings, ThreadView, index.css,
   models.ts, router.ts, store.ts, ui-audit.mjs, audit-page.mjs,
   snapshot-metrics.mjs, export-import.mjs, TASKS.md, MEM.md.
3. Nothing is in flight. Next roadmap items (TASKS.md Next): drag handles for
   project-detail + sidebar rows; optional unpin-all/badges; drag inside
   collapsed sidebar groups.
4. Push only on explicit ask.

## Standing invariants (do not regress)

1. **A pin toggle must bump `updatedAt`** — whole-object LWW merge.
2. **A drag rewrites one view key** — fractional ranks; renumber only when the
   gap drops below 1. `onReorder(ids, from, to)` is applied exactly once by the
   consumer; `SortableProvider` must not pre-apply it.
3. **Metadata edits (tags/status/rating) bump `updatedAt`**; usage counting
   (`bumpThreadUsage`) deliberately does NOT — a copy is not an edit.
4. **Anything reading/pruning view keys uses `viewKeyItem`**, never whole-key
   string matches (three past bugs: pruneView, forgetView, viewFor).
5. **The push path never sits behind an optional chain** — `ensureQos()`.
