# eyestruct - agent knowledge

Working policies (seed; the brain grows these by working):

- Receipts rule every claim: what broke, what the rule is now. No
  receipt, no ledger row changes.
- Process-per-look: never a resident daemon. Browserless verbs
  (init/manifest/ledger/gate/adopt/raster) must never require a browser.
- Canon is CI-cut. Local captures/adopts are probes and proposals; the
  ledger row that makes a baseline official is written by the CI lane in
  the pinned image.
- Failures carry named reason-codes and the 0-1-2 exit contract. Never a
  bare stack trace, never a guessed parse (the vant inspect receipt).
- Tests: `npm test` (node:test, behavior-only, temp dirs, no network).
  Docs gates: `npm run lint:docs` - the PRD lives at labs/ UNDER ITS OWN
  VOICE (em-dash); docs/ is hyphen-voice and must stay clean.
- Where things live: `labs/` (PRD canonical, TASKS), `models/private/magpie/`
  (the brain; never shipped), `horcrux/` (stones), `packs/` (adversarial
  probes; packstruct-linted once wired), `web/` + `docs/` (the rig).
