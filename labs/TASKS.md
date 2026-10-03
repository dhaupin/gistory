# TASKS — rolling work log

Living file. Update it **before and after every pass** so a fresh session (or a
crash) can see where we are.

Conventions
- `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked
- One line per item; put detail in `labs/MEM.md`, not here.
- Newest work at the top of **Now**. Move finished items down to **Done**.
- Keep **Done** short — collapse old entries into a date line once they ship.

---

## Now

- (nothing in flight)

## Next

- [ ] Drag handles for project-detail + sidebar thread rows (currently read-only to the rank)
- [ ] Reordering while a search filter is active renumbers only the visible subset — decide the right behaviour
- [ ] Optional: unpin-all / clear-pins bulk action, pinned-count badges
- [ ] Optional: drag-to-reorder inside a collapsed project group in the sidebar

## Blocked / risks

- [!] Browser tests need a *fresh* managed preview. Vite sometimes serves a
  stale module after a big rewrite — verify with
  `curl -s <origin>/src/<file> | grep <new string>` and
  `freebuff-preview restart` if it disagrees with disk.

## Done

- **2026-10 — second QC pass. The reported “collapse is broken” was a routing bug.**
  - `createThread` set `currentThreadId` but never called `navigate()`, unlike
    every sibling selection path. On a first run (empty library) you stayed on
    the board after creating a thread — so there was no message box, and
    therefore nothing to collapse. Every suite seeded data, so this path was
    never exercised; `flows.mjs` now opens with a genuinely empty library.
  - Added a security section 5 to `sync:smoke`: an undecryptable blob (anyone
    holding the chainId from the QR can push one) permanently pins the
    watermark and blocks every legitimate change behind it. Behaviour is now
    pinned by tests rather than discovered in the field.
  - The sync error text named only “wrong passphrase”, which is indistinguishable
    from a poisoned chain — it now names both.
  - Three existing UI checks needed a route fix after `createThread` began
    navigating (they assumed the board stayed put).
  - Tests: sync:smoke 100/100, UI 160/160, audit 0 findings over 112 passes.

- **2026-10 — QC sweep (pre-push). Three real bugs found and fixed.**
  - **Orphaned messages re-imported forever.** A thread deleted on device A
    left its messages in every *other* device's full-state payload. The
    tombstone blocked the thread but nothing pruned its message array, so each
    sync re-added them and the payload grew without bound. `mergePayload` now
    drops message keys whose thread is not in the merged thread list.
  - **Export dropped collapse state.** `viewFor` matched raw view keys against
    bare item ids, so a thread export lost every `message:<id>` collapse flag —
    the third instance of the namespaced-key mistake (after `pruneView` and
    `forgetView`). It now uses `viewKeyItem`.
  - **Double-click created duplicate threads/projects.** The create handlers
    read the same non-empty input on every click before React re-rendered, so a
    triple-click made three identical rows. Added `useSubmitLock` (a ref, not
    state, because state does not apply until the next render) and wired it into
    `HomeBoard`, `ProjectsBoard`, and `BurgerMenu`.
  - Also: `saveThreads`/`saveMessages`/`saveProjects` no longer throw out of a
    React effect when localStorage is full (they now match `saveView`); a blank
    rename keeps the form open instead of silently discarding the edit; Escape
    now dismisses all four create forms (it was a dead key there, and the
    sidebar thread form has no Cancel button, so Escape was its only way out).
  - Fixed 7 `sync:smoke` fixtures that described messages with no parent
    thread — an impossible state that the new pruning correctly rejected.
  - Tests: sync:smoke 94/94, UI 161/161, audit 0 findings over 112 passes.
    Each new check was mutation-verified (revert the fix → the check fails).

- **2026-10 — collapsed message preview reads as collapsed.**
  - The collapser was working (the `<pre>` was replaced), but `previewOf`
    truncated only at 140 characters, so any prompt that fit on one short line
    previewed as its own complete text — collapsing looked like a no-op.
  - Preview is now the first 9 words of the first non-empty line, ellipsised.
  - The reorder grip keeps a separate, longer accessible name (`labelOf`, 120
    chars): a screen reader has no surrounding context to fill in an ellipsis.
  - Two new checks assert the preview is visibly shorter than the body and is
    ellipsised. Verified by mutation: reverting `previewOf` makes the first one
    fail with exactly the reported symptom.
  - Tests: sync:smoke 87/87, UI 155/155, audit 0 findings over 112 passes.

- **2026-10 — arrangement follow-up: filtered reorder, grips everywhere, audit
  coverage of pinned/collapsed states.**
  - Filtered reorder: `moveWithinSubset` + `applyFullOrder`. `App.reorder`
    switches path when `allIds.length !== ids.length`; hidden rows keep their
    place relative to each other and every id (hidden included) gets a distinct
    rank. `SortableProvider` gained `allIds`.
  - Drag grips added to project-detail rows and every sidebar project group
    (plus the unassigned group), which previously honoured ranks but offered no
    way to arrange them from the UI.
  - Audit now walks 28 states (was 21), including seven `ARRANGED_SEED` routes
    that render pinned, collapsed, and manually ranked content.
  - **Two real bugs found while verifying the above:**
    1. `ARRANGED_SEED` seeded a bare `m2` while `ThreadView` reads
       `message:m2`, so the new audit states were silently measuring the
       *default* rendering. Fixed the key; added the lesson to `labs/MEM.md`.
    2. `pruneView` / `forgetView` compared whole view keys against the alive-id
       set, so every namespaced collapse key (`message:*`, `project:*`) was
       wiped by the next sync and left behind after a delete. Added
       `viewKeyItem` and routed both through it.
  - Also corrected `moveWithinSubset`: it anchored on the pre-move neighbour,
    landing one row early (`b,a,c,d` instead of the requested `b,c,a,d`).
  - Tests: sync:smoke 87/87, UI 153/153, audit 0 findings over 112 passes.

- **2026-10 — live-fire QC pass (`tests/ui/sortable.mjs`, 21 checks).**
  - Real Chrome input events (page.mouse) for drag, not synthetic clicks.
  - Found and fixed a harness bug: suites shared one browser, so localStorage
    leaked between them. `openPage` now creates a per-page browser context.
  - Covers threads, messages, and the projects grid drag; Escape cancel; grip
    disabled on a single row; order + collapse surviving reload.
- **2026-10 — draggable pins + synced arrangement state.**
  - New `src/sync/view-state.ts`: `ViewState` (rank + collapsed) shipped inside
    the sync payload, merged per key by LWW with the deviceId tie-break.
  - Fractional ranks: first drag ranks the group, later drags rewrite only the
    moved entry; renumber only when the gap drops below 1.
  - `src/ui/sortable.tsx`: pointer (mouse + touch) drag with Escape-to-cancel,
    plus ArrowUp/ArrowDown on a focused grip as the accessible path.
  - Wired into home threads, home projects, projects grid, and thread messages.
  - Collapse moved from device-local `gistory_collapsed` to synced view state;
    `src/ui/collapse.ts` deleted.
  - Fixed a latent conditional-hook bug in `ProjectDetail` (`useState` after the
    not-found early return).
  - Tests: sync:smoke 75/75, UI 145/145, audit 0 findings.
- 2026-10 — generalized pin + collapse for threads, messages, and projects.
- 2026-10 — pinning + collapsing for **threads**.
- 2026-10 — usability pass (shared sort options, BurgerMenu sort control,
  unified confirm copy, Header a11y, project-card keyboard access).
- 2026-10 — sync edge-case fixes (message `updatedAt`, import merge by id,
  tombstone safety) + `usability.mjs` UI suite.