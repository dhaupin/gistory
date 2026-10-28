---
permalink: discussions/announcing-v0.9.0
layout: default
title: Announcing v0.9.0
description: v0.9.0 ships the factory spine - the stamp verb, the truth battery, the doctor-gated lock, and the template blocks cut from two proven fleet repos.
version: 0.9.0
---

# Announcing v0.9.0

monoforge is the struct-family factory. It stamps a new repository from template blocks proven in the deployed fleet, doctors the result with a truth battery that refuses placeholder text and broken gates, and locks the tree behind a checksum. v0.9.0 is the release where that spine runs end to end, installed from npm like every other dev dependency in the family.

## Install

```shell
npm install --save-dev monoforge
```

Then the first factory pass:

```text
npx monoforge new ./my-tool
npx monoforge doctor ./my-tool
npx monoforge lock ./my-tool
```

## What ships

- **`new` stamps a fleet repo.** The template blocks covered the docs system with its four ported gates, the CI workflows including the 0.x refusal in the publish ladder, the functions canary, and the wrangler contract. `factory.json` supplies the identity, and bad configs or a non-empty directory are refused rather than half-created.
- **`doctor` is the truth battery.** Git state, unfilled `FORGE-TODO` slot scans, package.json sanity (bin, exports, files paths), the publish workflow's 0.x refusal, the test suite, the docs gates, and the em dash law. Generated green is never shipped: anything that fails stops the factory instead of printing a warning into a passing tree.
- **`lock` archives behind a checksum.** Doctor first, then a sha256 record plus the archive file - a failing doctor refuses the lock, so an archive is only ever a receipt for a green tree.
- **Templates cut from proven instances.** Every block in `templates/` was extracted from real deployed fleet repos on 2026-10-24, not written fresh, so a stamped repo starts from something that already shipped.

## The release ladder

0.9.x is the manual npm ladder; `publish.yml` refuses 0.x versions at the gate, and 1.0.0 flips npm Trusted Publishing (`id-token: write`). The full runbook lives in DEPLOY.md in the repository.

## Where to go next

- [Verbs](/monoforge/verbs) - every command and its playbook
- [Packs](/monoforge/packs) - the pack lint lane
- The repo with the full truth battery is [dhaupin/monoforge](https://github.com/dhaupin/monoforge)
