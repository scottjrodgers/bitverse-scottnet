# Work Package Spec — `singularity-agent.js`

Refer to `engineering-standards.md`, `data-contracts.md`, and `spec-logging.md`. Depends on `coordinator.js`/`coordinatorlib.js` (RAM/money budget) and produces the `installImminent` signal that `hacknet-manager.js` already watches for (per its spec) and that `corp-manager.js`/`stock-trader.js` will watch for once built.

## Purpose

The connective tissue between subsystems: manages faction/company reputation work, augmentation acquisition and install timing, program acquisition, and — the highest-stakes part — orchestrates the prestige reset (`installAugmentations`) in a way that gives every other subsystem advance warning rather than getting blindsided by a reset mid-operation.

**Explicit framing given your playstyle**: gang is your established cash-generation lever across BNs, and corp/hacking are already covering money independently. This agent's work-time allocation is scored **purely by reputation ROI, not by money generation** — crime and company salary are not treated as income sources here. That's a real scope-narrowing decision, not an oversight: it removes an entire dimension (money vs. rep tradeoff in work selection) that would otherwise complicate the priority function for no benefit given how you actually play.

## In Scope

### 1. Reputation work allocation
- Enumerate joined factions and companies with tracked reputation.
- For each augmentation on `config.subsystems.singularity.augmentationPriorityList` (in order) not yet owned or queued, compute the faction offering it with the best current rep-accumulation rate, and work for that faction.
- If the current highest-priority unpurchased augmentation's faction has favor ≥ `donateFavorThreshold`, prefer donating money for reputation (`donateToFaction`-equivalent) over time-based work, when the coordinator's money budget for `singularity` covers it — this is a real lever given BN3's halved favor requirement (75 instead of 150) and the money coming out of the corp; direct-buy reputation is likely to outpace grinding work-time in most cases at your scale. **Flagging this comparison as something to verify empirically once both paths are available**, not asserting donation always wins — same "measure, don't assume" discipline as everywhere else in this project.
- If nothing on the priority list needs more reputation right now (everything affordable and queued), fall back to whichever joined faction/company has the best rep-ROI generally, so work-time isn't wasted idling.

### 2. Augmentation acquisition — hybrid autonomy, same pattern as `corp-manager.js`
- **Autonomous**: purchase augmentations on `augmentationPriorityList`, in order, respecting prerequisite chains (`getAugmentationPrereq`) and the coordinator's money budget for this subsystem.
- **Recommend-only**: when the agent discovers an augmentation available through a joined faction that is *not* on the priority list, it writes to `/data/status/singularity-recommendations.json` (same shape convention as `corp-recommendations.json`) rather than deciding on its own to pursue it. Augmentation choice is one of the most consequential decisions in the game and legitimately a matter of your own build preferences — this isn't a place for the agent to freelance.

### 3. Install orchestration (the highest-stakes piece)
- Trigger `installAugmentations(cbScript)` when either `installBatchSize` augmentations are queued, or the oldest queued augmentation has been waiting `installMaxWaitCycles` — whichever comes first, so one hard-to-afford aug doesn't indefinitely block cheaper ones already queued behind it.
- **Before** calling `installAugmentations`, not at the moment of the call: write `installImminent: true` to `/data/status/singularity.json` and wait a short, configurable grace period (a handful of coordinator cycles) so `hacknet-manager.js` can actually finish draining hashes and other subsystems can wind down in-flight spending before the reset actually happens. Calling install immediately after setting the flag defeats the purpose of the flag.
- `cbScript` points at a new small script, `bootstrap.js` (in scope for this package): after a reset, home RAM and purchased servers persist (confirmed: augmentation installs stop all running scripts but do not wipe server/RAM state), so `bootstrap.js` just needs to re-launch `coordinator.js`, `batcher.js`, `hacknet-manager.js`, `singularity-agent.js` itself, and any other built daemons, roughly in dependency order (coordinator first). It does not need to rebuild or re-root anything — `batcher.js`'s own startup already re-scans/re-roots per its spec.

### 4. Program acquisition
- Purchase or create port-opener programs (`BruteSSH.exe`, `FTPCrack.exe`, `relaySMTP.exe`, `HTTPWorm.exe`, `SQLInject.exe`) not yet owned, since `batcher.js`'s `rootAll()` depends on them for network access — this is a real dependency between subsystems worth stating explicitly, not just a nice-to-have. Formulas.exe is already owned; don't add logic to acquire it.

### 5. Idle-time fallback: gym/university, crime deprioritized further
- If there's genuinely nothing better to do with work-time (priority list fully queued/owned, no faction has useful rep-ROI right now), fall back to gym/university training for combat stats — synergy with Bladeburner (`spec-bladeburner-manager.md`), which runs on your own player combat stats. **Correction from an earlier draft of this note**: this does *not* meaningfully synergize with the gang, regardless of gang type — gang member stats (trained via gang tasks/ascension) and player stats (trained via gym) are separate systems in Bitburner with no crossover, confirmed while researching the Bladeburner addition to this project. Worth stating plainly since an earlier pass at this doc implied a connection that isn't real.
- Crime is **not** in the routine rotation. Its usual roles (money, karma) are both already covered elsewhere in your setup (gang for money, karma already well past the gang-creation threshold), so it adds essentially nothing here. Leave it implementable-but-unused: a `commitCrime` fallback only if gym/university are somehow unavailable, not a real behavior path expected to trigger often.

### 6. BN-completion readiness (informational only)
- Track and report current hacking level vs. typical completion thresholds, Daedalus faction access status, and total augmentation count in `/data/status/singularity.json`. Per the architecture doc's north-star framing, this does not drive behavior — it's a dashboard, not a trigger.

## Out of Scope

- Any money-generation-motivated work selection (company salary optimization, crime-for-cash) — explicitly excluded per the framing above.
- Deciding *which* augmentations belong on the priority list — that's your call, config-driven, not something this agent infers.
- `b1tflum3`/`destroyW0r1dD43m0n` (BitNode transition functions) — those are a deliberate, one-time player decision, not something a daemon should ever call autonomously. Not in scope for any version of this package.
- Gang faction favor interactions specific to gangs (per the architecture doc, installing augmentations penalizes gang ascension multipliers by ~15% — that's `gang-manager.js`'s concern to read and react to via its own status/history tracking, not something `singularity-agent.js` needs to compute here beyond emitting the `installImminent` signal it already emits for everyone).

## Verify Script — `verify-singularity.js`

Non-destructive — deliberately does **not** trigger a real `installAugmentations()` call, since there's no safe way to "test" a prestige reset without actually doing it. Read-only checks only:

```
CHECK: current joined factions and their reputation -- print raw list
CHECK: augmentationPriorityList from config, resolved against current owned/queued augs
       -- print which entries are: owned, queued, purchasable-now, rep-blocked
CHECK: for the top unpurchased priority-list aug, which faction offers it and current
       rep-accumulation rate if working there
CHECK: for that same faction, current favor vs. donateFavorThreshold -- would donation
       path trigger right now? <bool>
CHECK: prerequisite chain for the top unpurchased aug resolves without error
CHECK: port-opener programs owned vs. missing -- print list
CHECK: bootstrap.js exists and, when read (not executed), contains a launch call for
       each of: coordinator.js, batcher.js, hacknet-manager.js, singularity-agent.js
```

**Expected output when correct:** every `CHECK:` line present, prerequisite resolution doesn't throw even if the chain is deep, and `bootstrap.js`'s content is confirmed present without ever actually being run by this script.

**Separate, manual-only step, not part of the verify script**: the first real `installAugmentations()` call should be triggered deliberately by you when you actually want to install, watched in real time, not treated as a routine automated test. Confirm `installImminent` appears in the status file with enough lead time before the reset for `hacknet-manager.js` to react, by checking `/data/logs/hacknet-events.jsonl`-equivalent or its status file timestamp against the actual install time.

## Acceptance Criteria

1. `verify-singularity.js` passes as described, with no destructive action taken.
2. Adding an augmentation to `augmentationPriorityList` in `config.json` causes the next cycle's work-allocation decision to visibly target the correct faction (observable via `/data/status/singularity.json`'s `currentFactionFocus`).
3. An augmentation available but *not* on the priority list produces an entry in `/data/status/singularity-recommendations.json`, not an autonomous purchase.
4. A real, deliberate first install run confirms `installImminent` was set with enough lead time, and that `bootstrap.js` successfully relaunches every daemon afterward without you manually re-running anything.

## Confidence Notes

- **High confidence** on the general Singularity API surface (augmentation management, education, crime, program, and prestige/reset function categories) — sourced directly from the game's own RAM-cost generator source, not memory.
- **High confidence** that home RAM and purchased servers survive an augmentation install (only running scripts stop) — this was established and relied on earlier in this project's design.
- **Low-medium confidence** on whether donating for reputation actually outperforms work-time at your current money scale — flagged explicitly above as something to measure once both paths exist, not asserted.
- **Medium confidence** on exact function names for faction work/donation (`workForFaction`, `donateToFaction`, or similar) — the DeepWiki source I pulled didn't enumerate the full faction-interaction function list the way it did for augmentations/education/crime/programs. `verify-singularity.js`'s first checks should surface the real function names/signatures before the main daemon relies on them.
