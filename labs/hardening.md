# Hardening report

> crashtest v1.0.0 / seed 12648430
> cut stamp: labs/run-meta.json (wall clock, deliberately outside this file).
> CI rule: fail on a NEW EXPLOITED finding, or a REGRESSION of anything previously REFUSED.

## Findings

### 🛡 REFUSED (37)
- auth/identity-spoof-headers: route "admin" not declared on this target - spoof matrix skipped (declare it for coverage)
- auth/secret-watermark: no fake secrets planted in env - declare CRASHTEST_SECRET to arm this probe
- auth/privilege-escalation: route "device" not declared on this target - escalation skipped (declare it for coverage)
- authz/method-matrix-privileged: route "admin" not declared on this target - authz skipped (declare it for coverage)
- authz/role-body-spoof-family: route "admin" not declared on this target - authz skipped (declare it for coverage)
- authz/handler-alias-confusion: route "admin" not declared on this target - authz skipped (declare it for coverage)
- guards/hygiene-no-store: route "enroll" not declared on this target - attack skipped (declare it for coverage)
- guards/burst-wall: route "burst" not declared on this target - attack skipped (declare it for coverage)
- input/proto-pollution-body: route "enroll" not declared on this target - attack skipped (declare it for coverage)
- input/never-fail-mutations: route "enroll" not declared on this target - attack skipped (declare it for coverage)
- input/oversized-field: route "enroll" not declared on this target - attack skipped (declare it for coverage)
- proto-hygiene/head-get-parity: 4 route(s): HEAD mirrors GET (no throws, no status drift beyond honest 405) + 4 info note(s)
- proto-hygiene/request-shape-flood: 4 route(s) x 18 bare shapes (query chaos, path shapes, header casings) all landed 4xx-or-cleaner with case-parity intact
- race/double-submit-idempotency: route "charge" not declared on this target - race skipped (declare it for coverage)
- race/concurrent-write-lost-update: route "profile" not declared on this target - race skipped (declare it for coverage)
- recursion/deep-nest-stack-overflow: route "enroll" not declared on this target - recursion skipped (declare it for coverage)
- recursion/redos-catastrophic-pattern: route "validate" not declared on this target - recursion skipped (declare it for coverage)
- session/cookie-hygiene: route "login" not declared on this target - session skipped (declare it for coverage)
- session/session-fixation: route(s) "login", "me" not declared on this target - session skipped (declare it for coverage)
- session/token-replay-deny: route "login" not declared on this target - session skipped (declare it for coverage)
- session/logout-invalidates: route(s) "login", "me", "logout" not declared on this target - session skipped (declare it for coverage)
- state/enumeration-oracle: route "device" not declared on this target - enumeration skipped (declare it for coverage)
- state/id-collision-alias: route "enroll" not declared on this target - alias check skipped
- sync-relay-shapes/takeover-by-own-secret: joining handshake 200 did not replace the stored secret; attacker write 403
- sync-relay-shapes/create-race-second-writer: loser write 403, winner 200 — the first creator kept the chain
- sync-relay-shapes/secret-format-variants: no case/format variant (4 tried) was accepted
- sync-relay-shapes/spoofed-device-write: push 403 and the victim's blob count stayed 0
- sync-relay-shapes/waf-body-shapes: 4 hostile body shapes rejected, none authenticated
- sync-relay-shapes/parser-query-shapes: hostile since/limit clamped (3 probes) and the overlong deviceName stored at 64 chars
- sync-relay-shapes/guard-header-hygiene: a shaped 429 carries Cache-Control: no-store
- taxonomy/abuse-not-5xx: route "enroll" not declared on this target - taxonomy skipped (declare it for coverage)
- taxonomy/errors-stay-impersonal: route "enroll" not declared on this target - taxonomy skipped (declare it for coverage)
- upload/filename-traversal-family: route "upload" not declared on this target - upload skipped (declare the upload route + its kv store for coverage)
- upload/mime-polyglot-family: route "upload" not declared on this target - upload skipped (declare the upload route + its kv store for coverage)
- volume/credential-stuffing: route "enroll" not declared on this target - stuffing skipped (declare it for coverage)
- volume/storage-fill: route "kvwrite" not declared on this target - fill check skipped (declare a KV-writing route)
- volume/cost-amplification: route "enroll" not declared on this target - amplification skipped (declare it for coverage)

### ⚡ EXPLOITED (0)

### 🔒 BOUNDED (6)
- sync-relay-shapes/existence-oracle: known chain 200 vs unknown 400 — the difference reads as an oracle - owner: gistory relay (dhaupin), bound: handshake status codes distinguish existing vs unknown chain ids; chain ids are uuid-strength (~122 bits) and the per-IP flood bucket caps probes at 1200/min
- sync-relay-shapes/member-rename-nuisance: "Renamed Target" is now "PWNED-DEVICE"; names are display-level, pushes and data were never touched - owner: gistory relay (dhaupin), bound: a member holding any secret can rewrite another device display name via handshake; names are metadata only — pushes, blobs, and data are never touched
- sync-relay-shapes/status-nonmember-read: a valid-shape (non-member) deviceId read the chain's device names - owner: gistory relay (dhaupin), bound: /sync/status returns member names to any valid-shaped deviceId; names are the only readable content, blobs are ciphertext, and status draws from the same per-device pull budget that rate-limits it
- sync-relay-shapes/chain-rows-farm: 25 permanent chain rows from one prober; storage growth is bounded only by the relay's edge rate policy - owner: gistory relay (dhaupin), bound: fresh chain ids create permanent rows (~1200/min per IP behind the edge flood bucket, per-device handshake bucket 20/min); real chains are never deleted, so the cap is edge rate policy, not row hygiene
- sync-relay-shapes/phantom-device-rows: 5 phantom device rows joined a chain they hold no secret for; the device list is a metadata surface - owner: gistory relay (dhaupin), bound: anyone who knows a chain id can add device rows to it; the device list is capped at 50 in responses and maintenance prunes rows idle for 90 days
- sync-relay-shapes/watermark-pin: poison ciphertext (wrong-for-the-chain passphrase) relayed through a valid write secret (200) - owner: gistory relay (dhaupin), bound: the relay cannot validate ciphertext (it is blind by design), so a valid-secret blobs hold the victim watermark — the client-side consequence is a watermark that holds before the poison blob and RETRIES on the next sync, never skips; pinned behaviorally in tests/sync-smoke.ts

## Cost economics
- total: 166 backend ops across 550 in-process requests from 43 attacks
  - auth/identity-spoof-headers: 0 ops / 0 requests
  - auth/secret-watermark: 0 ops / 0 requests
  - auth/privilege-escalation: 0 ops / 0 requests
  - authz/method-matrix-privileged: 0 ops / 0 requests
  - authz/role-body-spoof-family: 0 ops / 0 requests
  - authz/handler-alias-confusion: 0 ops / 0 requests
  - guards/hygiene-no-store: 0 ops / 0 requests
  - guards/burst-wall: 0 ops / 0 requests
  - input/proto-pollution-body: 0 ops / 0 requests
  - input/never-fail-mutations: 0 ops / 0 requests
  - input/oversized-field: 0 ops / 0 requests
  - proto-hygiene/head-get-parity: 8 ops / 8 requests
  - proto-hygiene/request-shape-flood: 72 ops / 80 requests
  - race/double-submit-idempotency: 0 ops / 0 requests
  - race/concurrent-write-lost-update: 0 ops / 0 requests
  - recursion/deep-nest-stack-overflow: 0 ops / 0 requests
  - recursion/redos-catastrophic-pattern: 0 ops / 0 requests
  - session/cookie-hygiene: 0 ops / 0 requests
  - session/session-fixation: 0 ops / 0 requests
  - session/token-replay-deny: 0 ops / 0 requests
  - session/logout-invalidates: 0 ops / 0 requests
  - state/enumeration-oracle: 0 ops / 0 requests
  - state/id-collision-alias: 0 ops / 0 requests
  - sync-relay-shapes/takeover-by-own-secret: 3 ops / 3 requests
  - sync-relay-shapes/create-race-second-writer: 4 ops / 7 requests
  - sync-relay-shapes/secret-format-variants: 5 ops / 12 requests
  - sync-relay-shapes/existence-oracle: 3 ops / 15 requests
  - sync-relay-shapes/member-rename-nuisance: 2 ops / 17 requests
  - sync-relay-shapes/spoofed-device-write: 2 ops / 19 requests
  - sync-relay-shapes/status-nonmember-read: 2 ops / 21 requests
  - sync-relay-shapes/chain-rows-farm: 25 ops / 46 requests
  - sync-relay-shapes/phantom-device-rows: 6 ops / 52 requests
  - sync-relay-shapes/waf-body-shapes: 5 ops / 57 requests
  - sync-relay-shapes/parser-query-shapes: 5 ops / 62 requests
  - sync-relay-shapes/watermark-pin: 3 ops / 65 requests
  - sync-relay-shapes/guard-header-hygiene: 21 ops / 86 requests
  - taxonomy/abuse-not-5xx: 0 ops / 0 requests
  - taxonomy/errors-stay-impersonal: 0 ops / 0 requests
  - upload/filename-traversal-family: 0 ops / 0 requests
  - upload/mime-polyglot-family: 0 ops / 0 requests
  - volume/credential-stuffing: 0 ops / 0 requests
  - volume/storage-fill: 0 ops / 0 requests
  - volume/cost-amplification: 0 ops / 0 requests

## Baseline diff
- NEW: none / REGRESSED: none
