# Work Package Spec — `hacknet-manager.js`

Refer to `engineering-standards.md` and `data-contracts.md`. Depends on `coordinator.js` existing and writing `/data/budgets.json` (this package reads `budgets.hacknet.moneyBudget` to cap spend). Per the resolved convention in `data-contracts.md`: if `budgets.json` doesn't exist yet, or the `hacknet` key is absent from it, treat the money budget as `0` — spend nothing on upgrades that cycle, don't guess at a fallback number, and don't crash. Routine hash-selling (§3) is unaffected by this, since it doesn't spend money.

## Purpose

Two jobs, kept separate in the code even though they're one file: (1) buy hacknet upgrades (new nodes, level/RAM/core) only when the payback period clears a configurable threshold — the direct fix for dumping 9T into hacknet with terrible marginal ROI earlier in this save — and (2) spend accumulated hashes before they're wasted, either on an ongoing basis or urgently when an augmentation install is imminent, since hashes and hash-upgrade levels reset to zero on every prestige.

## In Scope

1. **Upgrade purchase loop**, evaluated every cycle:
   - Candidate upgrade types per owned hacknet server: buy a new node (`ns.hacknet.purchaseNode()` cost), level up, add RAM, add cores. For each candidate, compute estimated $-equivalent gain (see Algorithm below) and payback period = cost ÷ ($-equivalent gain per second).
   - Buy the single best-payback candidate this cycle if its payback period is under `config.subsystems.hacknet.paybackThresholdSec` (already defined in `data-contracts.md`) **and** the cost is within `budgets.hacknet.moneyBudget` for this cycle. If nothing clears the bar, buy nothing and wait for next cycle — do not lower the bar to force a purchase.
   - After any purchase, record the *actual* realized production delta (read `ns.hacknet.getNodeStats()` before and after) to `/data/status/hacknet-roi-history.json`, keyed by upgrade type. Future cycles' cost-estimate step should prefer this real history over the formula-based estimate once at least one data point exists for that upgrade type — same "trust real numbers over formulas" discipline used for corp materials this session.
2. **Hash spend-target selection**: default to `"Sell for Corporation Funds"` if `config.subsystems.corp.enabled === true`, else `"Sell for Money"`. This deliberately reuses the existing `corp.enabled` flag rather than adding a new config field.
3. **Routine hash spending**: each cycle, if `ns.hacknet.numHashes() >= ns.hacknet.hashCost(spendTarget)`, spend once. Don't stockpile hashes waiting for a "better" upgrade — the $1b-per-purchase corp-funds rate established earlier this session is already the best available lever while corp is active, so there's no reason to hold hashes hoping for something better.
4. **Aug-install-imminent drain**: read `/data/status/singularity.json`'s `installImminent` field every cycle. If `true`, ignore the routine per-cycle spend pacing and drain hashes to zero immediately (loop spending the target upgrade until `numHashes() < hashCost(spendTarget)`), since both the hash balance and the escalating per-purchase cost (`1.05^level`) reset on install — there's no reason to preserve either.
5. Write `/data/status/hacknet.json` each cycle per the common schema, plus `hashesStored` and `hashProductionPerSec`.

## Out of Scope (do not build these here)

- Hash upgrades other than the single configured spend target (no `Reduce Minimum Security`, `Increase Maximum Money`, `Exchange for Corporation Research`, `Company Favor`, etc.) — one target, kept simple, expand later if wanted.
- A full multi-dimensional elasticity optimizer like `corp-manager.js`'s will be. Hacknet upgrades don't have corp's cross-material multiplicative interaction, so independent per-candidate payback comparison is sufficient — don't port the corp approach over here just for consistency's sake.
- RAM budget enforcement — this subsystem's own script footprint is tiny (no worker threads spawned), so `budgets.hacknet.ramBytes` isn't meaningfully relevant here. Don't build logic around it.
- Selling hacknet nodes/upgrades back, or any "undo" path — not a mechanic the game offers for this; don't build defensive logic assuming it exists.

## Algorithm Notes (confidence-flagged)

**Cost lookups** — high confidence: `ns.hacknet.getPurchaseNodeCost()`, `getLevelUpgradeCost(i, n)`, `getRamUpgradeCost(i, n)`, `getCoreUpgradeCost(i, n)` are direct cost-query functions, should be reliable as documented.

**Production-gain estimate before buying** — medium-low confidence. I don't have the exact current Hacknet Server production formula verified (the pre-Hacktocracy Hacknet Node formula is `level * moneyGainPerLevel * ramMult * coreMult`, but Hacknet Servers use a related-but-not-identical formula per the game's own source layout, and I haven't pulled the exact current version). Rather than guess at it and risk another "4x off" situation like the corp production multiplier earlier, this package should:
1. Use the old Node-style formula shape as a *rough* first estimate purely to rank candidates relative to each other (not to compute an exact dollar figure).
2. Immediately correct itself using real before/after measurements per the "record realized delta" step above — after the first purchase of each upgrade type, stop trusting the formula-based estimate for that type and use the measured value instead.
3. `verify-hacknet.js` (below) exists specifically to surface this gap early, before the daemon relies on it silently.

## Verify Script — `verify-hacknet.js`

**Has a side effect and must say so clearly**, unlike most verify scripts (per `engineering-standards.md`'s rule that side-effecting verify scripts must be explicitly flagged) — it performs one real, small upgrade purchase in order to measure the actual production delta and confirm the formula-estimate gap. Only run this when you're fine with one small real hacknet purchase happening.

```
CHECK: hasHacknetServers appears active -- ns.hacknet.numHashes() returns <X> without erroring
CHECK: current hash spend target = <"Sell for Corporation Funds" | "Sell for Money">
       (derived from config.subsystems.corp.enabled = <bool>)
CHECK: hashCost(spendTarget) = <X> hashes, current balance = <Y> hashes
CHECK: node 0 stats BEFORE test purchase -- print raw ns.hacknet.getNodeStats(0)
[performs the cheapest available candidate upgrade for node 0]
CHECK: node 0 stats AFTER test purchase -- print raw ns.hacknet.getNodeStats(0)
CHECK: formula-estimated production delta = <X>, actual measured delta = <Y>, ratio = <Y/X>
CHECK: /data/status/hacknet-roi-history.json now contains an entry for this upgrade type -- print it
```

**Expected output when correct:** all `CHECK:` lines present, no exceptions, `ratio` printed (this is the number to actually look at — if it's wildly off from 1.0, the formula-based estimate needs recalibrating in the main script before relying on it for real purchase decisions, same correction cycle used for the corp production multiplier this session).

## Acceptance Criteria

1. `verify-hacknet.js` run once produces a real before/after measurement and a non-crashing ratio.
2. `hacknet-manager.js` run standalone for several cycles never buys anything whose payback period exceeds the configured threshold, confirmed by checking `/data/status/hacknet-roi-history.json` against `config.subsystems.hacknet.paybackThresholdSec` after a run.
3. Manually setting `/data/status/singularity.json`'s `installImminent` to `true` and running one cycle drains hashes to below the spend-target's cost, confirmed via `ns.hacknet.numHashes()` before/after.
4. `/data/status/hacknet.json` exists and matches the common schema plus the two hacknet-specific fields after any run.
