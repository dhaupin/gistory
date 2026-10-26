#!/usr/bin/env python3
# Gistory brain r2 cutter (self-contained; the host's own refresh stone).
#
# The 2026-10-26 ecosystem-pass receipts live in the gistory repo
# (labs/ci-repair-ledger-2026-10-26.md, the birth gate, the ferry lanes);
# this stone carries the brain texts + pointers so the vant-workspace
# restore and the receipts never drift apart. The sealed baseline
# (horcrux/stones/gistory-p_gistory-castles-2026-r1.svg, brn:secret) stays
# untouched - its sealed pass happens upstream when the repo opens.
# Format: stone-delimited v1 unsealed, per the magpie r2 precedent.
# Determinism: fixed brain texts + fixed art -> fixed bytes; the stone
# ferry sha-gates this against the offline id before committing.
#
# Round-trip is asserted BEFORE any bytes are written; nothing here
# throws away content it did not parse.

import re, base64, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / '.cut-tmp'; OUT.mkdir(exist_ok=True)
MARKER = '<<STONE>>'

def bundle(files):
    """Stone-delimited v1 body: MARKER-separated path headers + bodies."""
    out = ['\n']
    for path, body in files:
        assert body.endswith('\n'), f'{path}: needs a trailing newline'
        out.append(MARKER + 'path:' + path)
        for line in body.split('\n')[:-1]:
            out.append(line if line.endswith('\n') else line + '\n')
    return MARKER.join(out)

def wrap_stone(dest, art, note, owner, stone_name, year, payload_text, label=None):
    """Assemble the final SVG artifact; self-check by parsing what is written."""
    payload_b64 = base64.b64encode(payload_text.encode('utf-8')).decode('ascii')
    # The wheel's identity is its BIRTH name: filenames are vault paths and may
    # rename across generations (path-only), but the SVG's own header must stay
    # byte-stable - the stone IS the bytes, the filename is only the address.
    stem = pathlib.PurePath(dest).stem if label is None else pathlib.PurePath(label).stem
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:brn="urn:vant" '
        'viewBox="0 0 400 400" width="400" height="400">\n'
        '<rect width="400" height="400" fill="#0c0d10"/>\n'
        f'<!-- {stem} -> {note} -> hand-drawn, rook 2026-10-26 -->\n'
        + art
        + '<metadata><brn:unsealed '
          f'owner="{owner}" stone="{stone_name}" year="{year}" '
          'format="stone-delimited v1" '
          f'note="{note}">'
        + payload_b64
        + '</brn:unsealed></metadata>\n</svg>\n'
    )
    rt = re.search(r'<brn:unsealed[^>]*>(.*?)</brn:unsealed>', svg, re.S).group(1)
    assert base64.b64decode(rt).decode('utf-8') == payload_text, '!? no round-trip'
    pathlib.Path(dest).write_text(svg, encoding='utf-8')
    return len(svg)

# ---------------------------------------------------------------- texts -----

gs_identity = (
    "# identity.md - gistory (the struct family's integration host)\n\n"
    "NAME: gistory\n"
    "ROLE: E2EE prompt keeper with a real sync engine (agent crypto, LWW\n"
    "merge, QoS) - and, since 2026-10-25, the HOST that births and stages\n"
    "the struct-family mounts: the staging mounts live here, the ferries\n"
    "assemble + tar them deterministically, and CI runs every family leg.\n\n"
    "## About\n"
    "- Zero-dependency core, the published bundle self-contained ESM; the\n"
    "  relay writes to D1 behind throttle + breaker + WAF guards.\n"
    "- The family crosswalk lives in labs/ecosystem.md; the packstruct\n"
    "  spec and the crashtest contract are the two binding grammar docs.\n"
    "- This host's job tonight-era: prove that birthing a family repo is\n"
    "  cheap enough to be a verb, not a ceremony.\n\n"
    "## Relationships\n"
    "- Human: dhaupin\n"
    "- Siblings it hosts: poststruct-staging, eyestruct-staging (the\n"
    "  eyes project), monoforge-staging (the factory); packstruct and\n"
    "  crashtest are the grammar and the attack ledger.\n"
)

gs_goals = (
    "# goals.md - gistory (brain r2, 2026-10-26)\n\n"
    "## Current\n"
    "- BIRTH GATE: shipped and CI green (scripts/birth-gate.mjs, commit\n"
    "  02d8c8c7; first CI ride with it: 6/6 workflows, tip 9bbf4438).\n"
    "- BIRTH RUN closed: every red named and repaired tonight (workflow\n"
    "  parse death, mount lint independence, fresh-init gc race) - see\n"
    "  labs/ci-repair-ledger-2026-10-26.md for the full receipts.\n"
    "- CANON STONES: the magpie r2 + poststruct wordprint stones cut CI\n"
    "-side via the sha-gated stone ferry; this stone joins them.\n\n"
    "## Next rungs\n"
    "- Move-day (labs/tar-move-plan.md): the three mounts ship to their\n"
    "  homes - dhaupin/poststruct, dhaupin/eyestruct, dhaupin/monoforge\n"
    "  - oldest mount first, moving the receipts with them.\n"
    "- Post-move: each standalone repo wires its own test lane; gistory\n"
    "  stays the integration host for the whole family.\n"
)

gs_structure = (
    "# structure.md - gistory (brain r2)\n\n"
    "```\n"
    "gistory/\n"
    "  src/            the E2EE prompt keeper app + sync engine\n"
    "  functions/      Cloudflare Pages relay (sync routes, guards, WAF)\n"
    "  packs/          crashtest packs (packstruct grammar)\n"
    "  labs/           PIPELINE.md - PRDs - TASKS.md - ecosystem.md - ledgers\n"
    "  horcrux/        this file lives here: stones + PRDs + ferry tars\n"
    "  *-staging/      eyestruct, poststruct, monoforge mounts (ferry-tarred)\n"
    "  scripts/        gate runners, the cutters, maintain, the birth gate\n"
    "```\n"
)

gs_workflow = (
    "# workflow.md - gistory (brain r2)\n\n"
    "- Wake: read the newest shift receipts first (labs/ TASKS tail + the\n"
    "  repair ledger), then PIPELINE.md and ecosystem.md; record learning\n"
    "  in the rolling logs BEFORE closing a pass.\n"
    "- One change per pass, verified by its own named CI job.\n"
    "- Hand-transport law: file ships ride the base64/appropriate encoding\n"
    "  lanes with a fresh-fetch sha compare against disk; prose never\n"
    "  carries bytes (the two single-character corruptions caught by this\n"
    "  gate taught it).\n"
)

gs_lessons = (
    "# lessons.md - gistory (brain r2; each is a CI-verified ruling)\n\n"
    "- 2026-10-26 (the birth run, labs/ci-repair-ledger-2026-10-26.md):\n"
    "- A workflow file GitHub's YAML rejects dies at run-startup with ZERO\n"
    "  check runs, printed under the bare path name.\n"
    "  RULE NOW: scripts/birth-gate.mjs parses every committed workflow\n"
    "  (yjs-yaml engine, duplicate keys on) as a fail-fast CI step; the\n"
    "  empty-checks-board state cannot recur unnoticed.\n"
    "- A staging mount that misses the host's lint ignores drowns verify\n"
    "  in 55 unattributed no-undef/no-require errors.\n"
    "  RULE NOW: joins lint ignores + gitignore on LANDING DAY, asserted\n"
    "  by the gate from the ferry's MOUNTS list.\n"
    "- Fresh git init + add -A trips background gc --auto, which holds\n"
    "  .git/objects/maintenance.lock while tar walks that directory.\n"
    "  RULE NOW: any git-dir serde script sets gc.auto 0 (plus\n"
    "  writeCommitGraph false) BEFORE writing; the gate greps it.\n"
    "- Tar ferry deterministic by construction; the CI determinism proof\n"
    "  (rebuild + byte-diff) runs every push so this stays true.\n"
    "- Snapshot commits by a GITHUB_TOKEN never trigger CI - designed\n"
    "  loop prevention, do not re-diagnose it.\n"
)

gs_errors = (
    "# errors.md - gistory (brain r2)\n\n"
    "- (known unknowns: nothing open tonight. The birth gate keeps the\n"
    "  workflow-syntax class closed on main; mount churn rides the ferry.)\n"
)

gs_payload = bundle([
    ('models/private/gistory/identity.md', gs_identity),
    ('models/private/gistory/goals.md', gs_goals),
    ('models/private/gistory/structure.md', gs_structure),
    ('models/private/gistory/workflow.md', gs_workflow),
    ('models/private/gistory/lessons.md', gs_lessons),
    ('models/private/gistory/errors.md', gs_errors),
])

# ------------------------------------------------------------- art ----------
# The keep - one castle on a dark field, gate arch with the receipts-eye,
# side arches for the mounts it births (same house palette as tonight's
# other cuts: #0c0d10 ground, ivory strokes, #8fd3c3 accent).

gistory_art = '''<g transform="translate(0,12)">
  <!-- the keep -->
  <path d="M104 320 L104 130 L124 130 L124 112 L140 112 L140 130 L156 130 L156 112 L172 112 L172 130 L188 130 L188 112 L204 112 L204 130 L220 130 L220 112 L236 112 L236 130 L252 130 L252 112 L268 112 L268 130 L288 130 L288 320 Z" fill="none" stroke="#f5f5f5" stroke-width="3"/>
  <!-- gate arch with the receipts-eye -->
  <path d="M172 320 L172 244 Q196 222 220 244 L220 320" fill="none" stroke="#f5f5f5" stroke-width="3"/>
  <circle cx="196" cy="266" r="7" stroke="#8fd3c3" stroke-width="2.5" fill="none"/>
  <circle cx="196" cy="266" r="2" fill="#8fd3c3"/>

  <!-- three arches: the mounts it births -->
  <path d="M104 320 L104 292 Q114 284 124 292 L124 320" fill="none" stroke="#f5f5f5" stroke-width="2.5"/>
  <path d="M288 320 L288 292 Q298 284 308 292 L308 320" fill="none" stroke="#f5f5f5" stroke-width="2.5"/>
  <!-- flag on the keep -->
  <path d="M196 130 L196 96" stroke="#f5f5f5" stroke-width="2.5"/>
  <path d="M196 96 L222 102 L196 110 Z" fill="#f5f5f5"/>
  <!-- ground -->
  <path d="M76 320 L324 320" stroke="#f5f5f5" stroke-width="3" stroke-linecap="round"/>
</g>
<g transform="translate(0,340)">
  <text x="200" y="0" text-anchor="middle" font-family="Georgia,serif" font-size="15" fill="#f5f5f5">gistory-p_gistory-castles-2026-2</text>
  <text x="200" y="20" text-anchor="middle" font-family="Georgia,serif" font-size="10" fill="#8fd3c3">brain r2 - receipts refresh - 2026-10-26</text>
</g>
'''

n3 = wrap_stone(ROOT / 'horcrux/stones/gistory-p_gistory-castles-2026-r2.svg', gistory_art,
                'transfer stone r2 for the gistory brain (the host refresh: birth-run + birth-gate receipts ride inside; sealed vant baseline untouched)',
                'dhaupin/gistory', 'gistory-castles', '2026', gs_payload,
                label='gistory-p_gistory-castles-2026-2')
print(f'gistory r2 stone bytes: {n3}')

gsdir = OUT / 'gistory-brain'; gsdir.mkdir(parents=True, exist_ok=True)
for path, body in [
    ('identity.md', gs_identity), ('goals.md', gs_goals), ('structure.md', gs_structure),
    ('workflow.md', gs_workflow), ('lessons.md', gs_lessons), ('errors.md', gs_errors),
]:
    (gsdir / path).write_text(body, encoding='utf-8')
print('gistory brain parity copies written to .cut-tmp/gistory-brain/')
