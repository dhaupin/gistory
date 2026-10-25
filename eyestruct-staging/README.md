# eyestruct

Eyes for production agents. Deterministic capture (`look`), pixel-level
change comparison (`diff`), and a committed visual memory (`.eyes/`) that
CI can gate - the crashtest ledger pattern aimed at appearance instead of
attackability.

Process-per-look: every command is one short invocation; the only state
that survives between looks is git state.

```
eyestruct init --browser-image ghcr.io/.../chromium:TAG --renderer resvg@2.6.2
eyestruct look <url> --region "main"          # one crop + element-id map, ledger row
eyestruct diff --route home                   # fresh capture vs committed baseline
eyestruct gate                                # CI: exit 1 on unexplained .eyes/ drift
```

## The spine

| Layer | What it is |
|---|---|
| `.eyes/manifest.yml` | pin (browser image + renderer) + route x viewport x theme matrix |
| `.eyes/<route>/<view>-current.png` | committed baseline (canon is CI-cut) |
| `.eyes/ledger.json` | append-only rows; a diff without a row fails the pass |
| `eyestruct gate` | the CI job: unexplained drift is red, adopt-by-rerun is the flow |
| packs | adversarial probes over the daemon (eye-shapes) + the gate spine itself |

Full product definition: [labs/prd-eyes.md](labs/prd-eyes.md).

Status: 0.9.0 in staging. Browserless spine (init/manifest/ledger/gate/
adopt/raster) is live and tested; capture wiring lands with the pinned
browser image per the MVP cut.
