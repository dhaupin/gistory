# structure.md (target repo skeleton — settles on first open)

NYI. Planned shape from the PRD (keep honest; adjust by working):

```
magpie/
  daemon/            # eye daemon: playwright-consumer, annotator, diff
  mcp/               # MCP stdio tool surface over the same functions
  columns/           # blind-spot adapters, one per unknown sense (svg first)
  .eyes.schema/      # manifest.yml + ledger.json writers/readers
  tests/             # fixtures: one demo surface per column; behavioral only
  docs/
  labs/              # prd lives here (canonical), TASKS.md rolling log
 models/private/magpie/   # THIS brain (never shipped in the package)
 horcrux/                 # stones
```

House APIs worth reusing verbatim: pure ledger writers with a single
adopt point; deterministic diffs (no env-flaky pixel maths — Playwright's
own docs warn baselines are OS/GPU sensitive, so magpie diffs run inside
ONE pinned browser image from day one).
