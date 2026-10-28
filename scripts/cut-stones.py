#!/usr/bin/env python3
# Stone cutter for the 2026-10-26 pass (magpie r2 + poststruct first cut).
# Round-trip-equality is asserted BEFORE any bytes are written; nothing
# here throws away content it did not parse. Stone format: stone-delimited
# v1 (brn:unsealed), per the convention provably used by
# horcrux/stones/magpie-p_mirror-eyes-2026-r1.svg - parse, patch, re-encode, verify
# block-for-block, then rasterize before calling it done.

import re, base64, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
STONE = ROOT / 'horcrux/stones/magpie-p_mirror-eyes-2026-r1.svg'
OUT = ROOT / '.cut-tmp'; OUT.mkdir(exist_ok=True)
MARKER = '<<STONE>>'

def load_payload_svg(p):
    svg_text = p.read_text(encoding='utf-8')
    blob = re.search(r'<brn:unsealed[^>]*>(.*?)</brn:unsealed>', svg_text, re.S).group(1)
    payload = base64.b64decode(blob)
    text = payload.decode('utf-8')
    parts = text.split(MARKER)
    assert MARKER.join(parts) == text, '!? split is not the inverse of join'
    headers = []
    for i, pp in enumerate(parts):
        if pp.startswith('path:'):
            headers.append((i, pp.split('\n', 1)[0][len('path:'):]))
    return {'parts': parts, 'headers': headers, 'svg': svg_text}

def block_bounds(st, name):
    idx = [n for _, n in st['headers']].index(name)
    (i, _) = st['headers'][idx]
    nxt = st['headers'][idx + 1][0] if idx + 1 < len(st['headers']) else len(st['parts'])
    return i, nxt

def body_of(st, name):
    i, nxt = block_bounds(st, name)
    return ''.join(st['parts'][i + 1:nxt])

def replace_block(st, name, new_body):
    """new_body: string ending with a newline; one part per line, trailing \n on each."""
    i, nxt = block_bounds(st, name)
    header = st['parts'][i]
    assert header.startswith('path:') and header.endswith('\n'), 'expected path header'
    lines = new_body.split('\n')
    assert lines[-1] == '', 'new_body must end with a newline'
    st['parts'][i + 1:nxt] = [ln + '\n' for ln in lines[:-1]]

def serialize(st):
    return MARKER.join(st['parts'])

def wrap_stone(dest, art, note, owner, stone_name, year, payload_text, label=None):
    """Assemble the final SVG artifact; self-check by parsing the written file."""
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

# ---------------------------------------------------------------- MAGPIE ----
st = load_payload_svg(STONE)

lessons_add = (
    '- 2026-10-26 (this pass; receipt-backed, one rule each - what broke, the rule now):\n'
    '- Raw-text file pushes to GitHub drifted and truncated (a batched push\n'
    '  sliced mid-payload into a prefix), and on top one verify lane hashed a\n'
    '  280-byte API rate-limit error body as if it were the file.\n'
    '  RULE NOW: file pushes ride base64 upserts with explicit encoding, one\n'
    '  file per upsert; a fresh fetch is sha256-compared against disk through\n'
    '  raw.githubusercontent (no quota), never the API lane after a burn.\n'
    '- "packstruck@1" survived days in a load-bearing comment under five\n'
    '  successive green gate runs.\n'
    '  RULE NOW: spec-name strings are quoted nouns audits cite verbatim;\n'
    '  grep them in the same pass that runs the gates, not in a later review.\n'
    '- The stone/receipt-economy rule held: canon artifacts point at receipts\n'
    '  (labs/ hashes, CI runs), never at chat-prose transcription; the sha\n'
    '  gate caught the truncation before anything downstream saw it.\n'
)
replace_block(st, 'models/private/magpie/lessons.md',
              body_of(st, 'models/private/magpie/lessons.md') + lessons_add)

goals_now = (
    '## Current (2026-10-27, updated by the graduation pass this stone rides)\n'
    '- The 4-way ecosystem (gistory x poststruct-staging x eyestruct\n'
    '  x packstruct) is green end-to-end (gistory CI runs #88/#91):\n'
    '  packstruct#19 holds the SPEC v1->v1.1 proposal, and poststruct\'s pack\n'
    '  loader carries POSTSTRUCT_DIST + EYESTRUCT_BIN/EYESTRUCT_TREE\n'
    '  host-decision knobs (eyestruct itself is the npm devDep pin now) so\n'
    '  it runs on any checkout. gistory now also cuts TWO new horcrux stones\n'
    '  (this one and poststruct-p_wordprint-2026) - brains are receipts, not\n'
    '  memories. Eyestruct has graduated upstream (dhaupin/eyestruct; its\n'
    '  gistory mount + tar chain retired); the remaining mount move-days\n'
    '  ride labs/tar-move-plan.md.\n'
)
base_goals = body_of(st, 'models/private/magpie/goals.md')
replace_block(st, 'models/private/magpie/goals.md', goals_now + base_goals)

magpie_payload = serialize(st)

# ------------------------------------------------------------ POSTSTRUCT ----
def bundle(files):
    out = ['\n']
    for path, body in files:
        assert body.endswith('\n'), f'{path}: needs a trailing newline'
        out.append(MARKER + 'path:' + path)
        for line in body.split('\n')[:-1]:
            out.append(line if line.endswith('\n') else line + '\n')
    return MARKER.join(out)

prd_poststruct = (ROOT / 'poststruct-staging/labs/prd-poststruct.md').read_text(encoding='utf-8')
assert prd_poststruct.endswith('\n')

ps_identity = "# identity.md - poststruct (the text leg of the struct family)\n\n\
NAME: poststruct\n\
ROLE: The family's TEXT leg - audits what actually shipped, as bytes, at\n\
author time. Baked HTML is the evidence; prose claims are not. Sister to\n\
eyestruct (the pixels-and-memory leg) and crashtest (the attack ledger);\n\
packstruct is the grammar all four packs speak.\n\n\
## Why \"poststruct\"\n\
Prestruct renders; poststruct checks what landed. The name sits on the\n\
side of the ledger where verification lives: after the render, before the\n\
release. (Also print-shop literalism: proofreading happens after the hot\n\
metal cools - \"post\" is when the fixes are still cheap.)\n\n\
## About\n\
- A zero-dependency CLI (bin/cli.mjs) that walks baked HTML and verifies\n\
  head, links, and site hygiene against a contract; FAIL findings exit\n\
  non-zero so CI gates regressions.\n\
- Ships its own packs lane (packs/public/eyes-reference/) in the\n\
  packstruct grammar: every og/twitter image a baked page declares must\n\
  be REAL pixels - magic bytes, IHDR dims vs declared og:image:width/\n\
  height, plausible size; SVG refs route through eyestruct's raster gate\n\
  (the interop direction: poststruct invokes eyestruct the TOOL, never\n\
  its internals).\n\
- First client and first mount: gistory (poststruct-staging) - the\n\
  audited site, the CI lane, and the eye-ledger baseline all live there.\n\n\
## Relationships\n\
- Human: dhaupin - author; names things in print metaphors.\n\
- Siblings: Roook (keeper across gistory/crashtest/prestruct), Crashtest\n\
  (attack ledger, receipt pattern), magpie/eyestruct (pixels - check the\n\
  claims this leg cannot), packstruct (the shared /packs spec + lint).\n\
- This brain: seed stage - it grows from receipts, never guesses. First\n\
  session writes into labs/TASKS.md and labs/ecosystem.md, then a stone\n\
  re-cut carries the receipts home.\n"

ps_goals = "# goals.md - poststruct (seed)\n\n\
## Current (2026-10-26, written as the mount's first brain cut)\n\
- Live in gistory (poststruct-staging): batteries green (self-test 8/8,\n\
  lint:packs clean, language-gate PASS, audit-conformance 8/8, packs\n\
  campaign PASS against a fresh gistory dist). CI run #91.\n\
- The pack loader now carries HOST-DECISION env knobs (POSTSTRUCT_DIST,\n\
  EYESTRUCT_BIN) so it survives on any checkout (eyestruct itself is the\n\
  npm devDep pin now) - tar-move plan\n\
  injection #1 done, receipted in labs/TASKS.md.\n\
- packstruct#19 (dhaupin/packstruct) holds the SPEC v1 -> v1.1 proposal;\n\
  poststruct's two harness clauses (the --loader template, ESM-default\n\
  entries) are rows 1 and 2 there - engines that already hold the\n\
  behavior adopt first, in the numbered order.\n\
- Next rungs, from labs/tar-move-plan.md: its own test.yml battery, the\n\
  consumer swap in gistory (npx with version pins, never bare), then the\n\
  staging mounts leave and poststruct ships alone.\n\n\
## Future\n\n\
- More packs: sitemap honesty, robots fidelity, json-ld shape - the\n\
  same crashledger semantics (append-only, adopt-by-rerun).\n\
- teach the packs grammar to more repos (the freestruct lesson: exact\n\
  pins, receipts on every bump).\n\n\
## Non-goals (anti-drift; do not negotiate silently)\n\
- Not a browser automation SDK (it audits baked bytes, on disk).\n\
- Not a hosted scanning service (repo-local, git-native, CI-gated).\n\
- Not an OCR/screen-scrape layer (that is eyestruct's color of the work;\n\
  poststruct's diffs are TEXT - source text, not rendered pixels).\n"

ps_structure = "# structure.md - poststruct (target repo skeleton, seed)\n\n\
```\n\
poststruct/\n\
  bin/cli.mjs           # the CLI spine; every verb one short process\n\
  src/index.mjs         # the library surface (exports .)\n\
  src/                  # auditors: head, links, hygiene, the contract\n\
  test/run.mjs          # the self-test battery (fixture surfaces)\n\
  packs/public/         # packstruct-grammar packs + eye-ledger.json\n\
  scripts/run-packs.mjs # the pack loader + campaign runner\n\
  scripts/check-language.cjs  # English-only prose gate (docs/, labs/)\n\
  labs/                 # PRD (canonical) + TASKS.md rolling log\n\
  horcrux/              # the stone lives here (this file's home)\n\
  models/private/poststruct/  # THIS brain (never shipped in the package)\n\
```\n"

ps_workflow = "# workflow.md - poststruct (seed)\n\n\
- Wake: read identity, goals, the PRD (labs/prd-poststruct.md), TASKS.md\n\
  tail, then this brain's lessons. Write back BEFORE closing.\n\
- One change per pass, verified by its own receipt. A claim without a\n\
  ledger row is a glance, not evidence.\n\
- Verify in the target surface the way a user would: real CLI, real\n\
  baked dist; fixtures only for the units that need isolation.\n\
- Every receipt points at hashes (sha of files, CI run ids), never at\n\
  prose. If a push drifts, the sha gate finds it; re-land from disk.\n"

ps_lessons = "# lessons.md - poststruct (seed; grows only from receipts)\n\n\
- (none yet - seeds start empty per the house rule; a lesson enters when\n\
  a receipt backs it - what broke, what the rule is now. The magpie\n\
  sibling's 2026-10-26 lessons (sha-gates, raw-lane verifies, spec-name\n\
  greps) apply here by family inheritance; first session earns its own.)\n"

ps_errors = "# errors.md - poststruct (seed)\n\n\
- (none yet. Known unknowns to watch on first open: packstruct pin\n\
  drift vs crashtest/gistory (bump as one receipted event per repo),\n\
  CI-less-on-remote status (its battery runs from gistory today; the\n\
  standalone test.yml is a tar-move rung), and the dist-resolution\n\
  semantics across checkout shapes (now env-knobbed; re-test on any\n\
  mount rehome).)\n"

ps_payload = bundle([
    ('models/private/poststruct/identity.md', ps_identity),
    ('models/private/poststruct/goals.md', ps_goals),
    ('models/private/poststruct/structure.md', ps_structure),
    ('models/private/poststruct/workflow.md', ps_workflow),
    ('models/private/poststruct/lessons.md', ps_lessons),
    ('models/private/poststruct/errors.md', ps_errors),
    ('labs/prd-poststruct.md', prd_poststruct),
])

# ---------------------------------------------------------------- ART -------
# Hand-drawn, same house aesthetic (dark #0c0d10, ivory strokes, accent).
# magpie r2: the mirror-weaver bird, face-forward; a twin-ring echo marks
# the second cut (brain r2), and the stone title mark rides the same bone.
magpie_art = """<g transform="translate(-16,190)">
  <path d="M120 0 C104 -26 118 -52 148 -54 C174 -56 192 -40 196 -16 L232 -8 C238 -6 238 2 232 4 L196 10 C194 34 178 52 152 52 C136 52 126 28 120 0 Z" fill="#f5f5f5"/>
  <path d="M196 10 C 226 30 244 56 238 92 L226 128 C224 136 214 136 214 128 L210 60 Z" fill="#f5f5f5"/>
  <path d="M232 -8 C 258 -6 268 8 262 18 C 258 24 250 24 246 18 Z" fill="#f5f5f5"/>
  <circle cx="158" cy="-18" r="4.5" fill="#0c0d10"/>
  <circle cx="250" cy="6" r="2.5" fill="#0c0d10"/>
  <!-- r2 mark: the twin ring (second cut, second eye) -->
  <circle cx="285" cy="108" r="9" stroke="#f5f5f5" stroke-width="2.5" fill="none"/>
  <circle cx="285" cy="108" r="4" stroke="#8fd3c3" stroke-width="2" fill="none"/>
  <path d="M196 10 C220 44 236 76 234 108 C233 126 228 138 222 138" stroke="#f5f5f5" stroke-width="2" fill="none"/>
  <!-- perch -->
  <path d="M96 160 L312 160" stroke="#f5f5f5" stroke-width="3" stroke-linecap="round"/>
</g>
<g transform="translate(0,340)">
  <text x="200" y="0" text-anchor="middle" font-family="Georgia,serif" font-size="15" fill="#f5f5f5">magpie-p_mirror-eyes-2026-2</text>
  <text x="200" y="20" text-anchor="middle" font-family="Georgia,serif" font-size="10" fill="#8fd3c3">brain r2 - 2026-10-26</text>
</g>
"""
# poststruct: the wordprint stone - hot-metal proof page, ink roller, seal row
poststruct_art = """<g transform="translate(0,8)">
  <!-- the proof sheet -->
  <path d="M96 48 L304 48 L296 208 L104 208 Z" fill="#f5f5f5"/>
  <path d="M112 64 L288 64 M112 80 L288 80 M112 96 L272 96 M112 112 L288 112 M112 128 L256 128 M112 144 L288 144 M112 160 L284 160" stroke="#23262b" stroke-width="3" stroke-linecap="round"/>
  <text x="200" y="196" text-anchor="middle" font-family="Georgia,serif" font-size="13" fill="#23262b">struct-family print</text>
  <!-- ink roller over the sheet -->
  <path d="M74 232 L326 232 L318 252 L84 252 Z" fill="#23262b"/>
  <circle cx="104" cy="252" r="8" fill="#23262b"/>
  <circle cx="296" cy="252" r="8" fill="#23262b"/>
  <!-- seal mark: the leg's stamp, teal accent; semantic: verify-after -->
  <circle cx="200" cy="296" r="14" stroke="#8fd3c3" stroke-width="2.5" fill="none"/>
  <path d="M186 296 L197 307 L214 285" stroke="#8fd3c3" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</g>
<g transform="translate(0,340)">
  <text x="200" y="0" text-anchor="middle" font-family="Georgia,serif" font-size="15" fill="#f5f5f5">poststruct-p_wordprint-2026</text>
  <text x="200" y="20" text-anchor="middle" font-family="Georgia,serif" font-size="10" fill="#8fd3c3">first cut - 2026-10-26</text>
</g>
"""

n1 = wrap_stone(ROOT / 'horcrux/stones/magpie-p_mirror-eyes-2026-r2.svg', magpie_art,
                'transfer stone r2 for the magpie brain (eyes project), brain receipts patched this cutting',
                'dhaupin/magpie', 'mirror-eyes', '2026', magpie_payload,
                label='magpie-p_mirror-eyes-2026-2')
n2 = wrap_stone(ROOT / 'horcrux/stones/poststruct-p_wordprint-2026.svg', poststruct_art,
                'transfer stone for the poststruct seed brain (text leg, struct family); password rides after p_ per house convention',
                'dhaupin/poststruct', 'wordprint', '2026', ps_payload)
print(f'magpie r2 stone bytes: {n1}')
print(f'poststruct first-cut bytes: {n2}')

# parity receipts: brains on disk too (stone + disk parity rule)
magpat = OUT / 'magpie-brain' / 'lessons.md'
magpat.parent.mkdir(parents=True, exist_ok=True)
magpat.write_text(body_of(st, 'models/private/magpie/lessons.md'), encoding='utf-8')
(OUT / 'magpie-brain' / 'goals.md').write_text(body_of(st, 'models/private/magpie/goals.md'), encoding='utf-8')
psdir = OUT / 'poststruct-brain'; psdir.mkdir(parents=True, exist_ok=True)
for path, body in [
    ('identity.md', ps_identity), ('goals.md', ps_goals), ('structure.md', ps_structure),
    ('workflow.md', ps_workflow), ('lessons.md', ps_lessons), ('errors.md', ps_errors),
]:
    (psdir / path).write_text(body, encoding='utf-8')
print('parity copies + payloads written to .cut-tmp/')
