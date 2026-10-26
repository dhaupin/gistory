# Tar move: staging mounts â†’ the standalone repos (plan, 2026-10-26)

The staging host trees ride their own changes and tar over into the
standalone repos dhaupin owns. That move is manual (a dhaupin-side push
with real git machinery) â€” this file is the receipts laneway for it: the
inventory, the injected changes, the sequencing, and what gistory keeps
after each repo leaves. Nothing here runs Until the batteries confirm the
tar arrives clean on GitHub's side. Until then the mount trees are the
single source of truth and gistory's lanes keep riding them.

The pairing at a glance:

| from (staging mount) | â†’ to (standalone repo) | remote |
|---|---|---|
| `poststruct-staging/` | dhaupin/poststruct | exists; push needs a dhaupin-side machine (the App never got write grant on it) |
| `eyestruct-staging/` | dhaupin/eyestruct | also dhaupin-side |

## Why a tar, not a bare push

The two staging trees already ARE git repos (nested `.git` I gitignored
under gistory's own repo on purpose: a bare gitlink confuses every
consumer without its gitmodules). Their `git` histories are canonical
upstream: six-plus real commits on eyestruct's side, the full poststruct
life-with-0.9.0 on the other. Taring them preserves that history instead
of flattening it â€” the standalone repos keep provenance storied in their
own heads and never carry a gistory-shaped transplant artifact.

## poststruct-staging â†’ dhaupin/poststruct

### What rides the tar

- the whole tree (the mount IS the repo; `packs/`, `src/`, `bin/`,
  `test/`, `scripts/`, docs/labs/PRD, workflows, health function, the
  poststruct-staging lockfile this ecosystem pushed as 841B honest
  bytes). The `.git` dir itself is the repo history: from the standalone
  side it gets pushed as-is once the mount is untarred.
- package-lock.json â€” the transit-corruption-tolerant lock
  (`packstruct@1.0.0` = `sha512-aUiBeâ€¦` triple-verified) lands HERE; the
  staging-tree copy is already correct.

### Injected changes (pre-tar, land in the mount first)

1. **`scripts/run-packs.mjs` path bindings** â€” three gistory-mountain
   references need HOST-DECISION env knobs so the pack loader survives on
   any checkout:
   - `POSTSTRUCT_DIST` (default `../gistory/dist`): the audited site for
     `--dist` default. On a standalone checkout the honest default is
     `./dist`; the gistory-relative default becomes an ENV-set override
     only when someone audits gistory FROM poststruct.
   - `EYESTRUCT_BIN` (default `../eyestruct-staging/bin/eyestruct.js`):
     the raster leg's reference. Once eyestruct publishes `0.9.0` this
     flips to an npx-resolved path with an honest version pin â€” never a
     bare `npx eyestruct` (the pin discipline the ecosystem carries
     everywhere else applies here too: same commit â†’ same findings).
   - `EYES_REFERENCES_PROVIDER_TWIN_MAP` stays (env's own shape); the
     twin keys still NAME gistory, deliberately: gistory is this pack's
     first client, and after the tar it is the CLIENT, not the mount.
2. **`scripts/check-language.cjs`** â€” no mechanical change needed: it
   lists `labs/` in its scan scope, which remains the repo-local labs/
   tree (its own PRD, own TASKS). The gistory mention in its contract
   comment rides as-is.

### What gistory keeps after poststruct leaves

- `lab receipts` pointing at dhaupin/poststruct (links replace staging
  paths), `labs/` PRD canonical still lives HERE (gistory is the
  integration host; the pack is the pack).
- `npm run lint:packs` (gistory's pack wiring): crashtest's
  `packs/public/sync-relay-shapes` stays in gistory â€” that is a
  crashtest-shaped pack run by the crashtest harness, not by
  poststruct. Nothing to remove.

## eyestruct-staging â†’ dhaupin/eyestruct

### What rides the tar

- whole tree: `bin/` + `lib/` (CLI spine, ratify, walk, gate, mcp),
  `tests/smoke.test.js`, `packs/` (eye-shapes, eye-text-leg, eye-ci-gate
  + eye-ledger.json), `docs/` (rig Jekyll identity), `web/` (prestruct
  rig shell), `labs/prd-eyes.md`, `models/private/magpie/` (the brain,
  never shipped), `horcrux/` stones, `MANIFEST.md` provenance, `scripts/`
  (run-packs.cjs + docs gates), `package.json` + lockfile.
- `gh-pages`â€¦ not carried; poststruct's docs.yml pattern is the
  template when dhaupin first deploys the docs page.

### Injected changes (pre-tar, land in the mount first)

1. **The CI the mount borrows today**: eyestruct currently has NO own
   workflows â€” its batteries run from gistory's `ci.yml`
   (`staging-hosts` job) and its ratify lane lives at
   `.github/workflows/eyes-ratify.yml` in gistory (gistory is the host
   whose `.eyes` get ratified). After the tar:
   - eyestruct gets its OWN test.yml modeled on poststruct's (setup-node
     20 â†’ `npm test`), plus `conform:packs` in its battery (packstruct
     1.0.0 exact pin already in `devDependencies`).
   - The ratify/host lane STAYS IN GISTORY â€” it ratifies gistory's
     `.eyes` home (labs/.eyes), and after the tar it resolves the
     eyestruct tool from npx instead of the staging path (see the
     sequencing note below).
2. **`bin/eyestruct.js`** â€” the host-owned comment ("gistory keeps its
   eyes at labs/.eyes") gets a second sentence tying EYES_HOME to the
   env: the tool stays neutral-less (its default is `.eyes/`); gistory's
   lane and gate carry the labs/.eyes constant, and the EYES_HOME knob
   flows through `--manifest`/`--ledger` exactly as now.
3. **`web/`** stays a subtree with the prestruct rig shell; landing-site
   build for eyestruct.creadev.org is a post-tar job, same shape poststruct's
   DEPLOY.md section describes honestly ("not landed yet; no DNS before
   the build").

### What gistory keeps after eyestruct leaves

- `labs/.eyes/` (manifest + ledger + baselines) â€” GISTORY	ÜÈš\İX[ˆY[[ÜK˜]YšYYHUÈ˜]YH[™KØ]YHUÈœ˜[Y]ÛÜšÈØ]K‚ˆH[™H
[™HØ]JH™K\™\ÛÛ™HH^Y\İXİÓH8 %]\ÈBˆ\ÚËPˆÛÛ\[š[ÛˆÛÛ[Z]HXÛÜŞ\İ[HÙ\È’T”ÕÛÈHØ[YHÙ^BˆÛÛÈÙY\Ø][™ÈY\ˆ[İ™H^K‚‹HXœËØÜ˜\ÚYÙ\‹šœÛÛ˜[˜Y™™XİY8 %Ô‹X\ÚYÛÜšÈİ^\Ë‚‚ˆÈÈÙ\]Y[˜Ú[™È
HÛ™\İY\ŠB‚ŒKˆ
Š”[‹\İØ\[™HÜ›İ[™
™Y›Ü™H[H\ŠNŠŠˆÒTÕÔ”‰ÜÈ˜]YH[™Bˆ\š]™\ÈÚ›ÛYH™\œÚ[Ûˆœ›ÛHHX[šY™\İ
›È\™ÛÙY[X™\ŠK[™ˆH^Y\ÈÛYH\ÈÛ™HVQT×ÒÓQHÛÛœİ[[ˆ›İØ]H[™[™KˆTÂˆÚ[™ÙHšY\ÈÒTÕÔ–HÙ^H
\ÚÈŠHÛÈ[İ™H^H\È›İØ]YÛˆBˆX[X[]™]Üš]K‚Œ‹ˆ
Š‘UTSˆ[™[ÜH^NŠŠˆ[\ˆ›İ[İ[È[Èœ™\ÚÛÛ™\ÈÙ‚ˆ]\[‹ÜÜİİXİ[™]\[‹Ù^Y\İXİÈ\ÚH™\İY™Ú]ˆ\İÜšY\ÈÈH™[[İ\È
HĞSQH\İÜšY\È]šYHH\ŠN‚ˆHÙÜİİXİ\İYÚ[™È	‰ˆÚ]™[[İHYÜšYÚ[‚ˆÚ]Ú]X‹˜ÛÛN™]\[‹ÜÜİİXİ™Ú]	‰ˆÚ]\ÚÜšYÚ[‚ˆPQ›XZ[˜ˆHÙ^Y\İXİ\İYÚ[™È	‰ˆÚ]™[[İHYÜšYÚ[‚ˆÚ]Ú]X‹˜ÛÛN™]\[‹Ù^Y\İXİ™Ú]	‰ˆÚ]\ÚÜšYÚ[ˆPQ›XZ[˜ŒËˆ
Š”İ[™[Û™H˜]\šY\ÈÜ™Y[ˆÛˆÒ]XŠŠˆXXÚ™\ÉÜÈÒHÛˆ]ÈİÛ‚ˆXZ[ˆ8 %ÜİİXİˆœHÚH	‰ˆœH\İ
\İ[[
H[™^Y\İXİ‚ˆH™]È\İ[[
ÈœH[ˆÚXÚØ
ØÜÈØ]\È[™XÚÜİXİˆÛÛ™›Ü›X[˜ÙJKˆHœH[œİ[]\İİ^H\›Y]XÈ8 %œHÚXYØZ[œİˆHÚ\YØÚÙš[H
ÜİİXİ	ÜÈØÚÎˆHPˆXÚÜİXİY^Xİˆ[È^Y\İXİˆ]ÈØÚËZ[HØ[YH^JK‚ˆ
ŠÛÛœİ[Y\ˆİØ\[ˆÒTÕÔ’NŠŠˆœ˜[Y]ÛÜšÈØ]H
È˜]YH[™HİÚ]Úˆœ›ÛHÜİYÚ[™ËØ]ÈÈœH™\ÛÛ][Ûˆ
œÜİİXİKŒ8 )˜ˆœ^Y\İXİKŒ8 )˜
H8 %™]™\ˆ˜\™HœÈ™\œÚ[Ûˆ™]™X[ÈHš[™[™ÂˆÙ]ˆHİYÚ[™È™Y\ÈÕVH[[\ÈÛÛ[Z][œÈÜ™Y[ˆ[ˆÒKÛÂˆHİØ\™\šYšY\ÈYØZ[œİH[›š[™ÈİYÚ[™È™YHÛ™HÛÛ[Z]]Bˆ[YK‚Kˆ
Š”İYÚ[™È[İ[ÈX]™NŠŠˆY\ˆHİØ\›İ™\ÈÜ™Y[ˆ[ˆÒTÕÔ–HÒKˆH\İYÚ[™ËØ\œÈÛÛYHÕU
Û™HÛÛ[Z]\ˆ™YJH[™ÒTÕÔ–IÜÂˆ˜]\HØZ[œÈ™\›Îˆ[YÜÈ™\ÛÛ™Yœ›ÛHHX›\ÚYÓ\Ë‚‚ˆÈÈÛ™\İ™YÜ™\ÜÚ[ÛœÈÈØ]Ú
Hš\ÚŞHš]ÊB‚‹H
Š]Y]YY™ŠŠ‚ˆ^Y\İXİ	ÜÈ˜\İ\ˆYÈØ]\ÈÒTÕÔ–IÜÈÜ˜Ü^İÛ™\È
È˜]šXÛÛÈÛ‚ˆ^x &\ÈİØ\ÜÙH]È\™HÒTÕÔ–K\™[]]™H[™]\İ™H™Y\ÈT‘Õ‚ˆ
^H[™XYH\™H8 %^Y\İXİ˜\İ\ˆÙš[K‹‹—X
HÛÈHİØ\\ÈBˆ]\™İ[Y[Ú[™ÙK™]™\ˆHÛÛÚ[™ÙK‚‹H
Š‘š\›]Ø\™K[ØÚÈšYŠŠˆÜİİXİ	ÜÈXÚÜİXİKŒŒ[™ˆ^Y\İXİ	ÜÈXÚÜİXİKŒŒÚİ[[\ÑÑUTˆÚ]HÔTÒTÕˆ
ÈS‹ˆHXÛÜŞ\İ[IÜÈ^Xİ\[ˆ\ØÚ\[™HÙ]ÈHÛÛ\[š[Û‚ˆ™XÙZ\›İÈØ^Z[™ÈH›İ\ˆ[œÈX]ÚYÛˆŒ‹LLLˆ8 %H]\ˆ[\ˆ\ÈH[X™\˜]K™XÙZ\Y]™[\ˆ™\Ë‚‹H
Š“]ÈÙ˜ÛÛÛˆ›İ[™ÈÙ[‹ZX[ËŠŠˆYˆHİ[™[Û™H˜]\H\Ù\Âˆ™Y]\ÈH™Y[™H[ˆH™\È]İÛœÈ]8 %ÒTÕÔ–HØ\œšY\È›ÂˆÚ[[\İØ\˜[˜XÚÜÈ[™™]™\ˆ[Ù]Ú\™HY\ÈH•U