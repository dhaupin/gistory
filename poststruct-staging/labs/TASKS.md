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

## 2026-10-26 - completion sprint (pre-move verification pass)

- Batteries re-run locally and green: npm test + lint:packs (1 pack) +
  conform:packs 8/8; the pack runner then LIVE-fired against a freshly
  baked gistory dist - the eyes-reference og:image leg PASSED through
  its local twin, and the framework gate's text/eyes-art/text-ref/
  eyes-mem legs all PASSED on the same build (the raster gate rode the
  renamed r1/r2 stones byte-stable).
- The tar-move plan's injected change #1 turned out to be already
  landed in the mount: run-packs.mjs carries POSTSTRUCT_DIST and
  EYESTRUCT_BIN knobs with the agreed resolution order (--dist, env,
  gistory-mount sibling, ./dist). Verified by reading, no edit needed;
  the npx-pinned flip for EYESTRUCT_BIN stays a post-publish event.
- No code changes this pass: the mount was already at its planned
  shape; this entry is the local-green receipt so move-day can skip
  re-verification.
