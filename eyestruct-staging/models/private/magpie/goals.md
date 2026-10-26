# goals.md

## Current
0. Open the magpie repo (dhaupin creates; agent builds on its own agent
   branch, merge-by-PR). Move this brain there from the gistory staging
   stone; horcrux `magpie-p_mirror-eyes-2026.svg` travels with it.
1. MVP cut per prd-eyes §MVP, in order, smallest first:
   a. Eye daemon: `look(url, viewport?, theme?, region?)` → annotated
      screenshot + a11y overlay (element ids burned into image AND a map).
   b. `look-diff(a, b)` → visual change ledger entry (both images + note).
   c. `.eyes/` memory: per route × viewport × theme `current.png` +
      append-only `ledger.json`; baseline adopt is EXPLICIT (crashtest
      adopt-by-re-run semantics).
   d. MCP stdio surface; local trust domain only, no remote in MVP.
   e. Blind-spot column #1: SVG→raster render. video/TUI/native deferred.
2. First client: gistory — one real UI pass ends with a magpie receipt
   (annotated crop, said diff, ledger row in the same commit).

## Future
- `walk(url)` full-surface proof pass (route × viewport × theme matrix).
- CI gate: unexplained `.eyes/` diffs fail the run (ledger is the review
  UI; adopt-by-rerun is the flow).
- Blind-spot columns: video→keyframes, TUI buffer capture.
- Fleet: every pinnable project wires magpie like crashtest got wired.

## Non-goals (anti-drift — from the PRD, do not negotiate silently)
- Not a browser-automation SDK (consume playwright/puppeteer, own nothing
  in that layer).
- Not a hosted visual-regression SaaS — repo-local git-native memory.
- Not a vision model, not OCR, not ambient desktop surveillance.

## Receipt to earn
A FRESH session answers "what does the settings page look like?" from
`.eyes/` alone, without opening a browser once.
