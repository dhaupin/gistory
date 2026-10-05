# MEM — crash guard / recovery bank

**This file is disposable.** It exists only so an interrupted pass can be picked
up quickly. Wipe and rewrite it every pass; nothing here is a source of truth.

Last updated: 2026-10-05 (prestruct SEO pass verified; push in flight — see
the prestruct section below. Previous push `772d385`.)

---

## Where we are

**QC pass on `fcc6fa9` COMPLETE: 2 real production bugs found + fixed**, both
by the new `scripts/dist-probe.mjs` (`bun run probe:dist`). Full detail in
TASKS.md Done. Uncommitted — Changes panel owns delivery. Everything re-verified
green after the fixes.

## Prestruct gotchas (2026-10-05) — the ones that cost real time

- **The prerender cache must be fingerprinted by its build.** Route HTML
  embeds Vite's hashed asset names, so a cache keyed by route alone restores
  pages whose script tags 404 after any new `vite build` — a page that passes
  every text check and renders nothing. Fixed with a shell sha256 in the
  cache key + a build-failing asset tripwire in prerender.js. The probe
  re-verifies the shipped bytes independently.
- **Never hydrate across the hash boundary.** A hash URL is served a path
  page the hash never touched; hydrating app-over-lander-HTML is a guaranteed
  React #418 in production on every bookmarked link. `main.tsx` now boots by
  `hash.startsWith('#')`: hash → render fresh (clear stale DOM), path page
  with data-server-rendered → hydrate. The audit/test:ui suites run against
  the DEV server (no server-rendered pages), which is why nothing caught it.
- **Serving dist/ in-process in a probe script catches what text greps
  cannot** (missing chunks, hydration errors) and needs no orphan processes —
  the static server lives inside the node script and dies with it. Keep
  `bun run probe:dist` in the loop after any build-pipeline change.
- "Run bun.lock from the repo" reminder: still untracked on purpose (CI npm ci).
- Migrate D1 can sit 10+ min in GitHub's runner queue; the run itself is ~1min.
  Check `gh run view <id> --json status,jobs` before assuming failure.

- **Alias placement is a silent-failure trap.** react-router-dom v7's SSR
  named-export problem needs the rr-shim alias — but ONLY inside
  prerender.js's inline `createServer({ resolve: { alias } })`. In
  vite.config.ts it applies to the browser too: the shim re-imports
  react-router-dom → re-enters the alias → circular → **app renders nothing
  with zero console errors**. The audit's "blank page" detector is the only
  thing that catches this class; keep it in the loop after any prerender
  change.
- **Vite config changes need a server restart, not just a file save.**
  Servers started before the edit keep serving NEW file contents under the OLD
  config (dep rewrites still pointed at `/prerender/rr-shim.mjs`). Marker
  greps on served files pass while the app is still broken — verify config
  changes with a fresh `freebuff-preview restart`, not a grep.
- **`npm run build` can pass while prerendering nothing**: `.prestruct/cache`
  answered 3/3 "(cached)" while the alias was broken. Run
  `node scripts/prerender.js --force` to prove the real render path.
- **Old stale optimize-dep cache**: the oldest stale server answered
  `504 Outdated Optimize Dep` for react-router-dom — a leftover
  `node_modules/.vite/deps` epoch. Fresh servers re-optimize on start.
- **The lander CTA needs the hashchange listener to actually setState** —
  `href="#/"` flips the hash but re-renders nothing by itself. The fixed
  `useIsHashRoute` syncs from `window.location.hash` on every hashchange.
- **SSR guards key off `typeof localStorage === 'undefined'`**, not window —
  the smoke test's fake localStorage has no `window`.
- **`hydratRoot` vs 404**: prerendered pages carry `data-server-rendered` on
  `#root` (hydrate); `404.html` uses `root-404` and strips the bundle (no JS
  at all — its only remaining `<script>` is inert JSON-LD).
- ESLint: `prerender/*.mjs` needed adding to the node+browser globals block
  (the shim references `process` in its Node branch).

## Verified this pass (all exit 0, after final edits)

- `bun run typecheck` — 0 across all three passes (src / functions / tests)
- `bun run lint` — 0 errors, 3 known react-refresh warnings (view-state.tsx)
- `npm run build` — 3/3 pages fresh-rendered (`--force`), dist content verified
- `bun run test:ui` — 302/302 across 10 suites (on the fresh 5177 preview)
- `bun run ui:audit` — 0 findings
- `bun run sync:smoke` — 279/279
- Headless probes: hash→app, no-hash→lander, lander-CTA→app live switch

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
bun run sync:smoke    # 279/279
bun run lint          # 0 errors / 3 known warnings
bun run ui:audit      # 0 findings
bun run test:ui       # 302/302 across 10 suites (PREVIEW_URL=…5177)
npm run build         # full prestruct pipeline; prerender tripwire gates it
bun run probe:dist    # production-shape probe — REQUIRES the build above
npm audit             # 0 vulnerabilities
```

Preview notes: ports 5173–5176 are STALE (started before the vite.config.ts
revert; they hold the old alias and render nothing — cannot be killed, ignore
them). The managed preview lives on **5177** after the 2026-10-05 restart and
is the only trustworthy target. After any vite.config change, restart the
preview and pass PREVIEW_URL=http://localhost:5177 to the harness if needed.

## Button conventions (2026-10-05)

- **Icon buttons carry aria-label AND title** — tests match on aria-label,
  users hover on title, audit's noName check reads aria. A button without
  words has no excuse to be missing either.
- **Icon-only via aria-label clicks in tests**: after un-wording Copy/Edit,
  the text-match clicks silently broke the day the labels changed — match
  `[aria-label="…"]` for icon buttons from the start.
- **Composer vs row buttons**: same variant (ghost), same order, Eraser (not
  Trash2) for clear-draft so the destructive glyph is never ambiguous.
  Delete-in-a-row without a confirm dialog = bug; clear-draft is the only
  confirm-free destructive (auto-saved, retype to undo).
- Cancel = btn-secondary, Save = btn-primary, destructive confirm =
  btn-danger — across forms, dialogs, menus. Grep `Cancel</button>` after
  adding a form.

## Absolute stamps + synced settings (2026-10-05)

- **Synced singletons live in `SyncSettings`** (merge.ts), merge by the same
  LWW clock as items (`mergeSettings`). The pattern extends to any future
  synced preference: tiny object, `updatedAt` bumped on change, absent-remote
  keeps local.
- **Text-collision class of bug**: making the logo clickable gave it the text
  "Gistory", which is ALSO project p1's name in SEED — flows.mjs's
  text-match click hit the logo and navigated home. `clickButtonByText` now
  scopes to an open `.action-menu-dropdown` first. Whenever a new element
  takes item-like text into the header, re-check every text-match test.
- `formatStampTime` uses Intl with try/catch: an invalid zone from an imported
  payload falls back to `toLocaleString` instead of throwing (Intl throws on
  unknown zones).
- The zone list is curated (22 zones + device default), NOT `Intl.supported
  ValuesOf('timeZone')` — a select keeps values valid by construction.

## Live-fire sync (2026-10-05)

- `pull()` returns `{blobs, failures, serverSeq}` — merge EACH blob
  individually (`mergePayload(merged, blob, deviceId)`), never the whole pull
  result; each blob carries its sender for the deviceId tie-break.
- `handshake` that CREATES a chain installs the write secret, so a later
  `claim()` returns FALSE (already secured). In a probe, `!await a.claim()`
  is the correct assertion; claiming true would mean creation is broken.
- `bun run sync:multidev` = 4-device convergence live probe (creator + 3
  joiners, distinct pushes, union convergence, device-list check). Throwaway
  `live-test-` chains are append-only and safe to leave behind.
- Full live suites: sync:live (2 devices, 22 checks) + sync:multidev (4
  devices, 10 checks). Run them BEFORE any real user wires up their instances.

## Visible timestamps (2026-10-05)

- `src/ui/relative-time.ts` is the shared time helper (pure, non-React so
  react-refresh never complains). `createdEditedStamp` treats updatedAt
  within 1s of createdAt as "not really edited" — same-second saves stay
  "created", which reads better on fresh threads.
- Header.tsx keeps its own formatAgo (the sync chip re-renders on a 30s tick;
  board stamps render per navigation, which is honest enough). If a user
  ever complains stamps go stale on a long-lived page, promote the tick.
- test:ui timing: full suite + smoke in ONE terminal command exceeds the
  180s cap — run them as separate commands (audit+typecheck+lint fit
  together; test:ui is the long pole at ~3min alone).

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
2. The **prestruct SEO pass is COMPLETE and verified but uncommitted**. New
   files: `src/AppLayout.tsx`, `src/components/{Lander,TermsPage,PrivacyPage}.tsx`,
   `src/hooks/`, `src/ui/prestruct-islands.js`, `prerender/`,
   `scripts/{prerender,inject-brand}.js`, `ssr.config.js`, `public/{robots.txt,_redirects}`.
   Modified: `vite.config.ts` (reverted to original), `src/main.tsx`, `src/App.tsx`,
   `src/lib/store.ts`, `src/sync/view-state.ts`, `src/components/Footer.tsx`,
   `index.html`, `package.json` (+react-router-dom 7.18.4, full build pipeline),
   `package-lock.json`, `.gitignore` (+.prestruct/), `eslint.config.js`,
   `.github/workflows/ci.yml`, `public/_headers`, `src/index.css`.
3. Nothing else in flight. Next: push (user asked), watch CI + Migrate D1,
   then the Pages deploy carries the lander/legal pages live.
4. Pushed: `772d385` on main, CI + Migrate D1 green. `bun.lock` still
   untracked (correct).

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
