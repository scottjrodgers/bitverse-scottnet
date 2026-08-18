# Work Package Spec — `corp-manager.js`

Refer to `engineering-standards.md`, `data-contracts.md`, and `spec-logging.md`. Depends on `coordinator.js`/`coordinatorlib.js` (money budget) and watches `/data/status/singularity.json`'s `installImminent` signal. Reuses the `hacknet-manager.js` → `corp.enabled` relationship already established (hacknet sells hashes for corp funds when this subsystem is enabled) — no active coordination code needed here, that's entirely `hacknet-manager.js`'s side of the contract.

## Purpose

Codifies the empirical methodology you and I developed live this session — measuring real elasticity instead of trusting formulas, diagnosing bottlenecks by actually testing, correcting course openly when a hypothesis turns out wrong — into a per-division automated loop. This is the subsystem where "trust real numbers over formulas" matters most: the one formula sourced externally this session (a 2022 gist's production-multiplier formula) was off by roughly 4x against your real Agriculture numbers, and the one hand-picked hypothesis (Engineer-heavy staffing for CigFigs) was contradicted by your own A/B test. Both corrections are why this package is built around continuous measurement rather than a one-time calibration.

**Hybrid autonomy, as already confirmed**: autonomous for routine/reversible decisions (material purchases within the elasticity loop, morale/energy spend, research spend, clearing an accidentally-set production cap), recommend-only via `/data/status/corp-recommendations.json` for structural decisions (new divisions, IPO/dividends, any single action above `structuralApprovalThreshold`, currently $100B).

## In Scope

### 1. Elasticity-tracking material purchase loop (the core mechanic)

Per division, per cycle:
- Maintain a rolling history of `{material, division, quantityBefore, quantityAfter, productionMultBefore, productionMultAfter}` observations, logged via `logginglib.js` as `material_test` events to `/data/logs/corp-events.jsonl` (JSONL chosen over a status-file array for the same append-safety reason `spec-logging.md` already established — this history can grow long over an unattended run).
- From the most recent observation per material, compute **elasticity** = (%Δ productionMult) ÷ (%Δ quantity), and **space-adjusted marginal efficiency** = elasticity ÷ current warehouse space committed to that material — the exact two-step metric derived and validated together this session (this is what correctly identified Robots as ~3-4x more elastic than Real Estate once normalized for test-size, after a raw-absolute-unit comparison initially suggested the opposite).
- Each cycle, if warehouse space and `budgets.corp.moneyBudget` allow: buy more of whichever material currently has the best known space-adjusted efficiency. If a material has no history yet, treat it as a test candidate and buy a `testIncrementFraction` (new config field, suggested default `0.25`, i.e. +25% of current owned quantity) increase specifically to generate a fresh data point, rather than skipping untested materials indefinitely in favor of only ever refining known winners — an explore/exploit balance, weighted toward exploit once every material has at least one real observation.
- If current owned quantity of a material is zero (never purchased), use a small fixed seed quantity (named constant, not a config field — internal implementation detail) rather than `testIncrementFraction × 0`, which would buy nothing and never generate data.

### 2. Bottleneck diagnosis chain

Run before the purchase loop each cycle, per division, in this order — matching the actual diagnostic sequence we used live on CigFigs and Agriculture:
1. **Artificial production cap check**: if `limitProductProduction` (or equivalent) is set and current production exactly matches the cap rather than being naturally constrained by materials/employees, this is very likely a stale/accidental setting (this happened once already this session) — clear it autonomously. This counts as routine maintenance, not a structural decision, since it's undoing an accidental constraint rather than committing new spend.
2. **Upstream supply check** (only relevant for divisions with cross-division imports, e.g. a division consuming another's exported materials): if a required imported material's warehouse buffer is at or near zero while the consuming division's output is stalled, this is a cross-division bottleneck this package cannot fix by itself — fixing it means expanding the *supplying* division, which is a structural decision about resource allocation between two divisions, not a routine purchase. Write a recommendation rather than acting.
3. **Production-multiplier check**: if neither of the above is the constraint, assume `productionMult` is still the live bottleneck and run the elasticity purchase loop (§1).
4. **Employee/office capacity check**: if warehouse space and money budget both allow further material purchases but `productionMult` growth has flattened (elasticity trending toward zero across all tested materials), the binding constraint has likely shifted to employee allocation or office size — move to §3 below instead of continuing to sink money into materials with diminishing returns.
5. **Downstream demand check**: if production is healthy but revenue isn't following (i.e. producing more than is selling), check `Awareness`/`Popularity`/sell price settings before assuming more production capacity is the answer — flag as a recommendation if the fix looks structural (e.g. needs an ad campaign spend, price strategy change) rather than something this package should decide unilaterally.

### 3. Employee reallocation testing

- **Do not assume CigFigs' finding (Management/Operations-dominant, Engineer flat) generalizes to any other division or product** — that conclusion was reached by directly testing CigFigs and was explicitly a correction of my own earlier wrong hypothesis (which favored Engineers) mid-session. Every division gets its own empirical test, independent of what any other division's test found.
- Per division/office, periodically (not every cycle — employee reallocation has slower feedback than material purchases, since output needs at least one production cycle to reflect a staffing change) try a small reallocation: move a fixed small count (internal constant, e.g. 2 employees) from the role with the weakest recent marginal contribution to a candidate role, measure output change over the following cycle(s), and keep the change if output improved, revert if it didn't. Log every reallocation test the same way as material tests (`employee_test` event type).
- Respect the pattern already observed live this session where varying employee counts sometimes doesn't move a bottlenecked output number at all (e.g. your satellite-office finding) — if a reallocation test shows no measurable effect, log it as a null result and don't keep re-testing the same reallocation repeatedly; move to testing a different role pairing instead.

### 4. Morale and energy management

- Per office, if morale or energy drops below a threshold (internal constant, informed by the in-game default guidance around ~99-100 being the practical target) and `AutoPartyManager`/`AutoBrew` research upgrades are not yet unlocked, react directly (`throwParty`/`buyTea`-equivalent calls).
- If enough research points are available, prioritize unlocking `AutoPartyManager`/`AutoBrew` over the reactive spend path — this removes the recurring need going forward rather than paying the same cost every cycle indefinitely. This is a one-time research spend, autonomous (paid in research points, not money, and reversible in impact if it turns out to be a mediocre priority — it's a QoL unlock, not a structural commitment).

### 5. Research point spending

- Autonomous, since research points aren't real money and mis-spending them is low-stakes relative to a bad material/expansion decision. Priority order: morale/energy automation unlocks (§4) first if morale/energy has been a recurring problem, then production/quality multiplier research, then whatever remains.
- Not in scope: a full research-tree optimizer. A simple ordered-priority list (config-adjustable later if it turns out to matter) is enough — don't build a second elasticity system for research points when the actual money-purchase elasticity loop is the one that mattered enough to validate this session.

### 6. Hybrid autonomy — structural recommendations

- Any of the following triggers a write to `/data/status/corp-recommendations.json` instead of autonomous action: starting a new division, taking the company public (IPO)/issuing dividends, any single purchase whose cost exceeds `structuralApprovalThreshold`, and the cross-division bottleneck case from §2.2.
- A cleared/approved recommendation is deleted from the file per the existing convention in `data-contracts.md` — this package doesn't need its own separate approval-tracking mechanism.

### 7. Install-imminent awareness

- Read `/data/status/singularity.json`'s `installImminent` field each cycle. Corp division state, materials, and research all persist through an augmentation install (corp is not reset by prestige), so this package doesn't need to defensively wind down spending the way `hacknet-manager.js` does — but should still pause any large in-flight structural recommendation from being *approved and executed* right at the install boundary, purely so you're not mid-review of a big spend decision at the same moment other subsystems are relaunching. This is a minor courtesy pause, not a hard requirement — flagged as low-priority relative to §1-6.

### 8. Status reporting

- Write `/data/status/corp.json` each cycle: common fields plus a `divisions` array, one entry per division:
  ```json
  {
    "divisions": [
      {
        "name": "CigFigs",
        "productionMult": 7.729,
        "lastMaterialElasticityWinner": "AI Cores",
        "bottleneckStage": "production_mult",
        "pendingRecommendations": 0
      }
    ]
  }
  ```
  This resolves the open schema question flagged in `data-contracts.md` — see the update to that file alongside this spec. `bottleneckStage` takes one of the five values from §2's diagnosis chain (`production_cap`, `upstream_supply`, `production_mult`, `employee_capacity`, `downstream_demand`), so `/data/status/corp.json` alone tells you at a glance what each division is currently constrained by without needing to read the event log.

## Out of Scope

- Stock market interaction (corp stock issuance/dividends beyond flagging them as structural recommendations) — full stock logic is `stock-trader.js`, deferred to phase 2.
- A generalized research-tree optimizer (§5).
- Active two-way coordination with `hacknet-manager.js` over hash spend timing — already resolved as one-directional (`hacknet-manager.js` reads `corp.enabled`), nothing further needed here.
- Automatically resolving cross-division bottlenecks by expanding the supplying division itself — flagged as a recommendation, not autonomous, per §2.2's reasoning.
- Marketing/ad-spend strategy beyond flagging low awareness/popularity as a possible recommendation trigger (§2.5) — deciding ad campaign budget and cadence is not in scope for v1.

## Verify Script — `verify-corp.js`

Mostly non-destructive reads, with one flagged real (but small, reversible-in-spirit) material purchase to validate the elasticity math end-to-end, same pattern as `verify-hacknet.js`.

```
CHECK: current divisions -- print raw ns.corporation.getCorporation() division list
CHECK: for the first division, print raw ns.corporation.getDivision() and
       ns.corporation.getOffice() for each city/office
CHECK: for the first division's first product/material, print productionMult,
       current limitProductProduction setting (if any), and whether current
       production exactly equals that cap -- would the artificial-cap check
       trigger right now? <bool>
CHECK: warehouse state for the first division -- print size used vs. total,
       and per-material owned quantities
[performs one small real material purchase for a single material -- the
 testIncrementFraction seed-quantity path]
CHECK: productionMult BEFORE vs AFTER the purchase -- print both, compute
       elasticity and space-adjusted efficiency using the formulas from ??1
CHECK: /data/logs/corp-events.jsonl now contains a material_test event
       matching this purchase -- print it
CHECK: current research points and which of AutoPartyManager/AutoBrew are
       already unlocked
```

**Expected output when correct:** every `CHECK:` line present, the artificial-cap boolean genuinely reflects real state (not hardcoded), the before/after elasticity computation matches the derivation validated live this session, and the logged event's fields match what `data-contracts.md`'s corp status schema expects.

## Acceptance Criteria

1. `verify-corp.js` run once produces a real elasticity measurement matching the hand-derived methodology from this session (spot-checkable against the Robots-vs-Real-Estate and AI-Cores examples already validated).
2. Running the daemon for several cycles on a division with an accidentally-set production cap results in the cap being cleared and logged, without a recommendation being required first.
3. `/data/status/corp.json` matches the per-division schema in `data-contracts.md` after any run, including a populated `bottleneckStage` for every division.
4. A purchase exceeding `structuralApprovalThreshold` produces an entry in `/data/status/corp-recommendations.json` rather than executing.
5. Running the daemon on two different divisions with genuinely different employee-ratio optima (confirmed by you separately, the way CigFigs' was) results in different `lastMaterialElasticityWinner`/reallocation outcomes per division, not identical behavior copied from one to the other.

## Confidence Notes

- **High confidence** on the elasticity/space-adjusted-efficiency methodology itself — this isn't a formula sourced externally, it's the metric we derived and cross-validated together against your real Agriculture and CigFigs numbers this session, including catching and correcting the raw-absolute-comparison mistake on Robots vs. Real Estate.
- **Low confidence, explicitly not trusted** on any generic corp production-multiplier *formula* — deliberately not using one anywhere in this package, exactly because the one sourced externally this session was ~4x off. Every multiplier value this package uses comes from a live `ns.corporation.getDivision()`-style read, never a computed estimate.
- **Medium confidence** on exact function names for `limitProductProduction`, `throwParty`/`buyTea`, and the `AutoPartyManager`/`AutoBrew` research unlock identifiers — high confidence these mechanics exist (referenced correctly earlier this session), medium confidence on exact current API spelling; `verify-corp.js`'s raw-output checks should surface the real names before the main daemon depends on them.
- **Explicitly flagged assumption, not verified**: that employee-ratio optima genuinely vary meaningfully division-to-division/product-to-product rather than CigFigs' finding being close to universal. Acceptance criterion 5 exists specifically to test this assumption against real data rather than let it go unchecked.
