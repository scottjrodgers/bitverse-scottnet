# Data Contracts — Bitburner Automation Project

Exact schemas for every shared file under `/data/`. Every subsystem work package references this doc instead of inventing its own field names. If a work package needs a field that doesn't exist here yet, the work package spec must propose the addition explicitly (and this doc gets updated) rather than the implementation silently adding it.

All files include a `schemaVersion` (integer) field so future changes don't silently break older readers — a subsystem encountering an unexpected `schemaVersion` should log a loud warning and fall back to defaults rather than guess at a newer shape.

---

## Script Directory Layout

Every subsystem's specs so far reference filenames without a path prefix (`batcher.js`, `gang-manager.js`, etc.). This section is the single place that convention is pinned down, so Claude Code doesn't have to guess it independently per work package.

**Convention: one folder per subsystem, shared/cross-cutting files at `home` root, data under `/data/` (already established).**

```
/                            <- home root
  bootstrap.js                (entry point: initial launch AND post-install relaunch)
  coordinator.js
  coordinatorlib.js
  logginglib.js
  set-priority.js              (config.json editor, see spec-set-priority.md)
  verify-set-priority.js
  hacking/
    worker-hack.js
    worker-grow.js
    worker-weaken.js
    hackinglib.js
    prep.js
    batcher.js
    verify-hacking.js
  hacknet/
    hacknet-manager.js
    verify-hacknet.js
  corp/
    corp-manager.js
    verify-corp.js
  gang/
    gang-manager.js
    verify-gang.js
  singularity/
    singularity-agent.js
    verify-singularity.js
  bladeburner/
    bladeburner-manager.js
    verify-bladeburner.js
  stock/                      <- reserved, empty until phase 2
  data/
    config.json
    budgets.json
    status/<subsystem>.json
    logs/<subsystem>-events.jsonl
```

Rules:
- Every filename in every spec written so far (`batcher.js`, `gang-manager.js`, `verify-hacknet.js`, etc.) resolves to `<its subsystem's folder>/<filename>` per the table above. This doc is the single source of truth for that mapping — individual spec files are not being retroactively edited to add path prefixes, since that's pure busywork with no behavior change.
- `coordinator.js`, `coordinatorlib.js`, `logginglib.js`, and `bootstrap.js` live at root because they're cross-cutting, not owned by one subsystem — every other daemon imports `coordinatorlib.js`/`logginglib.js` via a relative `../` import from its own folder.
- Rationale for nesting over flat: with ~9 subsystems and 2-7 files each, a flat `home` directory would hold 25+ files with no visual grouping — nesting keeps each subsystem's files together, which matters for the "navigable by a friend" goal in `engineering-standards.md`.
- Any `ns.exec`/`ns.run`/`ns.scp` call referencing another subsystem's script must use the full path (`ns.exec("/hacking/batcher.js", ...)`), never a bare filename — bare filenames only resolve correctly for a script's own folder.
- When a script is copied to a remote RAM-donor server for execution (workers, in `spec-hacking.md`), the same relative path is preserved by `ns.scp`, so the RAM-donor server ends up with a `/hacking/` folder too, not a flattened copy. Worth confirming this is in fact how `ns.scp` behaves — flagged as medium confidence, easy to check with a one-line diagnostic per `engineering-standards.md` §6 if Claude Code is unsure.

---

## `/data/config.json`

**Written by:** you, via `set-priority.js` (or hand-edited directly). **Read by:** `coordinator.js` every cycle, and any subsystem that needs its own settings directly.

```json
{
  "schemaVersion": 1,
  "objectiveWeights": {
    "money": 1.0,
    "rep": 1.0,
    "hackingXp": 0.5,
    "augReadiness": 1.0
  },
  "subsystems": {
    "hacking": {
      "enabled": true,
      "ramSharePriority": 1.0,
      "numTargets": 5,
      "hackFraction": 0.5,
      "spacer": 200,
      "detailedLogging": false
    },
    "hacknet": {
      "enabled": true,
      "paybackThresholdSec": 3600
    },
    "corp": {
      "enabled": true,
      "autonomyLevel": "hybrid",
      "structuralApprovalThreshold": 100000000000,
      "testIncrementFraction": 0.25
    },
    "stock": {
      "enabled": false
    },
    "gang": {
      "enabled": true,
      "type": "combat",
      "territoryWarfareWinThreshold": 0.68,
      "ascensionMultiplierThreshold": 1.10,
      "wantedLevelThreshold": 1.0
    },
    "singularity": {
      "enabled": true,
      "augmentationPriorityList": [],
      "installBatchSize": 5,
      "installMaxWaitCycles": 500,
      "donateFavorThreshold": 75
    },
    "bladeburner": {
      "enabled": true,
      "neverAutoBlackOps": ["Operation Daedalus"],
      "chaosThreshold": 50,
      "lowStaminaThreshold": 0.5,
      "teamSize": 4
    }
  }
}
```

Field notes:

- `objectiveWeights.*` — non-negative floats, relative not absolute (a weight of 2.0 means "twice as important as a weight of 1.0," not a percentage). `coordinator.js` normalizes internally.
- `subsystems.<name>.enabled` — if `false`, the coordinator allocates that subsystem zero budget and the subsystem daemon (if running) should idle without acting, not exit — this lets you toggle things off live without killing processes.
- `ramSharePriority` — relative weight specifically for RAM allocation, separate from the general objective weights, since RAM contention is mostly a hacking-vs-everything-else question per the architecture doc's §2.
- `structuralApprovalThreshold` — dollar amount (number, not string) above which `corp-manager.js` must write to `/data/status/corp-recommendations.json` instead of acting autonomously.
- `corp.testIncrementFraction` — float, fraction of current owned quantity to buy when generating a fresh elasticity data point for an untested material. Default `0.25` (buy +25% of current stock). See `spec-corp-manager.md`'s explore/exploit reasoning for why this is proportional rather than a fixed unit count.
- `territoryWarfareWinThreshold` — float 0-1, minimum clash win probability required before `gang-manager.js` auto-engages.
- `gang.ascensionMultiplierThreshold` — float, minimum permanent multiplier gain (e.g. `1.10` = 10%) previewed via the ascension-result check before `gang-manager.js` ascends a member. See `spec-gang-manager.md` for why this isn't modeled as a dollar-cost payback period.
- `gang.wantedLevelThreshold` — float, wanted-level scale above which `gang-manager.js` temporarily reassigns members to wanted-reducing tasks. Explicitly flagged in `spec-gang-manager.md` as an unresearched placeholder default (`1.0`), meant to be tuned from real logged behavior rather than trusted as-is.
- `hacking.numTargets` — how many servers the hacking subsystem batches simultaneously. Live-adjustable: a running daemon should pick up a change on its next target-selection pass, not require a restart.
- `hacking.hackFraction` — float 0-1, fraction of a target's max money stolen per batch. See `spec-hacking.md` for why this is a per-target-independent knob, not per-batch-recomputed.
- `hacking.spacer` — ms gap between each of the four batch actions' completion times. Also live-adjustable; increasing it trades batch density for more timing safety margin, per `spec-hacking.md`'s drift-handling section.
- `hacking.detailedLogging` — default `false`. When `true`, worker scripts also report per-action outcomes (actual vs. predicted money/security effect) via `logginglib.js`, at the cost of added RAM per worker instance. Meant to be toggled on temporarily for a diagnostic session, not left on permanently at scale — see `spec-hacking.md`'s Logging section.
- `singularity.augmentationPriorityList` — array of augmentation name strings, in purchase-priority order. You curate this by hand; `singularity-agent.js` works toward and buys these autonomously, and anything it discovers that *isn't* on this list gets a recommendation, not an autonomous purchase — see `spec-singularity-agent.md`.
- `singularity.installBatchSize` — install once this many augmentations are queued, whichever comes first against `installMaxWaitCycles` below.
- `singularity.installMaxWaitCycles` — install whatever's queued (even below batch size) if it's been waiting this many daemon cycles, so a single hard-to-afford aug doesn't block the ones already queued behind it indefinitely.
- `singularity.donateFavorThreshold` — minimum faction favor before the agent considers donating money for reputation instead of working. Default `75`, reflecting BN3's halved favor requirement — revisit this number outside BN3.
- `bladeburner.neverAutoBlackOps` — array of BlackOp name strings that `bladeburner-manager.js` will never trigger autonomously, regardless of rank eligibility; always written to `/data/status/bladeburner-recommendations.json` instead. Defaults to `["Operation Daedalus"]`, the confirmed final/BitNode-ending BlackOp. See `spec-bladeburner-manager.md` for why this list — not a single hardcoded name in code — is the safety mechanism.
- `bladeburner.chaosThreshold` — city chaos level above which `bladeburner-manager.js` prioritizes the Diplomacy general action over contracts/operations. Default `50`, matching the game's own success-chance penalty threshold.
- `bladeburner.lowStaminaThreshold` — fraction (0-1) of max stamina below which the daemon switches to a stamina-recovery general action instead of contracts/operations. Default `0.5`.
- `bladeburner.teamSize` — default team size set for operations that support one. Default `4`, an unresearched starting guess — see `spec-bladeburner-manager.md`'s confidence notes.

## `/data/budgets.json`

**Written by:** `coordinator.js` only. **Read by:** every subsystem daemon, every cycle.

```json
{
  "schemaVersion": 1,
  "computedAt": 1234567890123,
  "subsystems": {
    "hacking": { "ramBytes": 500000000000000, "moneyBudget": null },
    "hacknet": { "ramBytes": 0, "moneyBudget": 5000000000 },
    "corp":    { "ramBytes": 0, "moneyBudget": 20000000000000 },
    "stock":   { "ramBytes": 4000000000, "moneyBudget": 0 },
    "gang":    { "ramBytes": 2000000000, "moneyBudget": 1000000000 },
    "singularity": { "ramBytes": 8000000000, "moneyBudget": null },
    "bladeburner": { "ramBytes": 2000000000, "moneyBudget": 1000000000 }
  }
}
```

Field notes:

- `computedAt` — epoch ms, so a subsystem can tell if the budget file is stale (coordinator crashed/hung) and fall back to a conservative default rather than trust an old number.
- `ramBytes` — hard ceiling in bytes (not GB) that the subsystem may allocate for its own script execution. `null` is not valid here; `0` means "none right now."
- `moneyBudget` — dollars the subsystem may spend this cycle. **Resolved convention:** an explicit `null` means uncapped (used for `hacking`, which doesn't spend money, and `singularity`, whose spend is gated by its own aug-purchase logic rather than a coordinator ceiling). A **missing** field — the subsystem's key isn't present in the file at all, e.g. because `coordinator.js` hasn't run yet, an older schema version predates a newer subsystem, or the file was hand-edited incompletely — must be read as `0`, never as uncapped. Every subsystem daemon's budget-reading code must implement this explicitly: `null` and "absent" are not interchangeable, and defaulting anything to uncapped is the wrong failure mode (safe-by-default means under-spending on a coordinator hiccup, not over-spending). In practice `coordinator.js` always writes explicit entries for all six subsystems every cycle (see `spec-coordinator.md`), so "missing" should only occur before the very first coordinator run.

## `/data/status/<subsystem>.json`

**Written by:** each subsystem, every cycle or on meaningful state change. **Read by:** `coordinator.js` (aggregates into `summary.json`) and other subsystems that need to react to a peer's state (e.g., `hacknet-manager.js` reading `singularity.json` for aug-install-imminent).

Common fields every subsystem's status file must include:

```json
{
  "schemaVersion": 1,
  "updatedAt": 1234567890123,
  "healthy": true,
  "lastError": null,
  "moneyPerSec": 12345.6
}
```

Plus subsystem-specific fields, appended alongside the common ones (not nested under a separate key):

- **`hacking`**: `activeTargets` (array of hostnames), `driftEvents` (count since start), `batchesInFlight` (int).
- **`hacknet`**: `hashesStored` (int), `hashProductionPerSec` (float).
- **`corp`**: `divisions` (array), one entry per division:
  ```json
  {
    "name": "CigFigs",
    "productionMult": 7.729,
    "lastMaterialElasticityWinner": "AI Cores",
    "bottleneckStage": "production_mult",
    "pendingRecommendations": 0
  }
  ```
  `bottleneckStage` is one of `"production_cap"`, `"upstream_supply"`, `"production_mult"`, `"employee_capacity"`, `"downstream_demand"` — the five stages of `spec-corp-manager.md`'s diagnosis chain, so this file alone shows what's currently constraining each division without reading the event log. `pendingRecommendations` is a count only; detail lives in `corp-recommendations.json`, not duplicated here.
- **`stock`**: *(phase 2 — schema TBD once that subsystem is speced)*.
- **`gang`**: `memberCount`, `respect`, `territoryPercent`, `territoryWarfareEngaged` (bool).
- **`singularity`**: `installImminent` (bool — the signal `hacknet-manager.js` and `corp-manager.js` watch for), `currentFactionFocus` (string), `augsPurchasedQueued` (int).
- **`bladeburner`**: `joined` (bool), `rank` (float), `currentCity` (string), `currentAction` (string, e.g. `"Field Analysis"` or the current contract/operation name), `nextBlackOp` (string, from `getNextBlackOp()`), `pendingRecommendations` (int count — detail in `bladeburner-recommendations.json`, same convention as `corp-recommendations.json`).

`/data/status/summary.json` — written by `coordinator.js` only, a flat rollup of every subsystem's `healthy`/`moneyPerSec`/`updatedAt` for a HUD script to `tail` without reading six files.

## `/data/status/corp-recommendations.json`

Only exists when `corp.autonomyLevel` is `"hybrid"` or `"recommend-only"` and there's a pending structural decision above the approval threshold.

```json
{
  "schemaVersion": 1,
  "createdAt": 1234567890123,
  "division": "CigFigs",
  "action": "purchase_material",
  "detail": "Buy 400 more AI Cores (~$X): current best space-adjusted elasticity, 0.032%/space vs next-best 0.008%/space.",
  "estimatedCost": 50000000000
}
```

A cleared/approved recommendation is deleted from the file, not marked "approved: true" — absence of the file (or an empty array, if multiple pending) means nothing's waiting on you.

## `/data/status/bladeburner-recommendations.json`

Same convention and shape as `corp-recommendations.json` above, written by `bladeburner-manager.js` whenever a BlackOp on `config.subsystems.bladeburner.neverAutoBlackOps` becomes rank-eligible:

```json
{
  "schemaVersion": 1,
  "createdAt": 1234567890123,
  "action": "run_blackop",
  "detail": "Operation Daedalus is rank-eligible. This is the confirmed BitNode-ending BlackOp -- running it is irreversible and ends the current BitNode. Never triggered autonomously.",
  "blackOpName": "Operation Daedalus"
}
```

---

## Open Schema Questions

Flagging rather than guessing, per the project's own standards doc:

1. ~~Should `moneyBudget: null` (uncapped) vs `0` (none) distinction above be trusted as-is...~~ **Resolved:** explicit `null` = uncapped, missing field = zero. Documented above in the `budgets.json` field notes.
2. ~~`corp` status schema only sketches one division's fields as an example...~~ **Resolved:** real per-division array shape, including `bottleneckStage`, filled in above per `spec-corp-manager.md`.

None currently open. Next candidate: `stock` status schema, deferred until `stock-trader.js` is speced (phase 2).
