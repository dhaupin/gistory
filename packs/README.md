# packs/ — crashtest scenario packs for this repo

## What this directory is

This is Gistory's home for [**Crashtest**](https://crashtest.creadev.org)
scenario packs. Crashtest is adversarial QA for agent-built app code
("attack the code, not the people"): it drives a seeded, in-process attack
suite against your **real handler functions** — plain functions or a
framework app — and produces a hardening ledger your CI refuses to regress.
No sockets, no staging deploy, no network: each attack hands a real WHATWG
`Request` to a registered handler inside your own Node process, and every
attack ends in one of three verdicts:

| Verdict | Meaning |
|---|---|
| 🛡 `REFUSED` | the defense held: denied, validated, or constrained |
| ⚡ `EXPLOITED` | a real weakness — CI fails when one appears for the first time |
| 🔒 `BOUNDED` | a known, **accepted** risk with a named owner and an explicit bound |

A pack is a bundle you author once and reuse: a `pack.json` manifest plus
scenario modules whose attacks share the exact contract of crashtest's
built-in seed libraries (`run(harness, ctx)` → one verdict record). This
repo keeps two visibility folders under `packs/` (crashtest discovers both
automatically, no config changes needed):

- `packs/public/` — tracked here, reusable across targets. Anything that
  names *this* product's vocabulary lives through `moduleCtx`, so another
  relay project can adopt the pack without editing it.
- `packs/local/` — gitignored, machine-private (instance lore: real chain
  ids, private scenarios). Not used here yet. Create one with
  `npx crashtest packs add <name>`; `--public` moves it to this folder.

The committed `labs/crashledger.json` (from gistory's first adopted run) is
what CI compares against: the gate fails on a *new* `EXPLOITED` verdict or a
previously-refused surface that regressed. That makes the ledger the
project's memory that forgets nothing — a fix that slips out lands in CI as
a red run, not in a doc.

## Run it (locally)

```bash
bun run crashtest:build   # bundles the relay handlers + agent crypto the config imports
crashtest run             # discovers packs/public/, fires the campaign, writes labs/
```

CI runs the same gate on every push and pull request (`.github/workflows/crashtest.yml`).

## The pack(s) in this repo

### `sync-relay-shapes` — chain-relay abuse shapes

**Dialect:** generic HTTP (transport-agnostic: no adapter prefix — it speaks
push/pull relay, not any one framework). **Vocabulary:** injected entirely
from `moduleCtx['sync-relay-shapes']`; the pack hard-refuses to run if a key
is un-armed (an un-armed pack never reads as "everything refused").

Thirteen attacks over one injected dialect:

| Attack | Shape it probes | Expected of a hardened target |
|---|---|---|
| `takeover-by-own-secret` | a joiner handshakes an existing chain with its OWN write secret, then writes under it — a takeover replaces the stored capability | handshake keeps the original secret's digest; attacker's write refused |
| `create-race-second-writer` | two creators race one fresh chain id; the loser writes | only the first creator's secret authenticates afterward |
| `secret-format-variants` | case/format/padding variants of a valid secret (upper, all-zero, wrong alphabet, padded) are pushed | no variant authenticates — the comparison is exact, not fuzzy |
| `existence-oracle` | handshake answers for a known chain vs a fresh id | statuses do not distinguish existing from unknown ids (bounded: ids carry ~122 bits, per-IP flood bucket caps probes) |
| `member-rename-nuisance` | a member re-registers another member's **device row** under their own name | rename does not land (bounded: names are display-level metadata; pushes/data unaffected) |
| `spoofed-device-write` | a push naming the victim's deviceId with the attacker's secret | refused before any row is touched; victim's blob count unchanged |
| `status-nonmember-read` | `status` called with any valid-shaped, non-member device id | no device list leaks (bounded: names-only read surface, throttled on the pull budget) |
| `chain-rows-farm` | 25 fresh chains from one prober by rotating ids | materialized rows are bounded (bounded: edge rate-limit policy owns the economics) |
| `phantom-device-rows` | 5 anonymous joins into someone else's chain | join rows are bounded (bounded: pruned by the 90-day idle sweep, view capped at 50) |
| `waf-body-shapes` | top-level array, raw `__proto__` key, duplicate keys, numeric `data` — with a REAL secret on the chain, so a yes would be an auth bypass, not a dead route | every hostile shape rejected, none authenticated |
| `parser-query-shapes` | hostile `since`/`limit` values (`1e999`, `-5`, `abc`) and a 5000-char deviceName | clamped (never 5xx/throw; the fuzz floor), oversize name stored sliced |
| `watermark-pin` | a pusher holding a valid write secret delivers ciphertext the chain's passphrase cannot read (the poison-blob scenario) | accepted, but bounded: the relay is a blind conduit and the client-side consequence is a watermark that *holds and retries*, never skips |
| `guard-header-hygiene` | drives the handshake throttling budget dry (real limits from `POLICIES`), then reads the shaped 429 | the guard response carries `Cache-Control: no-store` — hand-rolled headers are where cacheability mistakes live |

Six of those are documented accepted risks in gistory's relay (the bounded
ones): the pack reads their owner + bound from the run root's
`bounds` vocabulary, so a bound that stops being true in code turns into a
finding in CI, not into a stale doc line.

## Where the relay handlers live (for Gistory contributors)

- `crashtest.config.js` — the run root: routes, the in-memory D1 fixture,
  and this pack's vocabulary
- `crashtest/handlers-entry.ts` + `scripts/build-crashtest.mjs` — the bundle
  build (the CLI loads plain Node, so the TS handlers ship as one file)
- `crashtest/fixture.mjs` — the `node:sqlite` fixture the config attaches as
  `GISTRY_DB` (real SQL, migrations seeded, whole-run shared state)
- `tests/sync-smoke.ts` — where the behavioral layer lives (this pack
  replaces the old `tests/redteam.ts`)

## Crashtest elsewhere

- Site: <https://crashtest.creadev.org>
- Docs: <https://docs.creadev.org/crashtest> (pins, packs, playlists, guardrails)
- npm: <https://www.npmjs.com/package/crashtest>
- Creadev.org — Crashtest's home: <https://creadev.org>

MIT-licensed, made by Rook @ Creadev.
