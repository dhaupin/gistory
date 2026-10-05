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

- (product feature pass COMPLETE, uncommitted — see top of Done)

## Next

- [ ] First-run onboarding flow (device name → passphrase → pairing QR)
- [ ] Cmd+K command palette (search + jump + actions)
- [ ] Draft/archived status views (PromptMetadata.status is synced but has no UI)
- [ ] Recently-deleted view over the synced tombstone registry
- [ ] Import adapters for ChatGPT/Claude export formats (importData is ready)
- [ ] Rating editor (metadata.rating displays already; needs input UI)
- [ ] Export-backup nudge after N pushes (blobs retained at newest 5/chain)
- [ ] Drag handles for project-detail + sidebar thread rows (currently read-only to the rank)
- [ ] Optional: unpin-all / clear-pins bulk action, pinned-count badges
- [ ] Optional: drag-to-reorder inside a collapsed project group in the sidebar

## Blocked / risks

- [!] Browser tests need a *fresh* managed preview. Vite sometimes serves a
  stale module after a big rewrite — verify with
  `curl -s <origin>/src/<file> | grep <new string>` and
  `freebuff-preview restart` if it disagrees with disk.

## Done

- **2026-10-04 — product feature pass (all verified, uncommitted).**
  - **Tags end-to-end**: inline editor in ThreadView (add via chip input,
    remove per chip) → `App.setThreadTags` (trimmed, case-insensitively
    deduped, bumps updatedAt — tags are content); chips on home-board rows
    are clickable filters; the header search now matches tags too.
  - **`{{variable}}` templates**: copying a message containing placeholders
    opens a fill-in dialog (one input per unique placeholder, deduped
    case-insensitively); empty fields leave the placeholder as written;
    plain messages copy directly as before. Helpers `templateVars`/
    `fillTemplate` in ThreadView.
  - **Usage counting**: every copy bumps `metadata.usageCount` WITHOUT
    `updatedAt` (a copy is not an edit — verified in the browser); "N uses"
    stamp in ThreadView; new "Most used" sort option (`usage` SortField in
    sort.ts, ties fall through to name).
  - **Fork/duplicate**: ActionMenu on thread view + home board; full copy
    (thread + messages, fresh ids, pins/collapse dropped) with
    `metadata.parentId` + `version+1`; opens the fork (same as createThread).
  - **Sync chip in the header**: status icon + relative last-synced label
    ("3m ago", 30s tick), click → settings; renders nothing until sync is
    enabled. Full detail still in Settings (devices, chain, errors).
  - **New suite `tests/ui/product.mjs` (31 checks)** covering all of the
    above through real clicks; `run.mjs` now forwards the whole checker
    (eq/atLeast were built but never passed to suites). Harness lessons:
    `openPage` re-seeds localStorage on EVERY navigation (evaluateOnNew-
    Document), so reload persistence must be tested with a seedless sibling
    page in the same context; clipboard assertions capture the app's
    `writeText` args via a defineProperty shadow (naive assignment is a
    silent no-op, and headless writeText can resolve while readText returns
    empty); text-matched clicks use ElementHandle.click for user activation.
  - All target sizes ≥32px (audit's floor) — `.tag*` and `.sync-chip` follow
    the `.btn-project` min-height pattern. ui:audit 0 findings; typecheck ×3,
    smoke 274/274, lint 0 errors, test:ui 201/201 across 7 suites.

- **2026-10-04 — round 2 sweep (pushed first: `90b60a3`, CI + Migrate D1 green,
  remote ledger 3/3 "Already up to date.").**
  - Real destructive edge found: `db-maintain.mjs` took `--keep`/`--days` from
    CLI + a workflow_dispatch input and interpolated them raw — `Number(-1) ||
    default` is truthy, so `--keep -1` produced `rn > -1` and would have
    deleted EVERY blob of EVERY chain (the only server-side copy). Fixed:
    knobs clamped inside `maintenanceSql` (≥1, fractions floored, 0/NaN →
    defaults) — the single point `--status`, apply and `--check` all share.
    4 new `--check` assertions (15 total) run the hostile statements for
    real; mutation-verified (clamp removed → 4 ✗).
  - TASKS hygiene: the "reordering under a search filter" Next item was STALE —
    `App.reorder` already detects `allIds.length !== ids.length` and switches
    to `moveWithinSubset` + `applyFullOrder` (AGENTS.md Gotcha 6). Removed.
  - No src/functions changes this round.

- **2026-10-04 — maintenance pass + repo sweep (all verified, pushed in
  `90b60a3`).**
  - `pruneLimits` is wired: every 256th admitted request sweeps `rate_limits`
    (sampled from `guardRoute`, refused requests never sweep, failures
    swallowed). Was defined+tested but called by NO route — same defect shape
    as hasControlChars was. Mutation-verified.
  - `scripts/db-maintain.mjs`: counts → prune → retention → live-test cleanup
    → stale devices, with `--status` (per-rule would-delete report from the
    SAME WHERE fragments) and `--check` (12 assertions on in-memory SQLite).
    The self-check caught two real bugs before prod: bare `WHERE seq IN (...)`
    would delete one chain's victims from EVERY chain (fixed with
    `(chain_id, seq)` row values), and blobless chains survived
    `MAX(created_at) < x` forever (NULL trap — COALESCE). Also verified
    end-to-end through real `wrangler d1 execute --local`: seed → report →
    apply → idempotent re-run.
  - `.github/workflows/maintenance.yml`: weekly cron (Mon 03:17 UTC) runs the
    full verify suite then applies; manual dispatch defaults to dry run;
    prints row counts every run = free observability. Never deletes real
    chains. `db:maintain:check` also wired into ci.yml + migrate.yml's verify
    gate pattern.
  - **Real bug from the sweep: restored devices lost their write secret.**
    App.tsx read `gistory_write_secret` and never passed it — `ensureAgent(key,
    chain)` — so after any reload the device passed handshake but got 401 on
    every push, with UI falsely demanding re-pairing. Fixed + pinned by §9
    textual checks, mutation-verified.
  - QoS terminal failures: 401/403/413/404/409 no longer retry forever
    (`isTerminalPushFailure`); 429/503/408/network still always retry. 5 new
    checks, mutation-verified.
  - `handshake` now reports the chain's REAL write-auth state (`writeAuth:
    secured`) instead of the backwards `!isNew` nothing read.
  - Dead code removed: `getDb`+`SyncEnv` (sync.ts), `PULL_LIMIT` now actually
    sent as `&limit=` (agent.ts), unused imports (`Header` in App,
    `MoreHorizontal` in ThreadView, `useState` in hooks.ts), dead
    `PASSED_KEY`/`NAME_KEY` (live-sync), dead `applied` (db-migrate), unused
    `onSelect` prop wire (ProjectsBoard — App passed a handler the component
    never called), `qrious` dependency uninstalled (only `qrcode.react` used).
  - ESLint finally wired: `eslint.config.js` + `bun run lint` + CI step.
    Found the restore bug above. 0 errors / 3 intentional warnings.
  - Tests: typecheck 0 (three passes) · sync:smoke 274/274 · db:migrate:check ·
    db:maintain:check · lint 0 errors · UI suites passed · audit 0 ·
    npm audit 0 · sync:live 22/22.
- **2026-10-04 (earlier) — QC baseline on `746317d`:** typecheck 0 ×3,
  smoke 247/247, live 22/22, npm audit 0, UI 160/160, audit 0.
- **2026-10 — per-chain write auth (separate secret, passphrase stays server-blind).**
  - Each chain now has a random 32-byte write secret, minted by the creating
    device and carried to others in the pairing token (`GS1-<chain>.<secret>`).
    The server stores only SHA-256, so it never holds anything derived from the
    passphrase — the blind-relay property survives.
  - `handshake` installs the hash **only when it creates the chain**; reading
    `chainIsNew` before `ensureChain` is what stops anyone who knows a chainId
    from claiming an existing chain by handingshaking.
  - `push` requires the secret (401 missing / 403 wrong), compared in constant
    time. This closes the poison-blob wedge: a blob pushed under a different key
    can no longer reach storage at all.
  - `POST /sync/claim` secures a chain created before write auth. First-come-
    wins by necessity — documented, bounded at denial of writes.
  - `sync:smoke` now builds its schema from `migrations/` rather than
    `schema.sql`, so it exercises what actually ships. Doing this surfaced that
    the old flattened schema had already drifted from the migrated shape.
  - Tests: sync:smoke 128/128, UI 160/160, audit 0 over 112 passes. The write
    gate is mutation-verified (disabling it makes three checks fail).

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
- **2026-10 — guards: throttle, circuit breaker, WAF, client QoS.**
  - `migrations/0003_guards.sql` adds `rate_limits (key, window_start, count)`;
    `schema.sql` re-synced to match the full migration history.
  - `functions/_shared/guards.ts`: pure fixed-window limit maths, atomic single-
    statement upsert counter, in-memory per-isolate circuit breaker (5 failures
    → 15s open), conservative WAF, and `withBreaker` so any storage throw feeds
    the breaker.
  - Six throttle buckets: `push`/device 120m, `push-chain` 600m, `pull`/device
    240m, `handshake`/device 20m, `claim`/chain 5m, `write-fail`/chain 20m.
    All answer `429` + `Retry-After`; an open breaker answers `503` + `Retry-After`.
  - Refused requests do not advance their counter; a wrong write secret is
    charged to `write-fail`, not to the device's `push` budget.
  - A stored `window_start` in the future is treated as absent (PoP clock skew).
  - `src/sync/qos.ts`: `backoffDelay` (doubling + jitter, server `Retry-After`
    wins but is capped) and `SyncQos`, which debounces, coalesces changes that
    land mid-push into one follow-up, and retries failures without ever dropping
    a change. Held in a ref in `App.tsx`, replacing the bare `setTimeout` effect;
    `syncNow` now pushes through `flush()` so two pushes cannot overlap.
  - `agent.ts` throws `SyncError` (status, `retryAfterMs`, `.throttled`) instead
    of plain prose; `retryAfterFrom` reads both delta-seconds and date forms.
    `errors.ts` renders a 429 as “saved locally, uploading in ~Ns”.
  - Fixed: the 500-blob pagination test was making 520 real pushes and now hits
    the push limit — it seeds blobs directly instead, since it is a pull test.
  - Mutation-verified 13 guard behaviours (throttle window/reset/over-charge,
    breaker budget/cooldown/WAF rules, QoS retry + coalescing + Retry-After).
  - Tests: sync:smoke 233/233, UI 160/160, audit 112 passes / 0 findings.
- **2026-10 — repo cleanup + server typecheck coverage.**
  - `tsconfig.functions.json` (strict) now typechecks `functions/`; `bun run
    typecheck` runs it alongside `tsc -b`. Root `include` deliberately stays
    `src`-only — under `strict: false` the guard discriminated unions cannot be
    narrowed, so folding the server in would force `as` casts everywhere.
  - Found and removed by that stricter pass: `SyncEnv` was an unused import in
    all four routes after `withBreaker` took over the context type.
  - Deleted dead files, each confirmed zero-import before removal (all still in
    git history): `workers_backup/sync.ts` (KV/R2-era worker, superseded by the
    D1 rewrite and importing a dep the project does not have),
    `src/App.old.tsx`, `src/lib/index.ts` (barrel, no consumers),
    `src/ui/{AutoSaver,Loading,Tooltip,EmptyState}.tsx` (only re-exported, never
    imported; `ui/EmptyState` was also a divergent twin of the live
    `components/EmptyState`).
  - Pruned `src/ui/index.ts` from ~30 re-exports to the two `Badge`/`Button`
    that `Settings.tsx` actually imports.
  - Verified the new strict pass really catches route type errors by injecting
    one and confirming it failed, then restoring byte-exact.
  - Tests: typecheck clean (both passes), sync:smoke 233/233, UI 160/160,
    audit 112 passes / 0 findings.
- Closed a guard gap found while reviewing coverage: `/sync/status` returns the
    chain's device ids and names, so it is now throttled on the `pull` budget
    and requires a valid `deviceId` (the agent sends it). Mutation-verified by
    removing the guard and watching both new checks fail.
  - Tests: typecheck clean (both passes), sync:smoke 235/235, UI 160/160,
    audit 112 passes / 0 findings.
- **2026-10 — security + cleanup pass (two real defects found).**
  - `npm audit` was at 7 vulnerabilities (6 high: vite, postcss, nanoid).
    `npm audit fix` brought it to 0 with no major-version bumps, and the built
    bundle is byte-identical afterwards.
  - **Defect: `readJson` had no size bound.** It called `request.json()` on the
    whole body, so `MAX_PAYLOAD_BYTES` bounded only the `data` field *after* the
    body had already been buffered and parsed — it did nothing about the memory
    cost of a large request. Now capped twice: `withBreaker` rejects on the
    declared `Content-Length` before the handler runs (in `withBreaker` rather
    than per-route, so a new route cannot forget it), and `readJson` checks the
    real length for chunked requests.
  - **Defect: the control-character WAF was documented but never ran.**
    `hasControlChars` was defined, exported, and covered by a test — but no route
    ever called it, so the control was documentation rather than behaviour. It is
    now enforced in `inspectBody` for every field.
  - **Defect: a literal NUL byte in `tests/sync-smoke.ts`**, from writing
    `hasControlChars('a<NUL>b')` instead of the escape sequence. It made the file
    "binary" to grep, which silently corrupted a dead-export audit (six exports
    wrongly reported unused). Fixed at byte level.
  - Mutation-verified all three new controls. The chunked-body test initially
    passed for the wrong reason (malformed JSON was rejected by the parser, so
    deleting the cap did not fail it); it now sends valid JSON padded into
    `deviceName` so it isolates the cap.
  - Tests: typecheck 0 (three passes), sync:smoke 243/243, UI 160/160,
    audit 112 passes / 0 findings, npm audit 0.
- **2026-10 — third pass: fixed a silent first-push drop.**
  - `App.tsx` built `SyncQos` in the render body and pushed via
    `qosRef.current?.flush()`. `handleEnableSync` sets `syncEnabled` and calls
    `syncNow()` in the same task, so whether the scheduler existed by then was a
    race on React's re-render. Losing it meant the **first push after enabling
    sync never happened** — the push that uploads the user's existing library to a
    brand new chain. Optional chaining turned a lost push into a silent no-op.
  - `SyncQos` is now created on demand by `ensureQos()`; no push sits behind `?.`.
    Also removes an allocation from render, which StrictMode double-invokes.
  - `sync:smoke` §8g asserts the invariant by reading App.tsx as text. This is
    explicitly *not* a substitute for a real test — App.tsx has no unit test and
    the browser suites run with no `/sync` backend — but it fails loudly if the
    exact mistake returns. Both halves mutation-checked.
  - Checked the other five `Ref.current?.` call sites in App.tsx; all are
    legitimately optional (teardown, best-effort claim, display).
  - Tests: typecheck 0 (three passes), sync:smoke 247/247, UI 160/160,
    audit 112 passes / 0 findings, npm audit 0, build 0.
- 2026-10 — generalized pin + collapse for threads, messages, and projects.
- 2026-10 — pinning + collapsing for **threads**.
- 2026-10 — usability pass (shared sort options, BurgerMenu sort control,
  unified confirm copy, Header a11y, project-card keyboard access).
- 2026-10 — sync edge-case fixes (message `updatedAt`, import merge by id,
  tombstone safety) + `usability.mjs` UI suite.