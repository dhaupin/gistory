---
version: '1.0'
permalink: /
layout: default
title: Home
nav_order: 1
---

# Gistory

Gistory is a personal prompt manager that runs in your browser with no
account. Write a prompt once — with `{{ '{{' }}variable{{ '}}' }}` placeholders —
then find it in a keystroke and copy it with the variables filled in, ready to
paste into any AI tool. Optional sync keeps every device in your chain
converged, and the whole thing is end-to-end encrypted: the sync relay stores
ciphertext it cannot read.

Everything lives on-device first (IndexedDB with a localStorage fallback), so
the app works offline and your data is never locked in — a full JSON export is
one click away in Settings.

## Where to go next

- **[Getting started](/gistory/getting-started)** — write your first prompt,
  fill your first variable, pair a second device.
- **[Features](/gistory/features)** — tags and projects, forks, drag ordering,
  the command palette, timestamps, import/export.
- **[Sync & Security](/gistory/sync-and-security)** — how end-to-end
  encryption, merging, and the relay's guarantees work.
- **[The gistory-sync npm package](/gistory/npm)** — the same sync engine the
  app runs, packaged for reuse.
- **[FAQ](/gistory/faq)** — accounts, passphrase loss, offline behavior,
  data export.

## Key facts at a glance

| Question | Answer |
|----------|--------|
| Account required? | None. Passphrase + pairing code instead. |
| Platform | Any modern browser. Hash-routed SPA. |
| Sync | E2EE chain devices (AES-GCM + passphrase-derived key). |
| Server can read prompts? | No — it stores ciphertext it cannot decrypt. |
| Data export | Full JSON import/export in Settings, merges by id. |
| Open source | Yes — [dhaupin/gistory](https://github.com/dhaupin/gistory). |
