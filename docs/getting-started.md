---
version: '1.0'
permalink: /getting-started
layout: default
title: Getting Started
nav_order: 2
---

# Getting started

Gistory boots straight into the board — no signup, no install. This page walks
your first ten minutes.

## Write your first prompt

1. Click **+ Thread**. A thread holds one prompt — or a whole conversation of
   variations.
2. Give it a name that you will remember in six months, then write the prompt
   in the composer.
3. Use `{{ '{{' }}double braces{{ '}}' }}` for anything that changes run to run —
   for example `{{ '{{' }}language{{ '}}' }}` or `{{ '{{' }}codebase{{ '}}' }}`.
   Saved prompts keep a per-thread variable pool, and there is a global pool
   shared across every thread (the burger menu's Variables screen).

## Copy it filled in

Click **Copy** on a prompt with placeholders. Gistory opens a small form with
one field per variable — fill them (or accept defaults from the variable
pool) and the completed prompt lands on your clipboard, ready for any AI
chat or editor.

## Organize

- **Tags** group loosely related prompts; **projects** group them more
  formally. Both appear in the sidebar, the header search, and the
  `Cmd/Ctrl+K` command palette.
- **Fork** a prompt to iterate: the original stays put, the variant gets its
  own identity, and both remember their lineage.
- **Drag** rows into whatever order makes sense; pinned prompts always float
  to the top. Collapse what you are not reading.

## Sync a second device

1. Open Settings → **Sync** on the device that already has content.
2. Create a sync chain. Gistory shows a **pairing code / QR** — a pairing
   token carries the chain id and the write secret, never your passphrase.
3. On the other device, open the same screen and join by scanning or pasting
   the token, then enter the **same passphrase**. The encryption key is
   derived from your passphrase and the chain id, so both sides derive the
   same key and can read the same ciphertext.
4. From then on, edits push both ways; each side merges by
   newest-timestamp-wins, and deleted items carry a tombstone so deletes
   propagate too.

Optional: enable background sync so other devices wake and pull while your
current device is idle.

## Back up before you trust it

Settings → **Export** writes a full JSON archive of threads, projects,
messages, variables, and arrangement. Import merges by id rather than
duplicating. Keep a periodic export somewhere safe — it is the one file that
survives everything, including a forgotten passphrase.
