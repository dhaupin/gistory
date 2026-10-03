# MEM — crash guard / recovery bank

**This file is disposable.** It exists only so an interrupted pass can be picked
up quickly. Wipe and rewrite it every pass; nothing here is a source of truth.

Last updated: 2026-10 (draggable pins + synced arrangement pass — COMPLETE, uncommitted)

---

## Where we are

Arrangement is now generic and **synced** for threads, messages, and projects:

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
Expected: tsc 0 · sync:smoke 100/100 · UI 160/160 (15/36/8/24/29/58) · audit 0.

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

- **The sync chain has no write auth.** Knowing the `chainId` (it is in the
  pairing QR) is enough to push blobs. One blob pushed with a different key
  permanently pins every client's watermark below it and blocks all later
  changes. Rate is uncapped too. Both need a protocol change (push secret, or
  per-blob MACs) — see AGENTS.md §6. Do not silently “fix” the watermark by
  skipping bad blobs: the retry is deliberate, and skipping would hide a
  wrong-passphrase case that self-heals.
- A rank is per item, not per board, so reordering on the home board also moves
  that thread in the sidebar and project detail. Intentional, but worth a rethink.
- Entries are replaced whole per key. Rank keys (`t…`/`p…`/`m…`) and collapse
  keys (`project:*`, `message:*`, `section:*`) are deliberately disjoint so a
  drag can never wipe a collapse flag.

## If we crash mid-pass, resume here

1. `git status` and read this file + `labs/TASKS.md`.
2. Confirm which files are already edited (`grep -rn "view\b" src | head`).
3. Finish the remaining `[ ]` items in `labs/TASKS.md`.
4. Run the four verify commands above.
5. Update `labs/TASKS.md` and rewrite this file.