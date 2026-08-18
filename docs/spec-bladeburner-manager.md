# Work Package Spec — `bladeburner-manager.js`

Refer to `engineering-standards.md`, `data-contracts.md`, and `spec-logging.md`. Depends on `coordinator.js`/`coordinatorlib.js` (RAM/money budget) and watches `/data/status/singularity.json`'s `installImminent` signal. Once the Bladeburner faction is joined, it becomes a normal faction from `singularity-agent.js`'s point of view — this package does not duplicate any reputation/augmentation logic, see §2.

## Purpose

Added later than the other subsystems, once it became clear SF6.1/SF7.1 already grant you permanent Bladeburner API access outside BitNode 6/7 — this is usable in your current BN3 save, not something to defer until a future run. You confirmed your combat stats are already at or near the 100/100/100/100 (Strength/Defense/Dexterity/Agility) join requirement.

**Your stated priorities for this subsystem**: money and combat-stat growth as real but secondary benefits, with the primary interest being that Bladeburner is **an alternate BitNode-completion route in some BitNodes** — specifically BN6/BN7, where completing the BlackOp chain through `Operation Daedalus` is an alternative to the standard `w0r1d_d43m0n` hack. That completion path isn't reachable from BN3, but the rank/skill/progression machinery is worth building now so it's ready whenever you're in a BitNode where it matters.

**A finding worth flagging plainly rather than building around silently**: community sourcing suggests Bladeburner's money rewards are comparatively minor compared to gang — the design's real currencies are rank, faction reputation, and combat stat XP. This is **medium confidence, not verified against your actual game**, and directly touches your stated interest in money as one of the benefits. `verify-bladeburner.js` surfaces real contract/operation reward numbers early specifically so this gets corrected against your real data rather than trusted on secondhand information, the same discipline that caught the ~4x-wrong corp production formula earlier in this project.

## In Scope

### 1. Prerequisite check and one-time join sequence
- Each cycle, if not yet joined (`ns.bladeburner.inBladeburner()` returns `false`), check whether all four combat stats are at or above 100. If so, call `joinBladeburnerDivision()`.
- Once joined and rank reaches 25, call `joinBladeburnerFaction()` once. After this, the Bladeburner faction requires no special handling from this package — `singularity-agent.js` already knows how to work reputation for, donate to, and pursue augmentations from any joined faction, and will pick up Bladeburner the same way it picks up any other faction. This package's job stops at getting you into the faction, not managing what happens with it afterward.
- If combat stats aren't yet at the requirement, this package does nothing but wait and report `joined: false` in its status file — it does not attempt to train stats itself. Stat training toward this threshold is `singularity-agent.js`'s idle-time gym/university fallback, already speced with an explicit note about "synergy with... Bladeburner SFs." No duplicate training logic here.

### 2. Action loop
Each cycle, while enabled and joined:
- **Reactive general actions take priority** over contracts/operations when triggered:
  - If current city's chaos (`getCityChaos()`) exceeds `config.subsystems.bladeburner.chaosThreshold` (default `50`, matching the game's own success-chance penalty threshold), run the Diplomacy general action until chaos drops back under it.
  - If stamina (`getStamina()`) is below `config.subsystems.bladeburner.lowStaminaThreshold` (fraction of max, default `0.5`), run the Hyperbolic Regeneration Chamber general action until stamina recovers, rather than continuing to spend it on contracts/operations at a steep success-chance penalty.
  - Periodically (not every cycle — this doesn't need to be aggressive) run Field Analysis to keep the population estimate accurate, since a stale estimate degrades the accuracy of every other success-chance calculation this package relies on.
- **Otherwise, select a contract or operation** by rank-gain-per-time (`getActionRankGain(type, name, level) / getActionTime(type, name)`) weighted by `getActionEstimatedSuccessChance()`, and call `startAction(type, name)`. Skip any action whose success chance is too low to be worth the attempt (internal constant threshold, not a config field — this is closer to an implementation-detail safety margin than something you'd want to live-tune, similar to `MIN_RAM_RESERVE_BYTES` in `coordinator.js`).

### 3. BlackOp progression — with a hard safety guardrail
- Each cycle, call `getNextBlackOp()`. If a BlackOp is rank-eligible:
  - If its name is **not** in `config.subsystems.bladeburner.neverAutoBlackOps` (default `["Operation Daedalus"]`, the confirmed final/BitNode-ending BlackOp), run it autonomously like any other action.
  - If its name **is** in that list, write to `/data/status/bladeburner-recommendations.json` (schema in `data-contracts.md`) instead of running it, and do this exactly once per BlackOp (don't spam the recommendations file every cycle once it's already been flagged).
- **This guardrail is deliberately name-list-based, not "run everything except the literal last item programmatically detected,"** so that a future game update reordering `getBlackOpNames()` doesn't silently make a BitNode-ending action autonomous by accident. The default list ships with `Operation Daedalus` pre-populated from confirmed research; if the game ever adds new BitNode-ending BlackOps beyond that name, this list needs a manual update, not automatic detection — the cost of occasionally needing to update a config array is far lower than the cost of accidentally automating an irreversible BitNode-ending action.
- This mirrors `spec-singularity-agent.md`'s exclusion of `b1tflum3`/`destroyW0r1dD43m0n` exactly: ending a BitNode is a deliberate, player-only decision, never something a daemon decides on your behalf, regardless of how the architecture's general "autonomous for routine, recommend for structural" pattern would otherwise apply.

### 4. Skill point spending
- Priority order: **Overclock** first, up to its max level (confirmed: each level reduces contract/operation/BlackOp time by ~1%, capped at level 90 — a strong, well-documented early investment), then **Reaper** (boosts effective combat stats specifically for Bladeburner action success-chance calculations by ~2%/level) and **Evasive System** (boosts effective Dexterity/Agility for the same purpose by ~4%/level), then the remaining stat/success-chance-boosting skills spent roughly evenly across the rest, using whatever skill points accumulate from rank gains. Reaper/Evasive System are called out by name ahead of the general "spend evenly" fallback specifically because they're the direct lever connecting your *player* combat stats to Bladeburner success chance — worth more weight than an even split would give them by default. No further optimization beyond this ordered priority — a full skill-allocation optimizer is out of scope (see below).

### 5. City and team management
- Periodically compare `getCityEstimatedPopulation()`/`getCityChaos()` across all cities and `switchCity()` to whichever currently offers the best chaos-adjusted opportunity, if meaningfully better than the current city. Not a per-cycle decision — city switching should be infrequent, evaluated on a slower cadence than the main action loop.
- For operations that support a team, `setTeamSize()` to `config.subsystems.bladeburner.teamSize` (default `4`, an unresearched starting guess — see Confidence Notes) rather than the game's default, since team size affects both success chance and resource cost per the game's own mechanics.

### 6. Install-imminent awareness
- Read `/data/status/singularity.json`'s `installImminent` field each cycle. If `true`, pause BlackOp triggering and large skill-point spends until after the install completes — not because Bladeburner state is confirmed to reset (unconfirmed either way, see Confidence Notes), but because pausing costs nothing and protects against the unconfirmed case, the same conservative-by-default posture used elsewhere in this project when a mechanic hasn't been verified.

### 7. Status reporting
- Write `/data/status/bladeburner.json` each cycle: common fields plus `joined` (bool), `rank` (float), `currentCity` (string), `currentAction` (string), `nextBlackOp` (string), `pendingRecommendations` (int) — all per the schema in `data-contracts.md`.

## Out of Scope

- Any faction reputation, donation, or augmentation-purchase logic for the Bladeburner faction — entirely `singularity-agent.js`'s responsibility once this package joins the faction. Duplicating that logic here would create exactly the "two scripts trying to own the same lever" problem this project has deliberately avoided elsewhere (e.g. the hacknet/corp hash-spend boundary).
- Combat-stat training toward the 100/100/100/100 join requirement — `singularity-agent.js`'s idle-time gym/university fallback already covers this.
- A full skill-point allocation optimizer beyond the Overclock-first-then-even-split priority order in §4 — not worth the complexity given skill points are a slow-accumulating resource with low downside to a merely-good-enough ordering.
- Any behavior that treats being in BN6/BN7 specially — this package behaves identically regardless of which BitNode you're in. The `neverAutoBlackOps` guardrail (§3) applies universally, not conditionally based on detecting BN6/7, which is both simpler and safer (no risk of a BN-detection bug accidentally loosening the guardrail).
- Money-focused action selection beyond the default rank-gain-per-time weighting — given the medium-confidence finding that Bladeburner money rewards are minor, building a money-weighted selection mode now would be optimizing for a lever that may not be worth optimizing. Revisit once `verify-bladeburner.js`'s real reward numbers come back, per the Confidence Notes below.

## Verify Script — `verify-bladeburner.js`

Mostly non-destructive, with the join sequence and one real action attempt flagged as real side effects (joining the division/faction is a one-time, low-risk, effectively pure-upside action; running one contract is a small real action with a minor stamina/chaos cost, not free, but far short of anything irreversible).

```
CHECK: current combat stats vs. 100/100/100/100 requirement -- print raw values,
       met? <bool>
CHECK: ns.bladeburner.inBladeburner() = <bool>
[if not yet joined and stats meet the requirement: joins the division as a real action]
CHECK: current rank = <X>
CHECK: skill names and current levels -- print raw ns.bladeburner.getSkillNames()
       and getSkillLevel() for each, confirm Overclock is among them and its max
       level really is 90
CHECK: contract names, operation names, and getNextBlackOp() -- print raw output
CHECK: getBlackOpNames() full list -- confirm "Operation Daedalus" appears and
       print its position (expected: last)
CHECK: current city chaos and stamina -- print raw values against configured
       thresholds
[performs one real contract or operation, whichever has the best estimated
 success chance right now]
CHECK: rank gain, reputation gain (if any), and money gain from that one real
       action -- print all three raw, this is the number that matters most for
       correcting the "money is minor" assumption above
CHECK: /data/logs/bladeburner-events.jsonl now contains an action_completed
       event matching this action -- print it
```

**Expected output when correct:** every `CHECK:` line present, `Operation Daedalus` confirmed present and last in the BlackOp list, and — most importantly — the real money/rank/reputation numbers from the one real action performed, since that's the evidence needed to confirm or correct this spec's money-is-minor assumption before the main daemon's design leans on it further.

## Acceptance Criteria

1. `verify-bladeburner.js` run once produces real reward numbers for at least one contract/operation, confirming or correcting the money-is-minor assumption in this spec.
2. If combat stats already meet the requirement (as you've confirmed), running the daemon results in `joined: true` within one cycle, with no manual intervention.
3. A rank-eligible BlackOp on `neverAutoBlackOps` produces an entry in `/data/status/bladeburner-recommendations.json` and is never run, confirmed across multiple cycles (not just the first detection).
4. A rank-eligible BlackOp **not** on that list runs autonomously, confirmed by a corresponding log event.
5. `/data/status/bladeburner.json` matches the schema in `data-contracts.md` after any run.

## Confidence Notes

- **High confidence** on the API surface itself (`ns.bladeburner`'s method list, the `inBladeburner()`/`joinBladeburnerDivision()`/`joinBladeburnerFaction()` sequence, the 100/100/100/100 join requirement, `Operation Daedalus` as the final BlackOp) — sourced directly from official Bitburner documentation and cross-referenced community material during this spec's research, not memory.
- **Medium confidence, explicitly flagged for correction**: that Bladeburner money rewards are minor relative to rank/rep/stat XP. This is community-sourced, not verified against your actual game, and directly relevant to your stated interest in money as one of this subsystem's benefits — `verify-bladeburner.js`'s real-reward-number check exists specifically to settle this rather than let the assumption stand unchecked.
- **Low-medium confidence, unconfirmed**: whether Bladeburner rank/progress survives an augmentation install (the way gang respect/territory does) or resets the way core stats/skills do. The install-imminent pause in §6 is deliberately conservative regardless of the answer, but it's still worth confirming directly — a small diagnostic (check rank immediately before and after a real install, whenever you next do one) would resolve this cheaply.
- **Low confidence, explicitly a guess**: the default `teamSize` (4) and `lowStaminaThreshold` (0.5) values — neither is researched, both are reasonable-sounding starting points meant to be tuned from real logged behavior via `set-priority.js`, not trusted as correct out of the box.
- **Medium confidence** on Reaper (~2%/level combat stat boost) and Evasive System (~4%/level Dex/Agi boost) as the specific skills that translate player combat stats into Bladeburner success chance, and on their exact percentages — sourced from community material during this spec's research, not the primary API doc (which lists skill names via `getSkillNames()` but not their individual effects). `verify-bladeburner.js`'s skill-level check should print the real skill list so these names get confirmed before the main daemon's priority ordering relies on them.
