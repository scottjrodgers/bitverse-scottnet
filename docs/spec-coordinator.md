# Work Package Spec — `coordinator.js`

Refer to `engineering-standards.md` and `data-contracts.md` for conventions this spec builds on rather than restates.

## Purpose

The control-plane daemon. Owns priority-weight interpretation, computes each subsystem's RAM and money budget every cycle, writes `/data/budgets.json`, and aggregates every subsystem's status into `/data/status/summary.json`. Nothing else in the architecture depends on any subsystem daemon existing yet — this is deliberately the first thing built, small, and independently verifiable.

## Dependencies

- `batchlib.js` (existing) — reuse `scanAll`, `rootAll`, `getRamDonors` rather than re-implementing network scanning.
- `/data/config.json` (per `data-contracts.md`) — may not exist yet on first run; this package is responsible for bootstrapping it with defaults if absent.

## In Scope

1. A new shared library file, `coordinatorlib.js`, containing pure/testable functions (no infinite loops, no `ns.exec`) — this is what the verify script calls directly:
   - `loadConfig(ns)` — reads `/data/config.json`; if missing, writes the default shape from `data-contracts.md` and returns it, with a `ns.tprint` noting defaults were created.
   - `computeRamBudgets(ns, config, totalRamBytes)` — pure function. Algorithm:
     - Reserve a small fixed constant per enabled subsystem first (`MIN_RAM_RESERVE_BYTES`, suggested default 8GB, defined as a named constant at the top of the file — not a config field, this is an implementation-detail safety margin, not something that needs live tuning yet) so no enabled subsystem ever gets zero RAM purely from weight rounding.
     - Split the *remaining* RAM proportionally across enabled subsystems by their `ramSharePriority` (default to `1.0` if a subsystem doesn't define one).
     - Disabled subsystems (`config.subsystems.<name>.enabled === false`) always get `0`, no reserve.
     - Returns `{ hacking: bytes, hacknet: bytes, corp: bytes, stock: bytes, gang: bytes, singularity: bytes, bladeburner: bytes }`.
   - `computeMoneyBudgets(ns, config, currentMoney)` — pure function. Algorithm:
     - Reserve `RESERVE_FRACTION` of current money as an unallocated buffer (suggested default `0.1` — a named constant, flagged as a tuning candidate for `config.json` in a later revision, not now, to avoid growing the schema before we know if 10% is even the right number).
     - Split the remaining spendable amount across enabled *money-spending* subsystems (`hacknet`, `corp`, `gang`, `singularity`, `bladeburner` — **not** `hacking`, which doesn't spend, and not `stock`, which is disabled in phase 1) proportional to `objectiveWeights.money` combined with each subsystem's own weight if it declares one — for v1, keep this simple: split evenly among enabled money-spending subsystems, weighted only by `objectiveWeights.money` globally, not per-subsystem money weights (per-subsystem money weighting is explicitly **out of scope** for this package — see below). `bladeburner` is included in this split even though `spec-bladeburner-manager.md` flags its actual money spend as likely minor/unconfirmed — better to give it a proportional share it mostly doesn't use than to hardcode an assumption about it into the coordinator.
     - `hacking` always gets `moneyBudget: null` (uncapped, doesn't apply). Disabled subsystems get `moneyBudget: 0`.
   - `writeBudgets(ns, ramBudgets, moneyBudgets)` — writes `/data/budgets.json` matching the schema exactly, including `schemaVersion` and `computedAt`. **Must always write an explicit entry for all seven subsystems, every cycle** — never omit a key even for a disabled subsystem (which gets `0`/`0`, not an absent key). Per `data-contracts.md`'s resolved convention, a missing key is read by consumers as `0`, and `hacking`'s `moneyBudget` must always be the literal value `null`, not simply left out — omitting keys here would make "coordinator hasn't run yet" indistinguishable from "coordinator intentionally zeroed this," which defeats the point of the convention.
   - `aggregateStatus(ns, subsystemNames)` — reads each `/data/status/<name>.json` if present (tolerate missing files — a subsystem that isn't built yet simply doesn't appear in the summary, this must not throw), writes `/data/status/summary.json` as a flat rollup of `healthy`/`moneyPerSec`/`updatedAt` per subsystem present.
2. `coordinator.js` — the daemon itself: loop that calls the above functions in order, sleeps, repeats. Suggested cycle interval: 5 seconds (not latency-sensitive — budgets don't need per-tick freshness). Should `ns.disableLog("ALL")` and print a single summary line per cycle (not spam), e.g. `"coordinator: RAM 524TB total, hacking=490TB hacknet=2TB corp=... | money reserve=10% spendable=$X"`.

## Out of Scope (do not build these here)

- Per-subsystem money-weighting beyond the single global `objectiveWeights.money` — if you find yourself wanting `config.json` to have a `corp.moneyWeight` field, stop and flag it rather than add it; that's a future revision, not this package.
- Any logic reacting to `singularity.installImminent` or similar cross-subsystem signals — per the architecture doc, that's each subsystem's own responsibility to watch for directly, not the coordinator's.
- Historical tracking/graphing of budgets over time. `budgets.json` is overwritten each cycle, not appended to a log.
- A `set-priority.js` convenience editor script — useful, but a separate small package, not bundled into this one. Now speced separately in `spec-set-priority.md`.

## Verify Script — `verify-coordinator.js`

Non-destructive. Calls `loadConfig`, `getRamDonors`/`scanAll`/`rootAll` from `batchlib.js`, `computeRamBudgets`, and `computeMoneyBudgets` **once** (not in a loop — this should run in well under a second and exit), then prints:

```
CHECK: config.json loaded (or created with defaults) -- print the raw parsed object
CHECK: total RAM detected across all donor servers = <X> GB
CHECK: player money = <$X>   [NOTE: verify ns.getPlayer().money is the right call --
       print the raw value here so we can confirm before the main loop relies on it]
--- RAM budgets ---
CHECK: hacking   = <X> GB  (enabled=<bool>, weight=<w>)
CHECK: hacknet   = <X> GB  (enabled=<bool>, weight=<w>)
CHECK: corp      = <X> GB  (enabled=<bool>, weight=<w>)
CHECK: stock     = <X> GB  (enabled=<bool>, weight=<w>)   -- expect 0, disabled in phase 1
CHECK: gang      = <X> GB  (enabled=<bool>, weight=<w>)
CHECK: singularity = <X> GB (enabled=<bool>, weight=<w>)
CHECK: bladeburner = <X> GB (enabled=<bool>, weight=<w>)
CHECK: sum of all RAM budgets <= total RAM detected? <bool>
--- Money budgets ---
CHECK: hacking     = null (expected: always null)
CHECK: hacknet     = <$X>
CHECK: corp        = <$X>
CHECK: stock       = 0 (expected: disabled)
CHECK: gang        = <$X>
CHECK: singularity = <$X>
CHECK: bladeburner = <$X>
CHECK: sum of finite money budgets <= (player money * (1 - reserveFraction))? <bool>
```

**Expected output when correct:** every `CHECK:` line present, both boolean sum-checks read `true`, `stock` RAM and money both read `0`, `hacking` money reads `null`, and no `ns.tprint` errors/exceptions. If `config.json` didn't exist before running this, it should now exist with the default shape from `data-contracts.md`.

## Acceptance Criteria

1. Running `verify-coordinator.js` on a fresh save with no `/data/config.json` creates one with correct defaults and doesn't error.
2. Both boolean sum-checks in the verify output read `true`.
3. Disabling a subsystem in `config.json` (e.g., setting `gang.enabled: false`) and re-running the verify script shows that subsystem's RAM and money budgets both become `0` on the next run — confirms live-reconfigurability without restarting anything.
4. `coordinator.js` run standalone for a few cycles doesn't spam the log (one summary line per cycle, not one line per subsystem per cycle) and `/data/status/summary.json` exists after it's run at least once, even with zero other subsystems built yet (empty or near-empty summary is correct at this stage, not an error).

## Confidence Notes

- **High confidence** on the RAM budget algorithm shape (reserve-then-proportional-split) — this is a standard weighted-fair-share pattern, not a Bitburner-specific claim.
- **Medium confidence** on `ns.getPlayer().money` being the correct way to read current cash — flagged explicitly in the verify script output rather than asserted, per the standards doc's uncertainty-handling rule. If wrong, the verify script's raw print will make that obvious immediately rather than failing silently deep in `computeMoneyBudgets`.
- The `MIN_RAM_RESERVE_BYTES` (8GB) and `RESERVE_FRACTION` (0.1) defaults are reasonable starting guesses, not tested values — expect to tune these once you see real behavior, same as `spacer` was tuned empirically for the batcher.
