# poststruct 0.9.0

**Audit what shipped.** A zero-dependency CLI that walks a directory of baked
HTML (any generator's output) and verifies it against a head/site contract.
FAIL findings exit non-zero so CI gates regressions.

Where the family sits: prestruct puts SEO in before the build (source-time),
freestruct injects after an SSG, and poststruct checks the baked artifact
that both of them (and everyone else) actually shipped.

Core law: **files on disk only.** No SPA runtime, no scraping, no source
linting. The fence is timeless by construction.

## What 0.9.0 audits

`npx poststruct audit [dir]` (default `dist`):

```bash
npx poststruct audit dist/          # human output, one line per finding
npx poststruct audit dist/ --json    # {schema: 1, counts, findings}
```

- **head module** (per page): title present + length band, description
  present + band, canonical present + absolute, OG(7) + Twitter(4) sets,
  og:image raster-format (an SVF og:image FAILs: most social scrapers
  cannot render it), og:image dims, JSON-LD parses + LocalBusiness
  recommended fields, h1 sanity. A 404 keeps only its noindex contract.
- **site module**: sitemap.xml exists + has <loc> entries + lastmod, and
  robots.txt points at the sitemap with `Sitemap:`.

Exit codes: `0` clean or warns-only, `1` any FAIL, `2` usage/environment
error (no directory to walk). Planned modules (links, i18n, a11y-lite,
language, feeds) are tracked in `docs/checks.md` and land per the PRD.

## Fixtures (the negative test is permanent)

```bash
npm test
```

The corpus is `test/fixtures/good` (must audit clean) and
`test/fixtures/bad` (must hit EXACTLY the expected FAIL ids, warns included).
Deleting or degrading a check breaks the test - that is the point.

## Packs (realized)

The `/packs` mount follows the shared
packstruct]https://github.com/dhaupin/packstruct) SPEC v1, check profile:
Fpublic/&cnc;/pack./pack.js