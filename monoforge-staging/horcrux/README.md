# horcrux - monoforge (staging mount)

## The provisioner stone (upstream-owned)

The minted origin stone `monoforge-p_monoforge2026-a3uDX.svg` stays owned
by its home repo: `dhaupin/monoforge` (horcrux/, upstream f8e45fb) and
the creadev workspace stone registry. It deliberately does NOT ride the
gistory mount — a 3.3MB binary hand-transported through a payload lane
that already proved it corrupts at that class of size is a risk, not a
receipt; and the stone's home never condemned it to travel. Restore:
`vant horcrux restore <stone> <password>` — the password is embedded in
the filename after `p_` (the house convention).

## The lock archive (the mount's source of truth)

`monoforge-0.9.0-lock.tar.gz` is not just an archive: it is the SOURCE OF
TRUTH the mount's tool tree derives from. The gistory landing for this
mount is tarball-first (the 0.9.0-lock was transported wrapped and its
sha256 gated), then the ferry unpacked the tool tree beside it — so the
mount tree and its lock archive can never drift apart silently. Any
future tool change re-cuts a new lock first, then the tree follows it.

    sha256 = 046908c681a607d355925146234c7d4adf3726581a2e8799544954d7c4cf2952
    (re-measured on this pass; the factory PRD's `357017ee…` line is a
    different cut lineage, not this lock)

Bonus fact from the unpack: the 0.9.0-lock also carries monoforge's own
nested `.git` — the real upstream history rides INSIDE the archive, so
move day can push that history to dhaupin/monoforge instead of
flattening it (the same provenance rule the eyestruct tar-move keeps).

- owner: dhaupin/monoforge (standalone repo, dhaupin-side; the mount is
  the staging tree that tar-moves over at move day)
- PRDs: labs/prd-factory.md (the factory) + labs/prd-creadev-mono.md
  (the first component-family customer)
