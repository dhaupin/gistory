# Transport - what survives the lane at which size (house guide, 2026-10-26)

Every receipt below is one of tonight's commits in dhaupin/gistory, with
the blob id that proves the carry was byte-exact. The law it feeds: a
carry is only valid if its landed blob hashes equal to the disk bytes it
was produced from, checked BEFORE anything dispatches against it. A carry
that skips that gate does not exist.

## The size ladder

| Shape | Shown safe up to | Evidence (blob, commit) |
|-------|------------------|--------------------------|
| naive plain text body | ~2KB prose | most TASKS-scale receipts tonight; also the earliest casualties (b653dc7a, 1d5bd74d - stone carries WITHOUT wrapping) |
| 76-char wrapped base64 | ~41KB, drift-checked | magpie r2 transfer stone (`horcrux/stones/`); landed once dimm, and NOT drift-immune - a later 224-row payload took a two-row scramble near row 117. The wrap is not the guarantee; the blob check is. |
| single-line pure base64 | ~10KB, first try | monoforge `lock-archive-overlay.patch` (blob 44a0c4a9, prose + embedded unified diff) - zero newline surface to scramble, landed byte-exact on attempt 1 |
| gz+b64 wrapped payload + runner-side emit | the rest - use this | the 58.7KB eyestruct package-lock.json (sha f47974f87e152364; runner-side repair+emit one-shot, decayed payload caught by sha gate) - for anything ~10KB and up |
| git history rebuild + heredoc, sha-gated | any - use this for whole-file receipts | receipts-restore one-shot: base bodies from `git show <commit>:<path>` (zero carried content), receipt appendices from heredocs, sha256 gates d053fe79/1f380f27 - refusing to push until both match |

## The two GITHUB_TOKEN laws (learned from the horcrux-reorg + the lock lanes)

1. A workflow run cannot hold a `workflows` permission scope - the API
   refuses to even parse the workflows key in the run's own permissions
   block ("Unexpected value 'workflows'").
2. A run's push may not patch files under `.github/workflows` at all.
   Tool that lands/edits workflow files: the commit lane (GitHub App
   token). Self-deleting one-shots: the run commits only plain files;
   the workflow-file cleanup rides a cleanup commit through the lane.

Other laws in the same class tonight:

- A shallow checkout (`fetch-depth: 1`) cannot `git checkout <parent> --
  path` - the parent's tree is not in the runner's object store. Anything
  that reads history needs `fetch-depth: 0`.
- D1 maintenance SQL that matches by bare `seq` spans chains; keep the
  `(chain_id, seq)` row-value form (full receipt in AGENTS.md, gotchas).

## The pre-merge checklist (the gates for carrying into the family)

Every carry, regardless of shape, passes these five before it counts:

1. Byte gate: landed blob id == `git hash-object` of the produced file.
2. Dispatch gate: anything the payload feeds (a workflow, a re-lock, a
   ferry) checks the gate ITSELF at run time (sha256 or blob) and fails
   loudly without writing if the bytes drifted.
3. One-shot retirement: dispatch-only workflows that delivered their
   bytes leave the board - the standing battery is the only surface.
4. Interleave discipline: land, then wait for the family ferry lanes to
   finish, THEN verify the landing survived (a correct landing still gets
   reassembled if an interleaved lane's own bytes win - the mount-tree
   ferry law in monoforge-staging/horcrux/lock-archive-overlay.patch).
5. Receipts: blob ids in the TASSS log, not prose-only ("landed" without
   a digest is a guess with punctuation).

## Failure classes found tonight (with evidence)

- **Hand-composed payload fragments** - the commit path where a body was
  reconstructed in the call from context rather than produced from, and
  verified against, disk bytes (fragment receipt at 2a965758, 952 bytes of
  a 4,268-byte file). Never compose content in the call; always produce it
  on disk, hash it, carry THAT.
- **Mistyped path** - a filename that existed nowhere on disk (the commit
  was a "new stray file" not a repair). Corrective landing possible only
  because the stray's deletion rode the same lane; deleted in commit
  59dae630.
- **sha-mismatch drift in a payload** - the 2-row scramble in the gz+b64
  carry. Caught by the runner-side gate; never shipped.
- **An interleaved lane overwriting a direct carry** - files that ride
  INSIDE the monoforge lock archive lose to the ferry every time by
  design. Receipts for their bytes live only in horcrux/-family slots the
  ferry never deletes (ferry never removes extra files it only
  re-materializes its own archive members).

## Standing infrastructure this gates at landing time

- `staging-tars.yml` - builds + determinism-proofs the three staging
  mounts' git-dir tars on every push (two-run byte-identical proof).
- `scripts/verify-staging-tars.sh` - the move-day gate: re-verifies every
  COMMITTED staging tar rebuilds byte-identical from the current tree.
  Failure means "the snapshot in the repo is stale / the tree moved since
  the ferry last came through - re-run the ferry pack before move day,"
  not "determinism is broken".
- `scripts/verify-transport-lands.mjs` (npm run `transport:lands`, CI
  step in ci.yml) - the phased landing gate (2026-10-27). Phase 1 SHAPE:
  every tracked byte-carry shape (`chunk.*.part` families anywhere,
  `*.gz.b64`, `*.b64`) still decodes as the shape it claims - gzip magic,
  contained base64, chunk-family contiguity - catching the mid-payload
  transcription drift class before a landing. Phase 2 PARITY: every
  carried path matches git HEAD with zero uncommitted overwrite (so what
  an agent is about to push is the bytes the repo just landed, not a
  stale local view). Phase 3 ORIGIN (--origin owner/repo ref, pre-push
  leg): read-back parity from raw.githubusercontent against local sha256
  - the independent-of-git read of what actually landed. Self-testing
  (`--self-test` refuses a corrupted fixture). House receipt: the
  2026-10-27 chunk re-land, where three transcription typos (one byte in
  a wrapped row, one word-boundary byte, one missed wrap newline) were
  found only by hand-diffing the landed copies against the pristine local
  buffers; this gate makes that class a named refusal instead.
- `poststruct-rig-gates-repair.yml` - the runner-side re-derive one-shot
  (2026-10-28, RETIRED after its receipt). The repair class it serves:
  "a tracked file whose commit-lane carry KeEPS drifting" gets
  re-derived on the RUNNER from the last known-good rev via rehearsed
  transforms. Receipts: poststruct-staging/package.json re-derived from
  the pre-drift rev b4fdf3a via a scripted JSON edit (lint:docs gains
  the two scanner passes; check consumes them) and .github/workflows/
  docs.yml via a pinned block replace - each output blob-gated against
  the intended result (3d04c42d / 00a18f12) and committed only after
  both gates held (repair commit cd2316c). Dispatch 1 died at
  `git show <old-rev>` under a depth=1 checkout (the shallow law above,
  now proven on a runner); the fix is `fetch-depth: 0` on the one-shot's
  own checkout. New law from dispatch 2: the runner receives a
  `run: |` scalar minus its base indent, so heredoc python must sit at
  the block's base column - one extra level of indent is an
  IndentationError that reads as a broken script, not a YAML law.