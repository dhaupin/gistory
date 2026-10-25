# labs/TASKS.md - poststruct

Last updated: 2026-10-24 (scaffold complete at 0.9.0; push pending crashtest#18)

## Now
- [ ] PUSH to GitHub: the scaffold is complete, the repo exists on GitHub,
      and push is 403 for freebuff-web[bot] (permission only, not not-found).
      Blocker filed as crashtest#18: Rook reconnects the repo to the
      Freebuff app, then the tree paints as-is.
- [ ] Manual 0.9.0 npm publish the day the push lands (npm prep: a machine
      with npm credentials; DEPLOY.md is the runbook).

## Next (M1)
- [ ] Pack loader in core (packstruct SPEC v1, check profile): manifest
      validation, slug-namespaced ids, collision refusal. Local paths only.
- [ ] links module: internal link graph vs files present + `_redirects`;
      renamed route fails CI.
- [ ] First shape packs: wp-seo-shapes, jekyll-shapes, prestruct-shapes,
      freestruct-shapes (the engines' CI gains its guarantee through me).
- [ ] Optional `--check-external` link validation (network gate, opt-in),
      and re-add the scheduled weekly `linkcheck.yml` alongside it (removed
      at lock time: the 0.9.0 workflow called a CLI mode that did not
      exist, so it would have failed CI on the first push).

## Later (M2+)
- [ ] i18n + a11y-lite + language modules (dash classes, cliche lexicon,
      per-org voice packs), feeds module, npm-source pack loading.

## crashtest lane (deferred, with trigger)
- [ ] poststruct-site-shapes pack (crashtest scenario lane,
      crashtest.config.js + packs/public/) - trigger: the prestruct-example
      landing build exists. Surface to attack then: the /api/health Pages
      Function (in-process, prestruct-proxy precedent) + the baked tree via
      a static-site double (freestruct-docs-shapes precedent). Until then
      there is no transport surface worth an attack; the audit surface is
      covered by the negative-tested fixtures (8/8 expected FAIL ids).
