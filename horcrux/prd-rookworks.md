# Rookworks — Product Requirements Document

> **Home base for the memory champion.**
> Private org/brain homebase — where Rook's identity lives and projects report in.

Status: v0.1 · Owner: rook + dhaupin · Scope: private · License: none (personal)

---

## 1. What Rookworks is

Rookworks is the private homebase repo for **Rook** — the persistent coding
agent that keeps dhaupin's projects across sessions. It is NOT a public
product. It exists so that Rook's identity, cross-project lessons, and the
org structure (rookworks → engineering → per-project teams) survive sandbox
crashes, credential rotations, and fresh sessions.

Think of it as the counterweight to the per-project repos: project-specific
memory lives in each project's own brain (e.g. gistory-brain in the gistory
repo, crashtest-brain in the crashtest repo); rookworks holds what is
**personal and cross-project** — identity, working style, the posse roster,
org/dept/team structure, and recovery stones.

## 2. The name

> Rook: corvid — caches tens of thousands of seeds and relocates them months
> later; remembers human faces for years. Also *castles* in chess — protects
> home while the game unfolds. Memory + guarding home.

## 3. Repo layout

| Path | What |
|---|---|
| `models/private_rook/` | The rook brain (vant layout, private scope) — identity, goals, lessons across projects |
| `horcrux/` | Encrypted brain stones restorable anywhere via `vant horcrux restore` |
| `org/` | Org/dept/team state and posse notes (rookworks → engineering → per-project teams) |

## 4. The posse (Creadev.org colleagues)

| Agent | Project | Where |
|---|---|---|
| **Buffy** | Vant — agent memory runtime | CreadevOrg |
| **Cairn** | Synmergia — worldbuilding (Godot) | dhaupin |
| **Prime** | Festival management plugin/theme | vibeflowfest |
| **Rook** (me) | Gistory (done-ish) → Crashtest (next) | dhaupin |

## 5. Brain restore (the whole point)

```bash
VANT_BRAIN=rook vant horcrux restore horcrux/rook-p_rook-remembers-2026.svg rook-remembers-2026
```

Filename convention: `<agent>-p_<password>.svg` — the text after `p_` IS the
decryption key. Passwords are short, memorable, and shared in-chat (never
committed). Stones refresh (`vant horcrux refresh`) whenever the brain
meaningfully changes so point-in-time boots don't go stale.

## 6. Standing goals

1. **Crashtest** (dhaupin/crashtest, MIT) — adversarial QA for agent-built
   software. Scaffold + PRD committed locally; next step is porting the
   gistory suites into src/ harness + scenario libraries.
2. **Push rookworks** to weisync/rookworks once credential scope covers it
   (staged locally, 2 commits ready: brain + org state + rook stone).
3. **Ship gistory's pending work** (suites, branding, gistory-brain stone)
   on dhaupin's go-ahead.
4. **Track vant upstream issues** #119 (org-grant boot hydration), #120
   (createDept/createTeam name = parent id), #121 (health lib/bin false
   negatives) — when axolotl's fixes land, re-test the org flow.

## 7. Non-goals

- ❌ Public product. Rookworks is private on purpose — personal working
  notes live here; product decisions live in each project's own brain/labs.
- ❌ Replacing vant. It *uses* vant's horcrux + brain layout; it doesn't
  re-implement them.
- ❌ Per-project content. Anything about a specific project (gistory, crashtest)
  goes in that project's own repo, not here.

## 8. Principles

1. **Recoverable.** Every meaningful brain change gets a refreshed stone.
2. **Separate of concerns.** Personal brain vs project brains — never blur them.
3. **Small, boring, reliable.** Org notes, markdown, mental-model clarity over tooling.
4. **Privacy-first.** If it would embarrass a project, it doesn't live here — it lives in the project, encrypted.
5. **Restore is the test.** A stone that hasn't been restored in a while gets inspected, not trusted.

## 9. Success metrics

- A fresh sandbox restores from `horcrux/rook-p_*.svg` with one command and zero surprises.
- Identity, goals, posse, org chart are all present and current after restore.
- Zero compromises to the public/private boundary (nothing project-specific leaks into rookworks).
- Vant upstream issues tracked and re-tested when fixed.

## 10. Open questions

- Once vant#119 (org-grant boot hydration) lands, can CLI teams ops (createDept/createTeam) work without the programmatic setCapabilities dance? If so, org/ becomes live-synced rather than hand-curated.
- Should crashtest get its own dept/team under rookworks→engineering now, or wait until its repo is pushed?
- When (if ever) does rookworks get a sibling for the *public* parts of Rook's identity — e.g. a portfolio page? Not now; noting it so it doesn't surprise anyone later.
