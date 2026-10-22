---
version: '1.0'
permalink: /faq
layout: default
title: FAQ
nav_order: 6
---

# FAQ

The same answers ship as FAQPage structured data on the product home page —
one answer per question, everywhere.

## Accounts and data

<details open>
<summary>Does Gistory need an account?</summary>
No. Gistory runs in your browser with no sign-up. Optional sync uses a
passphrase and a pairing code instead of an account.
</details>

<details>
<summary>Can the server read my prompts?</summary>
No. Prompts are encrypted on your device with AES-GCM before they are
uploaded, using a key derived from your passphrase. The relay stores
ciphertext it cannot decrypt.
</details>

<details>
<summary>Does Gistory work offline?</summary>
Yes. Your library lives on your device first; edits made offline are kept
locally and uploaded when the connection returns.
</details>

<details>
<summary>What happens if I lose my passphrase?</summary>
There is no reset. The passphrase never leaves your devices, so a lost
passphrase means the synced data cannot be decrypted by anyone. Keep a local
export from Settings as a backup.
</details>

## Using Gistory

<details>
<summary>How does {{ '{{' }}variable{{ '}}' }} template filling work?</summary>
Write a prompt with placeholders, then copy it. Gistory opens a small form
with one field per placeholder and puts the filled prompt on your clipboard.
</details>

<details>
<summary>Which devices can sync?</summary>
Any modern browser. One device creates the sync chain; every other device
joins with the pairing code and the same passphrase. Changes converge across
the whole chain.
</details>

<details>
<summary>Can I export my data?</summary>
Yes. A full JSON export lives in Settings, and the same screen imports a
backup back in — merging by id rather than duplicating. Your prompt library
is never locked in.
</details>

<details>
<summary>Is Gistory open source?</summary>
Yes — the app, relay, and sync engine are on
[GitHub](https://github.com/dhaupin/gistory), and the sync engine is also
published separately as the
[gistory-sync](https://www.npmjs.com/package/gistory-sync) package on npm.
</details>
