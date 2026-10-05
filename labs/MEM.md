# MEM — crash guard / recovery bank

**This file is disposable.** It exists only so an interrupted pass can be picked
up quickly. Wipe and rewrite it every pass; nothing here is a source of truth.

Last updated: 2026-10-04 (product feature pass — COMPLETE, uncommitted;
`90b60a3` already pushed earlier, CI + Migrate D1 green)

---

## Where we are

Built the top tier of the product roadmap: **tags end-to-end** (editor +
board chips as filters + tag-aware search), **`{{variable}}` template fill-in
copy**, **fork/duplicate** (parentId + version), **usage counting** (bumps
usageCount but NOT updatedAt — deliberate, browser-verified), **"Most used"
sort**, and the **header sync chip** (relative last-synced, click → settings,
hidden until sync enabled). New `tests/ui/product.mjs` (31 checks) covers all
of it; `run.mjs` now forwards the whole checker to suites. Deferred items are
logged in TASKS.md Next (onboarding, Cmd+K, status views, trash, import
adapters, rating editor, export nudge).

**Harness gotchas learned (they will bite again):**
- `openPage` seeds localStorage via `evaluateOnNewDocument` — it re-seeds on
  EVERY navigation/reload. Persistence claims need a seedless sibling page in
  the same context, never `page.reload()`.
- Clipboard: naive `navigator.clipboard.writeText = fn` is a silent no-op;
  shadow with `Object.defineProperty`. Headless writeText can resolve while
  readText returns empty — assert on captured write args, not readText.
- `el.click()` from evaluate carries no user activation → clipboard API
  refuses. Use ElementHandle.click (real CDP input) for copy-path clicks.

All suites green this pass: typecheck ×3, smoke 274/274, lint 0 errors
(3 documented react-refresh warnings), ui:audit 0 findings, test:ui 201/201
(7 suites incl. product). Nothing is committed — Changes panel owns delivery.

If resuming: nothing in flight. Uncommitted files: the feature set (sort.ts,
App.tsx, ThreadView, HomeBoard, Header, Layout, index.css, product.mjs,
run.mjs) + the round-2 files (db-maintain.mjs, AGENTS.md, TASKS.md, MEM.md).
Push only on explicit ask.

Arrangement state (unchanged, for reference):

| Concern | Where it lives | Synced? |
|---|---|---|
| pinned / pinnedAt | the item model (`Thread`/`Message`/`Project`) | yes, via ordinary item LWW |
| rank (drag order) | `ViewState[key].rank` | yes, per-key LWW |
| collapsed | `ViewState[key].collapsed` | yes, per-key LWW |

No work is in flight. Source edits are uncommitted; the Changes panel owns
commit/push. `bun.lock` is untracked and must stay that way.

## The two invariants that keep this correct

1. **A pin toggle must bump `updatedAt`.** Item merge is whole-object LWW on
   `updatedAt ?? createdAt`, so bumping it makes the newest pin state win.
2. **A drag rewrites one key.** `applyOrder` gives the moved item a fractional
   rank between its new neighbours and touches nothing else, so two devices
   reordering different rows cannot overwrite each other. The first drag in a
   group renumbers it instead; renumber again only when the gap drops below 1.

Also: `onReorder(ids, from, to)` means "current order + move from→to". The
consumer applies the move **once**. (A version that pre-applied `moveItem` in
`nudge` applied the swap twice and silently did nothing — the UI test caught it.)

## File map

- `src/sync/view-state.ts` — types, `mergeView`, `rankBetween`, `needsRebalance`,
  `applyOrder`, `moveItem`, `pruneView`, `RANK_STEP`.
- `src/ui/view-state.tsx` — `ViewStateProvider`, `useViewState`, `useItemView`.
- `src/ui/sortable.tsx` — `SortableProvider` / `SortableRow` / `SortableHandle`.
- `src/ui/sort.ts` — `sortPinnedFirst` now applies rank → pin → active sort.
- `src/App.tsx` — view state + ref, `reorder`, `toggleCollapse`, `forgetView`,
  snapshot/applyMerged carry `view`; deletes prune view entries; `applyMerged`
  also calls `pruneView` so entries for items deleted on *another* device do not
  accumulate forever.
- `src/lib/store.ts` — export/import carry `view`; `viewFor()` filters it.
- `src/sync/merge.ts` — `SyncData.view` / `SyncPayload.view` + `mergeView`.
- Components: `HomeBoard`, `ProjectsBoard`, `ThreadView` (sortable);
  `BurgerMenu`, `ProjectDetail` (rank-aware order only, no handles).
- `src/ui/collapse.ts` was **deleted** — collapse is synced now, not local.

## Verify (run these; preserve exit status)

```bash
bun tsc -b --noEmit
bun run sync:smoke
node tests/ui/run.mjs <preview-origin>     # e.g. http://localhost:5176
node scripts/ui-audit.mjs <preview-origin>```
Expected: typecheck 0 (three passes) · sync:smoke 247/247 · UI 160/160 (15/36/8/24/29/58) · audit 0 · `npm audit` 0 vulnerabilities.

There are **six** UI suites; `sortable.mjs` is the live-fire drag/collapse one.

## Gotchas / live context

- tsconfig `include: ["src"]` only → `scripts/`, `tests/`, `functions/`, `labs/`
  are NOT typechecked by `tsc -b`.
- Preview is on **5176**; stale servers on 5173/5174 may also answer. Always pass
  the origin explicitly.
- Stale Vite module after a rewrite looks like "my code isn't there". Check
  `curl -s <origin>/src/components/X.tsx | grep -c <new string>`, then
  `freebuff-preview restart` if it disagrees with disk.
- The audit treats horizontally clipped text as a finding — the collapsed message
  preview must wrap, never ellipsize.
- Drag geometry: the drop index only advances once the dragged row's centre
  crosses a neighbour's midpoint, so a test must drop *past* a row's midpoint
  (its bottom edge), not on it.
- `.projects-grid` is `auto-fill, minmax(200px, 1fr)`, so at desktop widths its
  cards sit side by side and vertical dragging does nothing. Narrow the viewport
  before testing a drag there.
- **The stale-server grep check must count CODE occurrences, not all matches.**
  `grep -c ensureQos src/App.tsx` said 6 while the served module said 4 and the
  server was actually current — two of the six are inside comments, and Vite's
  transform drops them. Compare like with like (strip comments, or grep for a
  string that only exists in code).
- Sidebar groups are name-ordered, so the first one is often the empty project.
  Pick the first group that actually has rows before asserting on collapse.
- `tests/ui/usability.mjs`'s `store()` reads `gistory_threads` / `gistory_projects`
  / `gistory_messages` / `gistory_deleted`; ranks live in `gistory_view`.
- **Suite isolation:** every `openPage` gets its own `createBrowserContext()`.
  Sharing a context shares localStorage, which silently leaked drag/collapse
  state between suites. If you add a suite, do not assume a clean origin.
- **Namespaced view keys have now broken three call sites** — `pruneView`,
  `forgetView`, and `viewFor` (export). Any code that maps between a view key
  and an item id must go through `viewKeyItem`. When you add a fourth, grep for
  `keep.has(key)` / `alive.has(key)` / `in next` first.
- **A merge test fixture with messages but no parent thread is testing an
  impossible state.** Several `sync:smoke` fixtures did exactly that and only
  passed because nothing pruned orphans. If a check adds a pruning invariant,
  expect older fixtures to need a `threads: [...]` alongside their `messages`.
- **Assert the symptom, not the mechanism.** “Collapsing shows a preview” passed
  while the preview rendered the message's *complete* text — the UI was
  collapsing correctly, it just looked like nothing happened. The useful
  assertion is “the preview is visibly shorter than the body”, and to confirm it
  bites, run it once against the old code (mutation check): it must fail.
- **A throttle test that drives a rate-limited route will hit the throttle.**
  The 500-blob pagination test used to make 520 real `push` calls; once `push`
  gained a rate limit it started failing. It now seeds `blobs` straight into
  SQLite with the same `encryptPayload` the agent uses, because it is a *pull*
  paging test. Rate limits make old load-shaped tests lie about what they cover.
- **A reset-window upsert needs the CASE to compare against the existing row.**
  `count = count + 1` unconditionally never resets; comparing a bound parameter
  to itself always resets. The right form is
  `CASE WHEN window_start = ? THEN count + 1 ELSE 1 END`, where the unqualified
  `window_start` is the *stored* value during an upsert. Three mutation rounds
  were needed to pin this down — two early "mutations" were no-ops whose `sed`
  pattern never matched, which read as a passing check. **Confirm the mutation
  actually changed the file** (`grep -c`) before believing a green result.
- **A circuit breaker that re-arms its cooldown on every failure never
  recovers.** With a dead database and continuous traffic, `openedAt` keeps
  moving forward and no trial request is ever served. Failure while open must be
  a no-op.
- Store order != rendered order in the UI suites. Pinning/reordering earlier in
  a suite shifts the DOM, so resolve a row by `data-sortable-id`, not by index.
- **Seed an empty library somewhere.** Every suite using `SEED` hides first-run
  bugs — `createThread` not navigating was invisible for several passes because
  no test ever started from nothing. `flows.mjs` §0 now does.
- `pushPost` rejects unknown chains (409). A new test device must `handshake()`
  before `push()`, or the push is refused and the test fails for the wrong reason.
- **A fixture that seeds the wrong key tests nothing.** `ARRANGED_SEED` used a
  bare `m2` where `ThreadView` reads `message:m2`, so the audit reported 0
  findings on a state that was really just the default one. When seeding
  `gistory_view` by hand, grep the component for the `isCollapsed(...)` call
  and copy the key it builds. A quick live probe of the DOM beats reading the
  seed and hoping.

## Known limitations

- **Write auth is per-chain; legacy chains are only half-secured.** New chains
  get a random write secret at handshake and the server keeps only its SHA-256,
  so a chain id alone can no longer write — the poison-blob wedge is closed.
  Chains created before that keep a NULL `push_hash` and still accept writes
  without a secret, and `POST /sync/claim` to claim one is **first-come-wins**:
  the server has no secret for an unclaimed chain, so it cannot tell the owner
  from an old QR holder. Capped at denial of future writes (blobs stay
  ciphertext). See AGENTS.md §4. Rate limiting is still the edge's job.
- Do not “fix” the watermark by skipping undecryptable blobs: the retry is
  deliberate, and skipping would hide a wrong-passphrase case that self-heals.
- A rank is per item, not per board, so reordering on the home board also moves
  that thread in the sidebar and project detail. Intentional, but worth a rethink.
- Entries are replaced whole per key. Rank keys (`t…`/`p…`/`m…`) and collapse
  keys (`project:*`, `message:*`, `section:*`) are deliberately disjoint so a
  drag can never wipe a collapse flag.

## Live deployment state (checked 2026-10-04, after push 0259b21)

- Deployed **Functions and client bundle are current** — confirmed live, not assumed:
  WAF rejects a bad body with `400 Body must be a JSON object`; the circuit
  breaker answers `503` + `retry-after: 15`.
- **Live sync cannot run: the D1 database has no schema applied.** Every sync
  route 503s because D1 throws.

How the 503 was pinned down without database access — worth remembering, because
"storage is not configured" and "storage throws" produce similar-looking failures:

| Response | Means |
|----------|-------|
| `500 Sync storage is not configured` | `env.GISTRY_DB` is null — binding missing |
| `503 Sync storage is temporarily unavailable` | binding present, a D1 call **threw** |
| `400 Body must be a JSON object` | request rejected before storage — proves code is live |

Because `guardRoute` swallows a failing throttle read and returns "allow", a
missing `rate_limits` table alone would *not* 503. So the throw is in
`chainExists` → `SELECT id FROM chains`, i.e. even the 0001 base schema is
absent. The fix is to apply the migrations to the live database, which needs
`wrangler.deploy.toml` (gitignored, absent here) and Cloudflare auth — the owner
runs `bun run db:migrate:remote`.

Until that is applied, do not interpret live 503s as a guard bug. Check for a
`400` on a deliberately malformed body first: that separates "code not deployed"
from "database not migrated".

- **`grep -r` silently skips a file it decides is binary.** `tests/sync-smoke.ts`
  contains a literal NUL byte — I had written `hasControlChars('a<NUL>b')` into
  the source instead of the escape `a\x00b`. grep then reported "binary file
  matches" on stderr and returned *nothing* on stdout, so a dead-export audit
  wrongly concluded six exports were unused. Two lessons: `grep -ac` / `--binary-
  files=text` when auditing, and if a repo has multibyte content, verify a grep
  that "found nothing" by grepping for something you know is there. Fixed at byte
  level; the file is text again.
- **A test can pass for the wrong reason.** The chunked-body cap test sent
  truncated JSON, so the parser rejected it and the test passed even with the cap
  deleted — mutation testing is what exposed it. Pad an *unused* field with valid
  JSON so the assertion isolates the one thing under test.
- Bun's `Request` does **not** auto-set `Content-Length` for a string body (real
  HTTP clients do). Tests that exercise a length-based guard must set the header
  explicitly, or they silently test the fallback path.

- **An optional chain on a push path is a silent data-loss bug.** `syncNow` called
  `qosRef.current?.flush()` and the scheduler was built in the render body. When
  the scheduler did not exist yet, `?.` turned a lost push into a no-op with no
  error anywhere — and because the scheduler is *usually* created by the time it
  matters, this would have passed almost every manual test and failed only for a
  user enabling sync for the first time. Create on demand (`ensureQos()`); never
  let a push be optional.
- Coverage gaps are worth an honest marker. The push-wiring bug had **no** test
  that could have caught it (App.tsx is a React component; the browser suites run
  with no `/sync` backend). `sync:smoke` §8g asserts the invariant by reading
  App.tsx as text. That is not a real test and does not pretend to be — it is a
  standing reminder that fails loudly if the exact mistake returns.

## If we crash mid-pass, resume here

1. `git status` and read this file + `labs/TASKS.md`.
2. Confirm which files are already edited (`grep -rn "view\b" src | head`).
3. Finish the remaining `[ ]` items in `labs/TASKS.md`.
4. Run the four verify commands above.
5. Update `labs/TASKS.md` and rewrite this file.