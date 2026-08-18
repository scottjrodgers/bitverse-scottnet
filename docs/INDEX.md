# Bitburner Automation Project — Index

Start here. This project automates hacking, hacknet, corporation, gang, and Singularity play in Bitburner (BitNode 3) via a set of cooperating daemon scripts. Everything below was produced through an iterative spec-then-build process: every work package is fully specified before any code is written, and every implementation ships with a paired verification script whose real in-game output gets reported back before the next work package starts. If you're Claude Code picking this up fresh, read in the order below — don't jump straight to a subsystem spec without the three foundational docs first, since every spec assumes their conventions rather than restating them.

## Read first, in this order

1. **`engineering-standards.md`** — code style, documentation requirements, error handling philosophy, and the Verification Protocol (the single most important section: every work package ships a `verify-*.js`, non-destructive by default, with defined expected output, meant to be run in-game and reported back before moving on).
2. **`data-contracts.md`** — exact JSON schemas for every shared `/data/` file (`config.json`, `budgets.json`, `status/*.json`), plus the script directory/file-layout convention (which folder each script lives in) and the `null`-vs-missing-field convention for budgets.
3. **`bitburner-automation-architecture.md`** — the master architecture doc: north star, control-plane/data-plane orchestration model, per-subsystem high-level design, component diagram, and the original build order (§8) that the work packages below refine.
4. **`spec-logging.md`** — the shared `logginglib.js` library every subsystem uses for operational event logging. Foundational like `coordinatorlib.js`, so it's listed here rather than in the subsystem list below.

## Work package specs, in build order

Each entry: what it builds, what it depends on, current status.

| # | Spec file | Builds | Depends on | Status |
|---|---|---|---|---|
| 1 | `spec-coordinator.md` | `coordinator.js`, `coordinatorlib.js` | (nothing subsystem-specific — first thing built) | Speced, not yet implemented |
| 2 | `spec-pull-tool.md` | `pull-data.js` (local Node tool, **not** an in-game script) | Remote API connection already set up for push-sync | Speced. Can be built any time after #1 — worth having early since every later step's verification loop depends on getting output back reliably |
| 3 | `spec-hacking.md` | `worker-hack.js`/`worker-grow.js`/`worker-weaken.js`, `hackinglib.js`, `prep.js`, `batcher.js` | `coordinator.js` (RAM budget), `logginglib.js` | Speced (full rewrite from the original ad hoc prototype), not yet implemented |
| 4 | `spec-hacknet-manager.md` | `hacknet-manager.js` | `coordinator.js` (money budget) | Speced, not yet implemented |
| 5 | `spec-singularity-agent.md` | `singularity-agent.js`, `bootstrap.js` | `coordinator.js` | Speced, not yet implemented |
| 6 | `spec-gang-manager.md` | `gang-manager.js` | `coordinator.js` (money budget), watches `singularity.json` | Speced, not yet implemented |
| 7 | `spec-corp-manager.md` | `corp-manager.js` | `coordinator.js` (money budget), watches `singularity.json` | Speced, not yet implemented |
| 8 | `spec-set-priority.md` | `set-priority.js`, `verify-set-priority.js` | `config.json` must already exist (created by `coordinator.js`) | Speced, not yet implemented |
| 9 | `spec-bladeburner-manager.md` | `bladeburner-manager.js` | `coordinator.js` (RAM/money budget), watches `singularity.json`; combat stats already confirmed at/near the 100/100/100/100 join requirement | Speced, not yet implemented |
| 10 | `spec-stock-trader.md` | *(not yet written)* | `coordinator.js` | **Deferred to phase 2** — explicitly out of scope for the current build |

Note on ordering: #2 (`pull-data.js`) doesn't have to be strictly sequential — it's listed early because you'll want it working before you're several work packages in and trying to debug something without a reliable way to get logs back. Everything else roughly follows the dependency graph (coordinator first, since nothing else can read a budget that doesn't exist yet; hacking/hacknet/singularity/gang/corp are otherwise independent of each other and could in principle be built in a different order if priorities change).

## Operational docs (read after implementation, before you flip anything on for real)

- **`rollout-checklist.md`** — the order to *activate* subsystems against your real save (distinct from the build order above), with a go/no-go check and kill-switch reminder at each step.

## Conventions quick-reference

- **Kill switch**: `config.subsystems.<name>.enabled = false` — coordinator zeroes that subsystem's budget, the daemon idles rather than exits.
- **Verification loop**: implement → run `verify-*.js` in-game → paste raw output back → compare against the spec's "expected output when correct" → fix or proceed. Never mark a work package done on "the code looks right" alone.
- **Trust real numbers over formulas**: anywhere this project cites an external or derived formula (production multipliers, hacknet ROI, ascension gain), treat it as a starting estimate to be corrected by real in-game measurement, not a fact. This discipline exists because it already caught a ~4x-wrong formula once during design.
- **Hybrid autonomy**: `corp-manager.js` and `singularity-agent.js` both act autonomously on routine/reversible decisions and write to a `*-recommendations.json` file instead of acting on structural/high-stakes ones. Same pattern, different trigger conditions — see each spec's own "hybrid autonomy" section.
- **BitNode-ending actions are never autonomous**: `singularity-agent.js` excludes `b1tflum3`/`destroyW0r1dD43m0n`, and `bladeburner-manager.js` excludes any BlackOp on `config.subsystems.bladeburner.neverAutoBlackOps` (default: `Operation Daedalus`). Both write a recommendation instead of acting. If a future subsystem ever touches another irreversible, BitNode-ending mechanic, it should follow this same pattern by default, not need to be told to.

## What's genuinely still open

- `spec-stock-trader.md` doesn't exist yet — deferred by explicit choice, not an oversight. Revisit once the phase-1 subsystems are running and validated.
