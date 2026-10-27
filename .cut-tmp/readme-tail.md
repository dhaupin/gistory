[packstruct](https://github.com/dhaupin/packstruct) SPEC v1, check profile:
`packs/public/<name>/pack.json` + entry exporting `{ checks: [...] }`, ids
namespaced by pack slug, and the config `packs:` entry as the arm. The
loader is realized here: `packs/public/eye-reference/` ships the
reference-shape pack, the pack lane runs as the discoverable wrapper verb
`poststruct lint-packs [--deep]` over the repo's own packstruct install
(exact 1.0.0 devDependency pin), and the CI battery (`npm run check`)
carries the deep lint plus `npm run conform:packs`, which proves the
loader itself conforms. Future shape packs keep landing per the PRD.

## Release ladder

0.9.x is the manual `npm publish` ladder; `publish.yml` refuses 0.x at the
gate. 1.0.0 flips OIDC trusted publishing (`id-token: write`). See
[DEPLOY.md](DEPLOY.md).

## Landing & docs

- Landing: `poststruct.creadev.org` - Cloudflare Pages, `wrangler.toml`
  pins `pages_build_output_dir = "dist"`; the pages build itself lands with
  the prestruct `/example`-based rebrand (its baked output is also my own
  first audit target). `functions/api/health.js` ships the `/api/health`
  canary now.
- Docs: `docs.creadev.org/poststruct` - Jekyll + Pagefind + Freestruct
  via GitHub Actions (`.github/workflows/docs.yml`).

## Related

- [prestruct](https://github.com/dhaupin/prestruct) - source-time audit, my upstream sibling
- [freestruct](https://github.com/dhaupin/freestruct) - post-SSG injection, my other sibling
- [crashtest](https://github.com/dhaupin/crashtest) - transport-level adversarial testing
- [packstruct](https://github.com/dhaupin/packstruct) - the shared packs spec
  (pinned 1.0.0 as an exact devDependency here; `npm run conform:packs`
  proves the pack loader itself conforms - 8/8 audit cases honored)
