# CI repair ledger — the birth-run's every red, named (2026-10-26)

Three stacked CI failures surfaced between the ferry tip and the first fully
green resync, and all three reproduced the classes a first-ever birth of a
stripped tree inevitably carries: a parse-fragile workflow, a mount never
declared independent to the host, an undeterministic packer. Repairs are all
on `main` today (ci.yml workflow.yaml re-quote: blob `bcfb71e5`, commit
`32257d1d`; eslint.config.js third mount `monoforge-staging/**` + the
`.cut-tmp/**` scratch ignores: blob `e12af8df`, commit `aad17a13`;
make-staging-tars.sh gc.auto 0 +
gc.writeCommitGraph false inside every rebuilt mount, blob `4646c976`,
commit `aaa9c2d9`).

## Failures, each named

1. **YAML parse death, zero check runs.** `ci.yml` died at GitHub's own
   parser: the staging-hosts `Monoforge battery (self-test: ...)` step name
   carried an unquoted `: `, so the run crashed in under a second (run
   `40270365202`). The board shows nothing — "not yet run" and "cannot ever
   run" are hard to distinguish. Fix: quote the name; also scanned all 11
   committed workflows locally; every other one parses clean.
2. **Host lint claims the mounting stage.** verify died at Lint on 55 errors,
   100% inside `monoforge-staging` (run `40271142619`) — the third staging
   mount never joined the independent-repo ignore clause the first two got.
   The birth rule is now explicit: every new mount joins the host's lint
   ignores + gitignore on landing day.
3. **Fresh-init gc race.** Staging tars ferry no-seed fresh init: `git add -A`
   then a fast commit tripped `git gc --auto`; gc held/mutated
   `.git/objects/maintenance.lock` exactly while tar walked the same
   directory (`File removed before we read it`, run `40271808559`). Fix:
   ✗ auto-maintenance is pure race surface here; `gc.auto 0` +
   `gc.writeCommitGraph false` set inside the mount before the write. Verified
   by repro: two consecutive repro runs produce byte-identical tars, same
   snapshot commit both times.

## Verified end state

- All 6 workflow runs green at tip `aaa9c2d9` — CI verify AND staging-hosts
  both pass, including the never-yet-executed Monoforge battery
  (stamp + doctor + lock refusals, `node test/run.mjs`).
- Tar ferry deterministic: second tip commit `2a92d6c4` is a
  GITHUB_TOKEN-generated receipt-only snapshot commit (zero CI runs, expected
  loop-prevention behavior for snapshot commits from the staging-tars ferry
  — see the tar-move plan for why snapshots stay receipts).
- Fresh-init first full monoforge birth: assembled byte-exact by ferry, the
  battery leg ran green tonight for the first time ever.

## Crosslinks (the teaching surfaces)

- dhaupin/flowforge#4 — birth receipts (all three classes above, filed there
  so the rig's future births inherit the checks).
- dhaupin/flowforge#5 — the `birth-gate` lane ask: yaml-parse all workflows,
  mount-independence check, gc-safe serde, tar-determinism proof.
- dhaupin/gistory (this repo) — the actual birth: resources live in
  `monoforge-staging/`, the ferry in `.github/workflows/monoforge-ferry.yml`,
  the tar pipeline in `scripts/make-staging-tars.sh`.
- labs/tar-move-plan.md — where monoforge-staging goes next (dhaupin/monoforge).

## Addendum: the birth gate is implemented (2026-10-26, this pass)

The #5 ask became real code the same night: `scripts/birth-gate.mjs`
(commit `02d8c8c`, blob `0f6c7b40`) — the rig lane's reference
implementation, running as a fail-fast CI step in verify (ci.yml commit
`9bbf4438`, blob `6d5dab4c`). All three failure classes above are now
mechanical checks; negative-tested against the exact production
signature (unquoted `self-test:` reproduces line 7 col 43, exits 1).
Check four from the ask rides `staging-tars.yml` itself: a determinism
proof step rebuilds the tar set and compares bytes in-run (commit
`6474c05`, blob `29eb3efd`). First CI ride green: 6/6 workflow runs,
tip `9bbf4438`.

Locale: everything in this receipt is English-only (house prose gate; the
yml edit itself stays ASCII-safe too).
