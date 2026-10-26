# DEPLOY.md - monoforge release runbook

monoforge is an npm tool. Deploy = publish. Ladder follows the fleet
convention: 0.9.x manual (`npm publish`), 1.0.0 tagged (publish.yml,
OIDC provenance, refuses 0.x refs). Release atomicity per crashtest#20:
CHANGELOG `[Unreleased]` flips in the tag commit; never a docs-only patch.

## npm prep
- Registry name **monoforge** is free (checked 2026-10-24, npm 404).
- `npm pack --dry-run` before publish: files whitelist is `bin/`, `src/`,
  `templates/` so `npx monoforge new` works from a fresh install.

## Landing & docs
- monoforge is a tool; the landing/docs pattern applies when it earns one
  (template blocks are its own inventory: `forge new` + fill slots).
