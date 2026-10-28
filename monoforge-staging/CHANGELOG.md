# Changelog

All notable changes to monoforge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- The `cut` verb: stamps a component-family workspace from a living lib per cutlist.json (components/<name>/ with intra-graph requires rewritten to scoped deps, per-package smokes + provenance CHANGELOGs + shortfall READMEs, root workspaces + test-all lane + stamp manifest for the doctor). Shortfall policy: lazies outside the cut must be DECLARED (documented degrade) or the cut refuses.
- Realized the first cut (creadev-lib, 7 packages from the vant lib).

### Fixed (found by dogfooding the cut)
- Declared workspace deps now key on scoped names (the bare-name form made npm install notarget).
- Root scripts dir is created before test-all lands; test-all imports node:path (join).
- The CLI used the verb token as the target dir for new/cut (argv 3 vs 2).

## [0.9.0] - 2026-10-24

### Added
- `monoforge new <dir>`: stamps a fleet repo from the template blocks (docs system with the four ported gates, workflows incl. the 0.x refusal publish ladder, functions canary, wrangler contract), filling factory.json tokens and refusing non-empty directories and bad configs.
- `monoforge doctor [dir]`: the truth battery: git state, FORGE-TODO slot scan, package.json sanity (bin/exports/files paths), publish.yml 0.x refusal, npm test, docs gates, em dash law.
- `monoforge lock [dir]`: doctor-then-archive with sha256; refuses to lock a failing tree.
- `templates/`: blocks extracted from the two proven instances (poststruct + packstruct, 2026-10-24).
- Self-test: refusal paths + the doctor fail (unfilled) / pass (filled) pair.
