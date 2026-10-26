# packstruct SPEC v1 → v1.1 — an extension proposal (2026-10-26)

Drafted by gistory, the ecosystem's integration host, after the Part-2
conformance pass landed in the family. The governing rule is already in
the spec preamble ("code first, spec formalizes after; nothing
schema-changing is hidden on the engine side"): every row below cites
ENGINE receipts — things at least one host loader already does — rather
than inventing future requirements. Nothing here moves schemaVersion:
this is the additive-first patch the spec's own versioning section
promises (section 6), so the frozen v1 field table stays untouched.

Basis: `poststruct-staging/node_modules/packstruct/spec/SPEC.md`
(packstruct 1.0.0), the three-fold engine truth the extension work rode
out of: crashtest's loader (the reference engine), then poststruct's
`scripts/run-packs.mjs` and eyestruct's `scripts/run-packs.cjs`, which
went 1/8 → 8/8 honored to reach the same grammar from two very
different engines (the receipts live in `labs/ecosystem.md`, "The
conformance lanes" section).

## 0. What v1.1 adds

| # | Proposed addition | Section of the spec | Engine receipt | Cost to a conforming host |
|---|---|---|---|---|
| 1 | `implements` — the acknowledged, optional manifest key | 2 + 6 | eyestruct and poststruct both carry `packstruct@1.0.0` as an EXACT devDependency and live by the same-commit-same-findings discipline — but the spec pins hosts in docs prose only; the discipline has no manifest surface | none — presence never required, format lint only |
| 2 | The `--loader` TEMPLATE contract, formalized | 7 | the `audit-conformance` lane is now RUN for real on two hosts, both passing their loader commands through `{packs}` substitution; the wording on the page is the only contract un-formalized | none — hosts already conform |
| 3 | ESM-default entry acceptance, stated plainly | 3 | the audit accepted eyestruct's ESM-default fixtures as CORRECT (not an exception) — spec section 3 already declares default export; v1.1 closes the gap by explicit statement | none |
| 4 | Interop routes as a LIFECYCLE NORM, not a manifest field | 4 | poststruct's `eyes-reference` routes SVG verifies through eyestruct's raster gate; the pack never imports eyestruct internals — that discipline deserves spec language | none |
| 5 | `schemaVersion` adoption staleness is the HOST's sin, the lint's warning | 2, 5 | the ecosystem finally carries 3 simultaneous `packstruct@1.0.0` pins (crashtest, poststruct, eyestruct) that bump TOGETHER — formalize the companion-pin RECEIPT the tar-move plan assigns its hosts | none |

## 1. `implements` — acknowledgements grow, one key

Section 2's "Host-owned acknowledged keys" list (`env`, `plugins`,
`package`) exists because crashtest's loader shape-validates those names.
The ecosystem discovered a FOURTH example of the same shape of thing:
the spec-version pin a host carries. Today that pin lives in AGENTS.md
and DEPLOY.md prose ("implements: packstruct@1"), which is exactly
where `env`/`plugins`/`package` lived before they got acknowledged rows.

**Proposed normative text.** `implements` is an optional string manifest
key acknowledging the spec a pack builds against, formatted as
`packstruct@<MAYOR>` or an exact pin `packstruct@1.0.0`. The linter
validates FORMAT ONLY (non-conforming shape → warning, never refuse);
absence stays the quiet default and never colors a verdict. A host-owned
key, not a shared fact: hosts that don't use it are equally conforming.

**Engine receipt.** Not from crashtest's manifest — this is one
acknowledgement row the ecosystem carries as discipline everywhere
(gistory's own pack, eyestruct's packs, poststruct's pack all
load under host-declared lint lanes), so it belongs on the ACKNOWLEDGED
list alongside host-owned shape expectations, not on the frozen field
table.

## 2. The `--loader` template contract

Section 7 currently documents `packstruct audit-conformance <repo-dir>
--loader "<cmd> {packs}"` but leaves when/where/what un-said. Two host
harnesses now both honor an unspoken contract; the ecosystem's receipt
is that they DO agree, without the spec ever saying aloud what they were
agreeing to. Formalize:

- `{packs}` substitutes the materialized case pack's DIRECTORY path
  (never a tarball, never a URL).
- The loader command runs with CWD = `<repo-dir>` (the audited repo
  root), same as the invocation.
- Exit contract: 0 on the clean bundle; non-zero AND a stderr line
  naming the offending pack on every violation bundle (SPEC section 5's
  nameability carries into the harness).
- The loader runs with NO network and NO host config implicit — a pack
  declares what it needs; the harness verifies refusal norms on
  declared-shape violations only.
- A loader that TIMES OUT or crashes is verdict "1 any case failed"
  (never "0"), and harness output names which loader failed, so a
  broken --loader can't flatter itself into a pass.

**Engine receipt.** Both live loaders (poststruct's `node
scripts/run-packs.mjs {packs}`, eyestruct's `node
scripts/run-packs.cjs {packs}`) hold every clause; the two bumps
(1/8 → 8/8) were finding them honing grammar agreement themselves, which
is what formalization is for.

## 3. ESM-default entries, stated plainly

Section 3 says "An entry is an ES module with a default export." The
audit receipts prove this accepts COMMONJS modules whose default export
is the contract (`module.exports = { run, CASES, PKG, REQUIRED_KEYS }` in
eyestruct's scene and `module.exports = { CASES }` in poststruct's
self-audit pack). Enter the normative clarifier:

> The entry's DEFAULT EXPORT is the loaded thing. The module format
> (ESM `export default` / CJS `module.exports`) is the pack's own
> concern; fixtures that carry one and not the other are correct, and
> the loader per-profile decides what run/execute shape it accepts on
> that default.

No host change, no lint change; it stops future hosts from guessing.

## 4. Interop routes are lifecycle norms, not manifest fields

The ecosystem leans on one dogma as the pack ecosystem grows: a pack
MAY declare an interop route (run a sibling leg's gate, fork work to a
sibling CLI, consume a sibling's runtime) ONLY through public CLI
surfaces of that sibling — never by import, and never by guessing a
path when an npx resolution is available. The receipt is poststruct's
SVG verification, which routes through the eyestruct raster gate by
invoking eyestruct the TOOL.

## 5. Companion-pin receipts for packstruct itself

Section 6's decoupling already formalizes that packstruct's own version
traces linter/harness surface only — spec stays at the number it's at
while the hosts bump linters. The ecosystem's LIVE state carries the
companion-pin discipline (four tools at packstruct 1.0.0 exactly; one
bump is a receipted event per repo). The extension names that policy in
the spec so it lives in the document, not in receipts:

> Hosts carry the packstruct pin they conform to as an EXACT
> devDependency, bumped deliberately and receipted per host. A host may
> lag behind another host's pin; its `implements` row and CI battery
> reveal the state. Nothing here forces synced bumps — it forces the
> SYNCHRONIZED RECEIPT when bumps happen, per the tar-move plan's own
> adoption ladder.

## 6. What we explicitly do NOT propose

- **NO remote packs, NO auto-download.** v1's lifecycle norms are the
  pack ecosystem's honesty gate; a remote-fetch lane turns the manifest
  grammar from a reviewable artifact into a transport layer and breaks
  every refusalistica. Rejected again.
- **NO `run inside lint` / linggrade.** Runs are the host's business; a
  lint mode that executes pack code would turn author-time checks into
  arbitrary code execution rejected from every other reviewer's time.
- **NO bump to `schemaVersion` 2.** All five rows are additive and
  none move the frozen v1 table; a semver bump here would declare a
  break none of these rows cause.
- **NO name/dir engine-parity push.** Tracked upstream by
  dhaupin/packstruct#2's existing ruling; v1.1 does not re-litigate.

## 7. Adoption ladder

Adopted one row at a time by the engines that already hold its
behavior, in the order the rows are numbered (they teach each other):
first the loader-template contract (§2 — sharpest shape, best
self-verifying), then ESM-default statement (§3 — one-line clarifier),
then `implements` acknowledgement (§1) and the pin receipt (§5) as a
pair, then interop routes (§4) last because its wording borrows from
the §s clarifier's energy. Each adopted row lands in crashtest's spec
repo as a tool-bump-only revision (0.9.x→1.1.x patched, never a major
bump) with the section-6 decoupling quoted intact.
