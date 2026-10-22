# TASKS — rolling work log

Living file. Update it **before and after every pass** so a fresh session (or a
crash) can see where we are.

Conventions
- `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked
- One line per item; keep detail in the item itself, not here.
- Newest work at the top of **Now**. Move finished items down to **Done**.
- Keep **Done** short — collapse old entries into a date line once they ship.

---

## Now

- **QC pass (2026-10-22): bugs found and fixed in the UX batch above.**
  - **Variable saves never pushed**: the debounced-push scheduler’s effect
    omitted `variables` from its deps, so a saved/deleted variable only
    synced when some unrelated change pushed. Fixed; pinned textually in
    smoke §8g (same reasoning as the original optional-chain pin — nothing
    else observes a React deps array).
  - **The SW wake dropped variables**: `loadSnapshot`/`saveSnapshot` in
    `sw.ts` didn’t carry the field, so a wake merged variables and then
    discarded them from both IndexedDB and the pushed convergence snapshot
    (until the owning device happened to push again). Loader reads
    `gistory_vars`; saver writes only when the merge produced the field (an
    unconditional `{}` would erase a real pool on a pre-variables payload).
    Both pinned textually.
  - **Variables manager add form deadlock**: the submit lock was seeded for
    the menu’s transient create-forms; this form stays open by design, so
    the lock made every add after the first silently do nothing. Removed —
    a double click is an upsert with the same key, which is its own no-op.
  - **Bulk “Select all” under a search filter** now selects exactly the
    visible ids (`filtered`), so bulk delete/pin can never touch rows the
    user could not see.
  - **Dead thread variable pools swept**: deleting a thread (locally in
    `deleteThread`, remotely via `applyMerged`) tombstones every per-thread
    pool by `tombstoneDeadScopes` — the variables counterpart of view-state
    pruning — instead of leaving an unmanageable “Deleted thread” pool in
    every later payload. Tombstones stay strictly newer than any edit in
    the pool, so it cannot resurrect; behavioral ×5 + junk-key guard in
    smoke §2f.
  - **`normalizeVariables` rejects keys without a scope prefix** (a
    hand-edited backup’s junk key would group under an empty label and
    never be exportable). Shipped after verifying: typecheck 0, smoke 358/358,
    lint 0 errors, build + probe PASS, `test:ui` 41/41, ui:audit 0 findings
    (thread + settings slices re-run).

- **UX pass (2026-10-22): device tags, last IP, multi-select, chain-wide
  warnings, saved variables, gear icon.**
  - **Gear icon** in the burger header — the hand-drawn sun glyph was a
    settings button in disguise; now lucide `Settings`.
  - **Chain-wide destructive warnings**: `ConfirmDialog` reads a tiny
    `ChainProvider` context (`src/ui/chain-context.tsx`), so every destructive
    delete of synced data adds the note "this applies to all devices in your
    sync chain" — only while in a chain. `Turn off sync` and `Clear draft` are
    device-local and opt out; the variables delete dialog opts in with its
    own copy.
  - **Device tag chips**: `deviceTag(id)` (djb2 → 6 base36 chars, pure, in
    `agent.ts`) renders next to every device name in Settings → Devices, so
    two "Android" rows are tellable apart. Hover shows the full id.
  - **Last IP per device** (migration `0005_device_ip.sql` + flattened into
    `schema.sql`): `CF-Connecting-IP` captured at handshake and push,
    sanitized to IP-shaped chars, stored on `devices.last_ip`. A headerless
    call must not erase a recorded address, and a non-IP-shaped header is
    ignored (`clientIp` in `_shared/sync.ts`). `listDevices`/`/sync/status`
    now return `lastIp`; the Devices cell shows "Last address". Smoke pins
    stamp / no-erase / junk-header behavior.
  - **Saved variables** for `{{name}}` prompts (`src/lib/variables.ts`):
    global pool + per-thread pools, keyed `scope:lowername` with the display
    name inside the entry; deletion is a tombstone INSIDE the entry (absent
    keys carry no freshness), merged per key by LWW + deviceId tie-break when
    an exact tie. Rides `SyncData.variables` (optional, old payloads merge);
    stored `gistory_vars` (added to IDB's key list); included in full and
    per-thread / per-project exports and `importData`. Fill-in form prefills
    from thread pool then global. Manager modal
    (`VariablesManager.tsx`) opens from the burger footer and every thread's
    action menu; opened from a thread it pre-targets that pool's scope.
  - **Message multi-select** in ThreadView: a list-checks toggle (also in the
    thread action menu) swaps each row's drag grip for a checkbox and shows a
    sticky bulk bar — Select all / Pin / Unpin / Delete / Done. Bulk delete =
    one tombstone call (`deleteMessages`); bulk pin sets `updatedAt` +
    `pinnedAt` per message (`setMessagesPinned`), preserving merge invariants.
  - Tests: smoke 349/349 (variables merge ×7, last-IP ×4), typecheck 0 (3
    passes), lint 0 errors, migrate:check fresh-build 6 migrations,
    `build` + `probe:dist` PASS, `test:ui` 41/41, `ui:audit` 0 findings on
    thread/settings/burger/home/projects/trash slices.

- **Step-6 pass (2026-10-22): badge + observability + storage hygiene.**
  - **Opt-in “N new messages” notice** (PRD §2.1's future opt-in, shipped):
    after a closed-tab wake the SW counts genuinely-new message ids on the
    snapshot diff and shows one notification (`tag: 'gistory'` keeps them
    replacing, not stacking) only when the device opted in — a checkbox
    inside Settings' Background sync row (only when wake is on AND
    `Notification.permission === 'granted'`), stored in the shared layer as
    `gistory_notify_wake` so the worker reads it. `notificationclick`
    focuses/opens the app. The count NEVER rides the wake (relay stays
    blind); computed in `newMessageCount` — edits/pins don't count.
  - **Wake observability**: `pruned`/`failed`/budget-`skip` always console.log
    with the push service HOSTNAME only (endpoint paths carry subscription
    tokens); full round summary behind `DEBUG_WAKE=1` env on the Pages
    project. Visible via `npx wrangler pages deployment tail`.
  - **Draft sweep**: `sweepDrafts(threads)` deletes `gistory_draft_*` rows of
    threads that no longer exist — wired on boot, on local thread delete, and
    after every sync merge. New minor API `stKeyList(prefix)` in idb.ts
    (enumerates mem + localStorage; drafts are localStorage-resident by
    design). Fake storage in smoke now offers length/key(i) to match real
    enumeration semantics — it previously matched zero keys.
  - Tests: smoke 338/338 (console-capture asserts the pruned line appears and
    leaks no token; badge pins textual; sweep behavioral ×3), typecheck 0, UI
    suites all green, build + probe:dist PASS.
- **Receipt CONFIRMED (2026-10-22) — background sync works end to end on
  real devices.** Cause of the initial silence: `agent.init()` read the
  device name via bare `localStorage` — a ReferenceError inside the SW
  (no such global), swallowed by the wake contract; fixed in bf256db with a
  textual pin. Then a nitpick pass over the wake path: SW redirects a wake
  to any open app page (clients.matchAll + #/ hash check + in-flight gate)
  instead of racing the page's writer for the idb stores; wake fetches are
  30s-bounded; `vapidFromEnv` refuses a non-RFC-8292 subject (failing
  config reads as enabled:false, not as a wet fuse); `idb.ts` now reuses one
  connection instead of open+write+close per write (draft autosaves
  included). Smoke 329/329, UI suites all green incl. storage-migration,
  build + probe:dist pass.
- **VAPID env live + subscribe route probe (2026-10-22).** User set the three
  VAPID_* vars in Pages; relay now answers `{"enabled":true}` with the
  generated public key — background sync is switched on server-side after
  the deploy. New `bun run sync:subscribe` (`scripts/live-subscribe.mjs`, 13
  checks live): GET wiring state, malformed-key 400, unknown-chain 409,
  valid-store 200, upsert-by-endpoint move, DELETE idempotence + ownership +
  shape guard — all green against prod. Probe creates only `live-test-`
  debris and never pushes (nothing is woken). REMAINING: per-phone receipt
  (Settings → Sync → Background sync → On on each Android; a message written
  on one phone must appear on the other with no tab open).
- **Background sync rollout COMPLETE (2026-10-22, steps 1–5; step 5 pushed
  this pass):** maintenance sweep for `push_subscriptions` (db-maintain rule
  5, `--subs-days` default 30, fixture-covered incl. hostile-knob clamps) +
  the two things that make that sweep SAFE: successful wakes now stamp
  `last_seen` (`sendFanOut`, one IN-bounded UPDATE), and every app open
  re-posts the device's stored wake target (`src/sync/bg-sync.ts
  revalidateWakeTarget` — idempotent upsert reusing the browser's own
  subscription, no prompt; fires fire-and-forget from App's restore effect).
  A swept-but-alive phone self-heals on next open. Docs: README background-
  sync section + function tree, AGENTS.md pattern + Quick Ref rows,
  prd-sync status marked shipped (incl. the deviation: failure-counting
  never built — positive liveness instead). Tests: smoke 322/322,
  db:maintain:check 19/19, typecheck 0, lint 0. **Awaiting user receipt**
  (VAPID env + Settings toggle on Android phones) — see prior pass e40fc29.
- **Crashtest launched (2026-10-08):** new project at dhaupin/crashtest —
  adversarial QA for agent-built software (in-process redteam/fuzz/barrage,
  hardening report + risk ledger). Full PRD + AGENTS + DEPLOY + README + MIT
  scaffolded at ~/crashtest, committed f8b4b7e (identity freebuff-web).
  PUSH BLOCKED: Freebuff credential is gistory-scoped (403) — user to add
  crashtest to app scope, then `git push` from ~/crashtest. rookworks home
  staged at ~/rookworks-staging (brain + org + rook stone, 2 commits) —
  same access ask for weisync/rookworks (not yet resolvable). Gistory repo
  keeps only the gistory-brain horcrux; rook brain stays gitignored local
  + stones travel via rookworks.
- Previous: branding + brain setup pass (uncommitted): package renamed
  prompt-keeper → `gistory` (lockfile refreshed); brains `rook` +
  `gistory`; `horcrux/gistory-p_gistory-castles-2026.svg` (Brains: 1);
  org rookworks/engineering/gistory-core; vant issues #119/#120/#121 filed.
  Push on go-ahead.
- Previous: barrage pass (6 campaigns, zero 500/503) + red-team pass (17
  scenarios, no-store fix) — PUSHED as `68d3996` for hardening; suites still
  uncommitted.
- Vant first-user feedback filed: #119 (org-grant boot hydration), #120
  (dept/team name = parent id), #121 (health lib/bin false negatives) —
  issues only, no PR (axolotl pushing).
- Nothing else in flight.

## Next

- [ ] Optional: drag-to-reorder inside a collapsed project group — re-evaluated
  2026-10-05: low value (a collapsed group hides its rows by definition; the
  keyboard path on the expanded group already covers reordering). Only build
  if a real user asks. Note: "drag handles for project-detail + sidebar rows"
  was STALE and removed — those grips already shipped.

## Blocked / risks

- [!] Browser tests need a *fresh* managed preview. Vite sometimes serves a
  stale module after a big rewrite — verify with
  `curl -s <origin>/src/<file> | grep <new string>` and
  `freebuff-preview restart` if it disagrees with disk.

## Done

- **2026-10-05 — navigation + 404 pass (verified, uncommitted).**
  - **Logo → lander home** (`App.tsx`): the logo's click is now a real path
    navigation `window.location.assign('/')` instead of `navigate('/')`. A
    client-side path change cannot work here: the app's hash branch only
    re-evaluates on hashchange, and pushState does not fire it — the board
    would stay mounted at `/` with a stale URL. Full load → no hash → lander
    hydrates. Logo title/aria updated ("Gistory home").
  - **Menu Dashboard link** (`BurgerMenu.tsx`): new `onHome` prop renders a
    "Dashboard" footer link (Home icon) above "Recently deleted", navigating
    `#/` in-app — the way back to the board now that the logo leaves. Footer
    links wrapped in one `.sidebar-footer` (the per-link `margin-top: auto`
    would fight when stacked; CSS added).
  - **404 themed via prestruct config + app CSS:** `generate404` now emits
    class-based markup (`.notfound-*`) instead of hardcoded inline styles —
    the stylesheet link already survives the JS strip, so the page matches
    the app; `@media (prefers-color-scheme: dark)` covers visitors who never
    loaded the app (no body.dark possible without JS). ssr.config notFound
    copy updated; CTA → `/` (lander home, consistent with the logo). dist
    probe asserts the CTA markup survives.
  - **Robots/sitemap single-system confirmed:** airtight find + tracked-file
    grep found exactly ONE robots (`public/robots.txt`) and ONE sitemap
    (prerender-generated `dist/sitemap.xml`). No legacy duplicates existed to
    retire; index.html's `<meta name="robots">` is complementary, not a
    second system.
  - Upstream: **prestruct#19** filed (404 hardcoded inline styles / no theme
    hook); #18 (cache fingerprint) filed earlier today.
  - Verified: typecheck ×3 · lint 0 · build 3/3 + tripwire · probe:dist PASS
    (incl. new 404-CTA check) · test:ui 302/302 (edge-flows H rewritten for
    the new logo behavior) · ui:audit 0 · smoke 279/279.

- **2026-10-05 — QC pass on the prestruct integration (verified, uncommitted).
  Two real production bugs found by a new dist-probe; both fixed + guarded.**
  - **Stale prerender cache shipped a broken page.** Cached route HTML embeds
    the hashed asset filenames of the build it was rendered in, but the cache
    was keyed by route only — after any new `vite build`, the restore wrote a
    page whose `<script>` tags pointed at chunks that no longer exist. The
    page looked right in every text check and rendered NOTHING in a browser
    (CI/Pages build in fresh clones, so only local builds were exposed —
    the pushed site was never broken). Fix in `scripts/prerender.js`: the
    shell is fingerprinted (sha256, 16 hex) into each cache entry and stale
    entries re-render; plus an asset-integrity tripwire (every `assets/*`
    reference in a written page must exist in dist/) that FAILS the build —
    deliberately not the graceful-SPA degrade, because this failure mode is
    not a working site. `--force` also no longer clobbers-then-renders.
  - **React #418 on bookmarked app URLs.** `/#/t1` is served the prerendered
    lander (the hash never reaches the server), but `main.tsx` saw
    `data-server-rendered` and hydrated the app against lander HTML — a
    guaranteed hydration mismatch on every direct app link, in production.
    Fix in `src/main.tsx`: a URL carrying a hash at boot renders fresh
    (clearing the stale server DOM first so the lander doesn't flash); only
    genuine path pages hydrate. `AppLayout`'s hash-branch is unchanged.
  - Also: real `public/favicon.svg` replaces the 404ing `/vite.svg`.
  - New permanent probe `scripts/dist-probe.mjs` (`bun run probe:dist`):
    serves dist/ in-process like Pages would, then asserts the production
    shape — per-route pages + 404 semantics + robots/sitemap, lander
    hydration, the CTA live-switch, a direct `/#/t1` mount with NO #418, and
    zero missing `/assets/*` references. Exits non-zero to gate a change.
    Requires a build first. This probe caught BOTH bugs above.
  - Verified after fixes: typecheck ×3 · lint 0 · build 3/3 + tripwire ·
    probe:dist PASS · test:ui 302/302 · ui:audit 0 · smoke 279/279 ·
    npm audit 0. Migrate D1 went green (11m20s, was queue-bound).

- **2026-10-05 — prestruct SEO integration (verified, uncommitted → pushed this
  pass).** Lander + legal pages prerendered for crawlers; app stays hash-routed.
  - **Routing split**: `#/...` URLs render the app (bookmarks keep working);
    path URLs `/`, `/terms`, `/privacy` render prerendered pages; unmatched
    paths get `dist/404.html` (static, noindex, React bundle stripped).
    `src/AppLayout.tsx` is the router-less seam — `useIsHashRoute` decides the
    branch, and its `hashchange` listener makes the lander's "Open the app"
    CTA (`href="#/"`) switch live without a reload.
  - **The alias trap (cost a full debug round)**: Vite's SSR runner cannot take
    named exports from react-router-dom v7's CJS Node entry, so prerender
    aliases it to `prerender/rr-shim.mjs` (createRequire interop). That alias
    MUST live in prerender.js's inline `createServer` config — putting it in
    `vite.config.ts` applies it to the browser too, where the shim's own
    `await import('react-router-dom')` re-enters the alias, goes circular, and
    the app renders **nothing, silently, with zero console errors**.
  - **Stale-config gotcha**: dev servers started BEFORE a vite.config.ts edit
    keep the old alias loaded even though they serve the NEW file contents —
    "grep the served file" lies for config changes. Symptom: empty render + a
    504 "Outdated Optimize Dep" on the oldest stale server. Fix: managed
    preview restart (fresh port 5177 re-optimized deps and everything passed).
  - **Prerender cache hides breakage**: `npm run build` reported 3/3 pages but
    served all three from `.prestruct/cache` — the broken alias hid behind it.
    `node scripts/prerender.js --force` exercises the real render path.
  - **SSR guards key off `typeof localStorage === 'undefined'`**, not window —
    the smoke test's fake localStorage has no window (two smoke failures
    taught this).
  - Prerendered pages hydrate via `data-server-rendered` on `#root`
    (`main.tsx` picks `hydrateRoot`); `BrowserRouter` wraps AppLayout there —
    it touches `document` and would crash Node if it rendered during
    prerender. `index.html` is the prestruct shell; `inject-brand.js` fills
    title/desc/OG/JSON-LD at build from `ssr.config.js` (siteUrl
    gistory.creadev.org; WebApplication + FAQPage JSON-LD).
  - `public/_redirects` has **no SPA fallback** (Cloudflare Pretty URLs would
    loop); `robots.txt` + `sitemap.xml` ship; `_headers` carries COOP/COEP +
    asset caching. react-router-dom pinned to 7.18.4 (6.x had 2 moderate
    CVEs; v7 exports StaticRouter from the main package).
  - ci.yml build is now the full pipeline + a "Prerendered pages exist"
    verification step. eslint globals extended to `prerender/*.mjs` (the shim
    tripped no-undef on `process`).
  - Verified: typecheck ×3 · lint 0 errors · build 3/3 fresh-rendered ·
    dist content-verified (titles/canonical/JSON-LD/data-server-rendered,
    404 noindex + no JS) · test:ui 302/302 · ui:audit 0 · smoke 279/279 ·
    lander-CTA-to-app switch probed live in headless Chrome.
  - **One convention everywhere**: message-row + composer icon buttons are
    ghost, icon-only (words only on Save/Cancel), and ordered Pin · Copy ·
    Edit · Delete — Delete always last, danger, confirmed. The composer's
    destructive is now an **Eraser** "Clear draft" (it was a Trash2 that read
    as delete); Copy/Edit/Pin lost their words but gained aria-labels.
  - **Cross-app Cancel unification**: every Cancel is now btn-secondary (the
    two HomeBoard new-form Cancels were ghost — the only stragglers). Save is
    primary ×5; ConfirmDialog keeps danger/primary by `destructive`.
  - **Delete-confirm sweep re-run**: every delete still routes through
    ConfirmDialog; composer Clear stays confirm-free (auto-saved draft, not
    content) — documented as deliberate.
  - Tests moved from text to aria-label clicks where buttons lost their
    words (product.mjs Copy ×3, flows.mjs Edit). Verified: typecheck ×3 ·
    smoke 279/279 · lint 0 · audit 0 · test:ui 302/302.

- **2026-10-05 — absolute stamps + synced time zone + header tweaks (verified,
  uncommitted).**
  - **Absolute date/time stamps**: `created/edited YYYY-MM-DD HH:MM` via
    `formatStampTime` (Intl, `en-CA` ISO shape, h23) — back-traceable to agent
    convos, unlike relative times. Seconds + zone in the hover `title`.
  - **Synced time zone setting**: `SyncSettings { timeZone?, updatedAt? }`
    rides the payload as a singleton (`mergeSettings`: item-style LWW +
    deviceId tie-break, ties prefer the side with a value, absent-remote keeps
    local). Settings → General select ("Device time zone" + curated 22-zone
    list — a select keeps imported values valid, Intl fallback for garbage).
    Persists via `gistory_settings`, exports/imports merge by LWW. App threads
    it to HomeBoard/ThreadView stamps + Settings.
  - **Header**: Projects button is now icon-only (folder glyph, aria-label
    keeps the name); the "Gistory" logo is a real button back to `#/`.
  - Harness: `clickButtonByText` now prefers open `.action-menu-dropdown`s —
    the logo's "Gistory" text collided with the p1 menu item in flows.mjs.
  - Tests: edge-flows F reworked to UTC-pinned absolute expectations + new G
    (zone select → stored → board renders 23:23 in Berlin) + H (icon button,
    logo navigation) — 37 checks; smoke section 2d (5 settings merge checks,
    279 total); test:ui 302/302. Verified: typecheck ×3 · lint 0 · audit 0 ·
    smoke 279/279.

- **2026-10-05 — live-fire sync + multi-device probe (verified, pushed with
  the timestamp pass).** `sync:live` 22/22 against the deployed relay. New
  `scripts/live-multidevice.mjs` (`bun run sync:multidev`, 10 checks): FOUR
  simulated devices — creator + 3 token-joiners — push distinct libraries and
  all converge on the union; asserts handshake-create installs the write
  secret (claim() must be a no-op) and the chain reports all 4 devices.
  Protocol notes: pull() returns {blobs, failures} and each blob merges
  individually (carrying its sender for the tie-break); handshake-create
  installing the secret makes claim() false — asserting claim()===true was
  wrong, not the app. This is the exact shape of the user's 8-instance plan.

- **2026-10-05 — visible timestamps (verified, uncommitted).**
  - New `src/ui/relative-time.ts`: `formatAgo` (future times clamp to "just
    now" — device clock skew) + `createdEditedStamp` ("edited 3m ago"; falls
    back to "created …" when never edited or predating updatedAt; the >1s
    guard keeps same-second saves reading as created). Header.tsx still has
    its own `formatAgo` for the chip (ticked re-render); the pure helper is
    the shared home for everything else.
  - Stamps on: home board rows, thread header, every message head. Exact
    times always in the `title` ("Created … · Edited …"). 12px dim text —
    audit-clean.
  - edge-flows scenario F (7 checks): edited vs created variants on one
    board, exact-time title, live rename flipping created → edited just
    now, per-message stamps, header title carrying both times. test:ui =
    295 checks / 10 suites.
  - Verified: typecheck ×3 · lint 0 errors · ui:audit 0 · test:ui 295/295 ·
    smoke 274/274.

- **2026-10-05 — UI consistency pass (verified, uncommitted).** Systematic
  audit of fonts/buttons/inputs, action + menu ordering, and destructive-action
  coverage:
  - **Destructive coverage is complete**: every delete (thread/message/project
    across board, sidebar, project detail, thread view) routes through
    ConfirmDialog with a danger-styled confirm; sync disable has its own;
    join-chain/create-chain/import are additive, not destructive; "Clear
    draft" only wipes the composer draft (auto-saved as you type) so it stays
    confirm-free — but gained a missing aria-label.
  - **Menu conventions now enforced centrally**: destructive items always sit
    last, and ActionMenu renders a `dropdown-divider` (role=separator) above
    them — the CSS class existed but was never used. Verified in the DOM:
    9 items, 1 divider, Delete last.
  - **Inputs unified**: `.input-name` (all 10 rename fields) had a different
    radius (4 vs 6), no font/focus rules — it now matches `.input` exactly and
    shares the focus ring.
  - **Buttons unified**: the header Projects button's bespoke `.btn-project`
    skin (a fix for a raw-button bug) now sits on standard `btn btn-secondary`
    classes; the alias rule only keeps the icon+label alignment.
  - The last inline `style={{}}` in the tree (BurgerMenu stacked form) became
    `.form-inline-stacked`. One font-family (system stack); lucide sizes
    12–20px per role; `.input-sm`/`.input-lg` are dead CSS (left alone —
    harmless variants).
  - Verified: typecheck ×3 · lint 0 errors · ui:audit 0 findings · test:ui
    288/288 · divider DOM probe.

- **2026-10-05 — arrangement wrap-up pass (verified, uncommitted).**
  - **Queue hygiene:** "drag handles for project-detail + sidebar rows" was
    STALE — `SortableHandle` grips already exist in both surfaces (verified by
    grep: BurgerMenu ×2, ProjectDetail ×2, plus HomeBoard/ThreadView). Removed.
  - **Bulk unpin + pinned badges**: `App.unpinAll()` clears every thread AND
    project pin in one click (each item bumped with a shared timestamp exactly
    like its individual toggle, so the same LWW merge clears pins everywhere;
    per-item pinning keeps working afterwards). HomeBoard header shows an
    "Unpin all" ghost control when ≥2 pins exist, with an aggregate count —
    which is why the action MUST clear both kinds (a per-kind action would
    make the label lie; the edge-flows suite caught exactly that draft bug).
    Pinned-count badges (📌 N) ride the sidebar group labels and the home
    Projects header. Mobile: the full label hides ≤640px (icon + count carry
    it; words live in the aria-label/title) and `.header-left` wraps — the
    first cut overflowed 390px and ui:audit caught it (56 findings → 0).
  - **`tests/ui/_qc-probe.mjs` → `tests/ui/edge-flows.mjs`** (permanent, 24
    checks): archive-while-viewing + restore, palette create-from-query,
    tour×palette overlay stacking regression, trash Back, bulk-unpin + badges
    (scenario E). test:ui now 10 suites / 288 checks.
  - Verified after final edits: typecheck ×3 · smoke 274/274 · lint 0 errors ·
    ui:audit 0 findings · test:ui 288/288.

- **2026-10-05 — workflow pass (verified, uncommitted).** The seven queued
  roadmap features in one coherent pass:
  - **First-run onboarding tour** (`Onboarding.tsx`): welcome → first prompt →
    sync & pair. Shows once per browser (`gistory_onboarded`) and only over an
    empty board; the sync step carries the passphrase-loss warning and
    deep-links into Settings → Sync, so sync stays configured in exactly one
    place. Browsers that already have threads bake the flag on first load,
    and the render is also gated on `threads.length === 0` so pre-tour
    installs never see a flash of the modal.
  - **Cmd/Ctrl+K palette** (`CommandPalette.tsx`): one input, one flat list —
    threads (name + tags; archived hidden, drafts hinted), projects, create
    rows from the query, nav rows (projects / settings / trash). Arrow keys
    move, Enter runs, Escape closes; every open resets and refocuses.
  - **Draft/archived statuses**: `ThreadStatus` in models.ts;
    `App.patchThreadMetadata` (metadata is content → bumps `updatedAt`; usage
    counting deliberately bypasses it); mark draft/active/archive/restore in
    the ThreadView menu; an Archived section on the home board (synced
    collapse key `section:home-archived`) with Restore/Delete; draft chips on
    board + thread view; archived threads leave home, sidebar, project
    detail, and the palette until restored.
  - **Recently-deleted log** (`TrashPage.tsx`): reads the synced tombstone
    registry; deliberately a *record*, not a restore — no device keeps the
    deleted content, and entries cannot be safely cleared while an old blob
    might still carry the item. 90-day filter. Route `/trash` is matched
    before the generic thread-id fallback in router.ts; sidebar footer link.
  - **ChatGPT/Claude import adapters** (`lib/import-adapters.ts`):
    `convertImport` sniffs Gistory/ChatGPT/Claude shapes; the Snapshot tab's
    status line names the format; the suite drives the real upload control
    with fixture files from disk.
  - **Rating editor**: clickable 1–5 stars in ThreadView (clicking the
    current star clears it); the read-only ★ stamp remains for consumers
    without the handler.
  - **Backup nudge**: `getLastExport/setLastExport` in store.ts; the Snapshot
    tab shows a "Last full backup" stamp and a dismissible nudge when never
    or >14 days stale (sync keeps only the newest 5 blobs per chain).
  - Harness: new suites `workflow.mjs` (41 checks) + `import-adapters.mjs`
    (14); `snapshot-metrics` now expects 4 buttons — the nudge dismiss is an
    icon-only `btn-icon`, exempt from the `.btn` base-class rule but not from
    size/radius/name; `export-import` matches the new status format
    ("N thread(s) … — label"). `ui-audit` gained onboarding / trash / palette
    / palette-search states and a `press` step type (Ctrl+K), and bakes
    `gistory_onboarded` into EMPTY_SEED (the tour would otherwise sit over
    the three empty states). The clipped-text detector now skips deliberate
    `text-overflow: ellipsis` (counted as ellipsisSkips) — it flagged the
    palette's ellipsized long names; clipping WITHOUT ellipsis still reports.

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
- 2026-10-22 — sync outage diagnosis on the 8-device chain: live probes proved the
  relay healthy and one device reading the chain with a foreign key; error text
  now attributes undecryptable blobs per sender (§6e smoke). Same day: rollout
  step 1 of labs/prd-sync.md — sync state moved to IndexedDB (`src/sync/idb.ts`)
  with a localStorage shadow + one-copy migration and a boot gate
  (`App` → `AppRoot`); agent identity/watermarks ride the same layer. Tests:
  typecheck 0, sync:smoke 289/289, UI 11 suites incl. new `storage-migration`
  (11/11 in headless Chromium). localStorage keys deliberately NOT cleared yet
  (rollback shadow; cleared when push wiring lands).
- 2026-10 — generalized pin + collapse for threads, messages, and projects.
- 2026-10 — pinning + collapsing for **threads**.
- 2026-10 — usability pass (shared sort options, BurgerMenu sort control,
  unified confirm copy, Header a11y, project-card keyboard access).
- 2026-10 — sync edge-case fixes (message `updatedAt`, import merge by id,
  tombstone safety) + `usability.mjs` UI suite.
- **Compression pass (2026-10-22): the sync payload deflates before it
  encrypts.**
  - `encryptPayload` now DEFLATEs the JSON (`CompressionStream` /
    `deflate-raw`, streamed) **before** AES-GCM whenever the compressed body
    is strictly smaller — incompressible snapshots pay nothing, a
    stream-less platform writes raw — so a prompt-heavy library stretches
    the relay's 5 MB payload cap ~10× further out. Measured on a fixture:
    36 KB of JSON → ~650 base64 chars. No protocol change: `data` stays
    opaque ciphertext at the relay.
  - Format versioned with ONE tag byte: `[0x01]` raw, `[0x02]` deflate-raw,
    tag-less = the very first pushed payloads (legacy, decrypted forever).
    Decrypt-side: WebCrypto returns an ArrayBuffer, whose first `read`
    without wrapping is `undefined` — the tag check wraps in a `Uint8Array`
    or every blob "looks legacy" and the tag byte rides into `JSON.parse`
    (that bug was caught by the roundtrip in the smoke's own fixture, not
    by review).
  - Smoke §1b: round-trip small + large, the compression actually wins on a
    repetitive fixture, legacy tag-less payloads still decrypt, and a
    legacy first byte can never collide with either tag. 363/363. The SW
    wake path inherits all of it for free (same agent module).

- **Crashtest pass (2026-10-22): the red-team surface moved into scenario
  packs + the CI ledger gate.**
  - **`tests/redteam.ts` is retired** — its 13 scenarios (A takeover/race,
    B existence oracle, C identity games, D storage economics, E WAF/parser
    probes, F watermark pin, G guard-header hygiene) now live as
    `packs/public/sync-relay-shapes/`, a target-independent crashtest pack
    speaking the generic chain-relay dialect: route names, body factories
    (real agent-crypted push bodies), and materialized-state oracles all
    inject from `moduleCtx['sync-relay-shapes']`, and the pack throws loudly
    on un-armed keys. Six bounded attacks carry the relay's documented
    accepted risks (owner + bound in the config) — a bound gone stale turns
    into an EXPLOITED finding, i.e. the doc can no longer drift from the code.
    `sync:barrage` stays (it is volumetrics, not verdicts); the `sync:redteam`
    script is gone.
  - **Run root**: `crashtest.config.js` registers the four relay routes and
    arms the pack. `crashtest/fixture.mjs` brings a `node:sqlite` D1 fixture
    (real SQL: INSERT…SELECT RETURNING, ON CONFLICT, CASE — beyond the
    crashtest FakeD1 v0.1 subset) seeded from migrations/, one instance per
    run so attacks see each other's materialized rows. Handlers bundle via
    `scripts/build-crashtest.mjs` (the CLI loads plain Node, not TS).
  - **CI**: `.github/workflows/crashtest.yml` builds the bundle, then runs
    `dhaupin/crashtest@v1.0.0` (config `crashtest.config.js`, node-version 24
    for unflagged `node:sqlite`); exit 1 = new EXPLOITED or a refusal
    regression, exit 2 = broken run root. `labs/crashledger.json` committed
    as the adopted baseline (37 REFUSED / 6 BOUNDED / 0 EXPLOITED at cut,
    seed 12648430).
  - **First-run findings fixed in the pack itself** (worth the paper trail):
    attack secrets were uuid-derived 32-char strings, failing the relay's
    43-char base64url shape — every create 400'd and downstream verdicts
    mislabeled as refusals, so attacks now mint wire-shaped secrets AND
    assert preconditions (a failed setup throws, never reads REFUSED); the
    poison-blob attack must push with the OWNER's secret but wrong-for-the-
    chain key material (its first version minted a fresh secret and mis-
    proved the wrong premise); the WAF probe's `.replace('}}')` needle never
    matched a single-brace JSON, so it fired a valid body and misread the
    200 — proto surgery is now brace-correct.
  - **npm**: package.json gains the publish surface (name/description/
    license/files/exports/engines/prepublishOnly) and `scripts/build-lib.mjs`
    + `tsconfig.lib.json` ship `src/index.ts` — the sync engine as one ESM
    bundle with declarations (`npm i gistory` → SyncAgent/mergePayload/
    SyncQos/...). The app and relay stay out of the package by design.

- **2026-10-22 — faked1 extension proposal filed (dhaupin/crashtest#8).** Growth plan for
  crashtest's FakeD1 SQL subset (upserts with `excluded.*`, CASE expressions, MAX/COALESCE +
  aliasing, INSERT..SELECT..RETURNING, param LIMIT) grounded in the eight real relay
  statements gistory's handlers use — with the requirement that whichever agent implements it
  files back an issue here to swap `crashtest/fixture.mjs` (node:sqlite) for the extended
  shim once it ships to npm, drop the node-24 pin, and re-run the gate to the same
  37/6/0 ledger.

- **2026-10-22 — npm/release pipeline landed for gistory-sync (prestruct pattern).**
  `.github/workflows/publish.yml` (Trusted Publishing / OIDC on `v*` tags: gate =
  typecheck + lint + build:lib, idempotent publish that skips when the registry
  already has the version, then installs the registry artifact into a scratch
  project and loads the entry point as a post-publish smoke) and
  `.github/workflows/release.yml` (packs the tarball, gates on THE ARTIFACT'S OWN
  install-and-load battery — the prestruct v1.0.0/v1.1.0 lesson —, asserts the
  d.ts + .mjs exist inside the installed tarball, attaches it to the GitHub
  release with generated notes). Both dormant until the one-time manual
  `npm publish` bootstrap claims the name; then npmjs.com Trusted Publisher
  entry (repo dhaupin/gistory, workflow publish.yml) and every future release is
  `npm version x && git push --follow-tags`. README runbook section added
  (##### Releasing to npm) and AGENTS.md quick-ref updated.

- **2026-10-22 — JSON-LD gap filed upstream (dhaupin/prestruct#30).** The npm
  engine emits Open Graph/Twitter/OG-image injection but ZERO structured data
  unless the host hand-writes `buildJsonLd` — no built-in Organization or
  WebSite blocks, even though siteName/siteUrl/author (all the fields they'd
  need) are already top-level config. Proposed: (A) config-driven defaults with
  @type dedupe so host `buildJsonLd` blocks still win; (B) adopt gistory's
  proven ownership pattern on the /example site (author/founder entity + a
  standalone maintainer Person block appended last; gistory ships
  Creadev.org-founder + dhaupin-maintainer on every page via the engine's
  @graph wrapper). Filed alongside the same-turn landed work: faq accordion +
  single-source FAQ_ITEMS on the lander, full SEO content pass (FAQPage
  JSON-LD === visible summaries verified in dist/, Owner JSON: author
  Creadev.org on WebApplication + Organization.founder, maintainer dhaupin
  last), stale dist-probe 404 assertion (vendored-era notfound-cta class)
  fixed to the npm engine's themed markup.

- **2026-10-22 — CSS duplicate-rule tidy pass.** Selector-audit of index.css
  found 25 duplicated selectors; 6 were exact no-ops (same body verbatim,
  cascade-invisible): .quick-create x2 (the flagged one), .project-label,
  .thread-link-row, .btn-secondary + :hover, .btn-lg. Earlier twins deleted —
  byte-identical bodies, so zero behavior change; 19 remaining duplicates
  genuinely differ (shared-base + context-scoped cascade additions) and stay.
  Verified: typecheck, lint, build 3/3 pages, probe:dist PASS.
- **2026-10-22 — vant audit triage (cross-repo, actionable = none here).** The
  deps list (chalk ^4.1.2 / js-yaml ^4.1.1 flagged next-major deliberate;
  jsqr, qrcode-generator, prestruct 1.1.0, ts 7.0.2, freestruct 1.0.0
  newest-in-range) and the "web/home test script calls vitest but never
  declares it" item belong to dhaupin/vant, not this repo: gistory has one
  root package.json, no web/ or home/ dir, no freestruct dep, vitest
  referenced nowhere. Vant live-tree receipts: web/home is a static vendor
  site (index.html, sitemap, vendor/three.module.js — no package.json, no
  test script, no tests); vitest IS declared in web/dashboard; check-home.js
  and test/runner.js are plain Node (no vitest calls). The audit note's
  web/home-vitest gap does not reproduce on main — stale or another
  branch/repo; asked the owner for the pointer rather than filing on a gap
  that cannot be shown.

- **2026-10-22 — docs/ system scaffolded (Jekyll + freestruct + pagefind) for
  docs.creadev.org/gistory.** Frame ported from prestruct/vant docs (single nav
  source in `_data/nav.yml`, no theme gem, 5-field frontmatter contract,
  permalinks as link targets); `freestruct init` shipped the injection kit and
  the config was filled with gistory's identity (author/founder Creadev.org,
  maintainer dhaupin Person via jsonLd — same ownership shape the product site
  ships). Seven content pages seeded from repo truths: index, getting-started,
  features, sync-and-security, npm (gistory-sync), faq (mirrors the lander's
  FAQ_ITEMS), contributing (full battery + release runbook).
  `scripts/check-docs.mjs` (`npm run lint:docs`, wired into `lint`) holds
  frontmatter/nav/links honest; `.github/workflows/docs.yml` ports the
  freestruct dogfood runbook (ruby 3.4 jekyll build → freestruct --strict →
  pinned+cached pagefind → Pages deploy). Verified: 4/4 YAML files parse,
  CHECK-DOCS PASS (7 pages), full lint + typecheck green. Open: og-image.png
  for the docs og block (commented until drawn); Pages custom-domain setting
  (docs.creadev.org) is a one-time dashboard step. Follow-up (user's ps):
  freestruct/prestruct ship crashtest packs that can extend gistory's
  CI/runners — evaluate alongside the relay-shapes pack once docs deploy.

- **2026-10-22 — og-image SVG gap filed on prestruct (dhaupin/prestruct#31).**
  Their site's og:image is an SVG (example/ssr.config.js line 6), which the
  big crawlers refuse as an og:image candidate — PNG handoff card committed at
  horcrux/prestruct-og-image.png (raw URL in the issue), regenerable via
  scripts/build-og.mjs; issue proposes committing it at example/og-image.png
  + flipping the config. Note: cross-repo ISSUE CREATION works with the
  Freebuff scoping, but addComment refused (Resource not accessible) — file
  new issues rather than commenting when handoff needs to cross repos.

- **2026-10-22 — docs rework: README → npm landing, DEPLOY absorbs all setup,
  AGENTS gains the release runbook, 0.9.0 everywhere.** README rewritten as
  the package landing (pitch, install, quickstart, export map, security
  one-breath, docs links, Keep-a-Changelog pointer; ships in the tarball via
  files — CHANGELOG.md added to files too). Every setup section (dev quick
  start, first-deploy checklist, bindings/VAPID + rationale, migration
  apply path incl. GitHub Actions + secrets table, maintenance tables,
  storage schema, config-files table, troubleshooting) moved into
  DEPLOY.md — the usage/background-sync content moved to the docs site
  (docs/sync-and-security.md gained Timings + Background sync +
  Observability sections; features deletion flow already covered there).
  AGENTS.md gained "Releasing gistory-sync" (bootstrap rules, both
  tag-workflows' gates, house merge rule, README/DEPLOY split rule) and
  quick-ref rows for README/DEPLOY/CHANGELOG/build-og. Version bumped
  0.1.0 → 0.9.0 in package.json + lock; CHANGELOG.md created in
  Keep-a-Changelog format with the [0.9.0] entry (lockfile-level release
  note craft: house-merge preamble so consumers see the cross-version
  invariant). Verified: language gate (16 prose files), CHECK-DOCS PASS,
  full lint + typecheck green; grep audits clean (no 0.1.0 residue, all
  gistory-sync references consistent, header anchors resolve).

- **2026-10-22 — v1.0.0 announcement draft (docs/discussions/announcing-v1.0.0.md).**
  Mirrors dhaupin/prestruct's discussions pattern: frontmatter contract kept
  (5 fields), the full post inside a ~~~md block to copy into the community
  announcement when the v1.0.0 tag ships, prose contract honored (direct,
  dry, no em dashes, no marketing). Current line is honestly framed as 0.9.0
  in the page wrapper; the draft body becomes true at the tag (it describes
  the engine package, the stable-line merge contract, the sync model, and
  the relay — all shipped capabilities, nothing aspirational). pages under
  discussions/ are exempt from nav listing in scripts/check-docs.mjs
  (prestruct keeps theirs off the nav too); CHECK-DOCS PASS (8 pages),
  language gate PASS (17 files), typecheck green. Uncommitted — awaiting the
  batch commit with the docs rework.

- **2026-10-22 — release nitpick sweep.** Verified the publishable tarball by
  actually running `npm pack` after `build:lib` (landing + LICENSE +
  CHANGELOG.md + the dist/lib bundle + declarations; a dry-run without
  `build:lib` shows a 4-file shell for exactly that reason — noted for the
  release checklist). Fixed ahead of 0.9.0: removed a leftover tagged-tarball
  artifact from npm pack experimentation; pruned the redundant nested
  ignore-pattern line from `.gitignore` (covered by the broader rule),
  including undoing a line-merge that first pass accidentally created inside
  the ignore list (the split entries are back on their own rows);
  folded CI's standalone "Language gate" step into `bun run lint`, which
  already chains the prose gate + docs gate; AGENTS.md CI paragraph now
  lists the actual CI jobs (typecheck 3-pass, lint chain, sync smoke, both
  database self-checks, the production prerender build); docs/contributing
  grammar + accuracy ("migrations self-verify on a fixture database"; CI
  runs everything except the browser suites). Left as-is (intentional): 19
  cascade-merge duplicate CSS selectors; `models/` (Vant brain workspace,
  documented in the ignore list); the user's .vant-*.md audit files.
  Grep receipts: 0 TODO/FIXME anywhere; no unreferenced components (every
  src/components/*.tsx has a caller);  import-adapters used by Settings;
  `misc/art-pack-gallery/` was an empty unreferenced untracked dir — removed.

- **2026-10-22 — second polish pass (post-release word-accuracy).** Stale
  wording fixed where reality moved under it: three "weekly" mentions that
  predate the daily-at-03:17 maintenance schedule (scripts/db-maintain.mjs ×2,
  scripts/live-subscribe.mjs — the schedule line in maintenance.yml itself
  says why daily: blob retention is the only storage bound). docs/npm.md had
  two real bugs: the heading typo "Whatisto know" and, worse, a code sample
  calling `agent.sync({ passphrase, pairingToken })` — a method SyncAgent has
  never had. Rewritten to the real surface (constructor takes passphrase/
  chainId/deviceName/baseUrl/writeSecret; init → handshake → pull/push;
  pull returns `{ blobs, ... }`; chainIdFromToken parses the pairing token;
  legacy write-less tokens fail writes by design — the sample spells that).
  Verified the docs FAQ copy still mirrors ssr.config FAQ_ITEMS 1:1 (8
  questions, same order) and that getting-started/sync-and-security claims
  hold against code (1.5 s push debounce, 60 s pull interval, 30-day wake
  sweep). Brain workspace: prestruct + rook goals.md "Current" items marked
  done where passes made them done. Left as is: index.html noscript overflow
  (real 0-strange-overflow — real plus shell shell), 19 cascade-merge
  selectors, models/ lore voice. Gates: lint + language gate + CHECK-DOCS 8
  pages PASS, typecheck 3-pass green, sync:smoke 363/363.

- **2026-10-22 — UI polish from user screenshots + footer unification.**
  From mobile screenshots: `.btn` inline-flex (the lucide arrow in the
  lander's two "Open the app →" CTAs rode on the text baseline instead of
  the centerline); lander footer gained the dofollow "Made by Creadev.org"
  credit (target=_blank, rel=noopener, no nofollow — deliberate endorsement
  link). Then unified the footer: `src/components/Footer.tsx` is now THE
  single shared footer and Lander/TermsPage/PrivacyPage/Layout all render
  `<Footer />` — the three duplicated inline footers (and the partial ones
  on the legal pages that even self-linked) are gone, the dead `.footer`
  CSS block is deleted, and the app footer's redundant hash links
  (Projects/Settings/Home — covered by header + burger) dropped with it.
  PrivacyPage's "weekly maintenance job" caught saying weekly («daily») —
  same staleness the scripts pass fixed. New scripts:
  verify-lander-tweaks.mjs + verify-footer-parity.mjs (browser checks;
  ui:audit cannot fit the 180s cap — parity PASS on all four surfaces).

- **2026-10-22 — docs-site frame ported from freestruct's own docs.** The
  docs frame (docs/_layouts/default.html + assets/main.css, no Ruby on the
  sandbox, so verified via fixture) gains what freestruct docs.creadev.org
  has: fixed sidebar with mobile hamburger + backdrop drawer (≤760px
  off-canvas, aria-expanded managed),  pagefind search modal (header button,
  Ctrl/⌘+K, Escape; dynamic `import(pagefind/pagefind.js)` — the old static
  bottom <script> tag on the 1.5.x ESM bundle throws "import.meta outside a
  module" (freestruct#15), which alone could kill every later script the
  user saw break), and a
  persisted light/dark switch (inline head script pins data-theme before
  paint; localStorage gistory_docs_theme; OS default). Footer now carries
  © year + Made by Creadev.org (dofollow, _blank) like the product footer,
  plus an always-shown "Project" sidebar block. Real bug found while in
  there: aria-current compared `item.url == page.permalink` — nav URLs
  carry the baseurl prefix, permalinks don't, so NO nav item ever
  highlighted; fixed with remove_first: site.baseurl. New
  scripts/verify-docs-frame.mjs renders the layout as a static fixture and
  drives drawer/theme/search in a browser (PASS: active marking, theme
  persists across reload, sun/moon swap, Ctrl+K/Escape, off-canvas
  geometry, backdrop-close on the exposed area).  Ruby absent locally —
  Jekyll + freestruct + pagefind verify in the docs workflow at deploy.
  Logo/favicon added too: public/favicon.svg copied to docs/favicon.svg,
  linked in the layout head and inlined in the header brand tile with a
  docs-logo clip radius; the fixture asserts the img renders and the
  icon link resolves.
  Palette decision applied (user approved): signature shade = deeper
  indigo-blue --primary #3552cc (hover #2a41a8 light; dark themes get the
  lighter half: app #7b95f5 light-fill + #0a1021 fg, docs #8ba4ff text/link)
  plus option-1 ink tweaks — cooler denser ramp: --text #0c0d10,
  --text-dim #565b66 on #f6f7f9, dark ramp #101217/#191c23/#2b2f38 with a
  whisper of the primary hue. Favicon tile + theme-color #080808→#0c0d10,
  OG cards regenerated (build:og). Contrast receipt: scripts/
  verify-palette.mjs (WCAG 2.1 ratios, 15 pairs, both themes, app+docs,
  favicon; PASS — deep primary raised the white-on-fill ratio 6.5:1) —
  parser handles comments/nested braces after a one-regex grab misfired.
  scripts/verify-palette-live.mjs asserts the preview renders the tokens.
  Docs content styling completed (user report: "links aren't styled") —
  .docs-content gains the missing typographic set: accent links with soft
  underline, inline-code chips scoped by direct-child selectors, p/ul/ol
  rhythm, h4-h6, hr, img, blockquote. Code-block highlighting ported from
  dhaupin/prestruct's docs frame verbatim (Prism 1.29 + autoloader via
  jsDelivr, dark #1e1e1e slab both themes, data-language badge, clipboard
  copy button): docs get initDocsCodeBlocks scoped to .docs-content;
  product lander gets a use-scoped loader in Lander.tsx (browser-only, so
  prerender stays plain and Node never loads Prism) plus ONE real code
  sample (a yaml filled-in prompt with {{placeholders}}) in "How it
  works" — deliberately NOT global to the app, so ThreadView's <pre>
  (user prompt text) never gets CDN scripts or syntax colors. Both proven
  in-browser: fixtures verify-docs-code-style.mjs + live
  verify-lander-code.mjs (24 token spans, badge ts/yaml heuristics, copy
  button, app-shell scope leak asserted negative).

