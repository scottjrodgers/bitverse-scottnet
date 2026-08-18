# Full-Game Automation Architecture — Bitburner

**Status:** Draft v1 for review. Sections marked with confidence levels reflect how sure I am of the underlying game mechanics, not the design decisions built on top of them. Open questions are called out explicitly rather than guessed at.

**Your current state:** SF1.3, SF2.2, SF3.1 (in progress), SF4.3, SF5.1, SF6.1, SF9.1. Gang already started. Corporation running (Agriculture + CigFigs). No WSE/TIX/4S yet. HWGW batcher already built (`batchlib.js`, `batcher.js`, `prep.js`, worker scripts) — this document treats that as the existing "Hacking" subsystem and designs everything else to fit around it.

---

## 1. North Star: What Is This Optimizing For?

You asked me to recommend this. Here's the recommendation and the reasoning, since it shapes every decision below.

**Recommendation: Configurable Growth Maximization, not BN-completion speedrunning.**

The architecture optimizes a weighted composite objective — money/sec, faction reputation/sec, hacking XP/sec, and "augmentation readiness" (rep banked vs. rep needed for queued augs) — rather than treating "reach w0r1d_d43m0n as fast as possible" as the sole objective function.

**Why:** A pure speedrun objective would push the system toward narrow, aggressive choices — e.g., telling you to abandon corp tuning the moment hacking XP/sec become more efficient, or to skip gang territory entirely if it doesn't move the completion-readiness needle fast enough. That fights against what you've actually been doing in this save: deep, deliberate tuning of the corporation for its own sake, methodical A/B testing of boost materials, careful reasoning about employee ratios. A growth-maximizing objective naturally subsumes BN-completion progress anyway — hacking level, money, and augmentations are simultaneously growth metrics *and* the gating requirements for w0r1d_d43m0n — so you're not sacrificing completion speed, you're just not treating it as the only thing that matters.

Practically, this means: default behavior is "grow everything as efficiently as possible," and BN-completion requirements (hacking level ≥ some threshold, Daedalus faction access, augmentation count) are tracked and surfaced as a dashboard/status readout, not silently forced. When you decide you *do* want to push for completion, you turn a dial (see §6) rather than needing a different architecture.

**Confidence: moderate (~70%).** This is a judgment call about what fits you, not a factual claim. If you want it reframed around BN-completion instead, that's a config change to the weight vector, not a redesign — but tell me now if I read this wrong, since some subsystem designs below (especially gang territory risk tolerance and corp reinvestment pacing) lean on this assumption.

---

## 2. Orchestration Model: Control Plane / Data Plane Split

You also asked me to recommend this, and specifically wanted RAM sharing to be "dynamic, adjustable live."

**Recommendation: one lightweight Resource Coordinator + independent subsystem daemons, coordinating through shared state files, not a single monolithic script and not fully siloed daemons with no shared brain.**

This is standard distributed-systems shape: a scheduler/coordinator owns priorities and resource quotas; each subsystem is its own resilient process that operates autonomously within whatever quota it's been given, and reports status back. Two purely independent options don't fit your stated requirement:

- **Fully centralized** (one script does everything): fragile — a bug in the stock-trading logic could crash the hacking batcher too, and RAM isn't a bottleneck for you (524TB), so there's no efficiency reason to force everything into one process.
- **Fully independent daemons with no coordination**: can't do *dynamic, live-adjustable* resource sharing well. If each subsystem independently decides how much RAM/money to claim with no shared source of truth, you either get race conditions (two subsystems both grab the "same" free RAM) or static hard-coded splits — which is exactly what you said you don't want.

**Design:**

- **`coordinator.js`** — a small, always-running daemon. Owns a priority-weights config (readable/writable at runtime — see §6), polls each subsystem's self-reported resource appetite and results, and periodically recomputes each subsystem's RAM and money budget. Writes budgets to `/data/budgets.json`.
- **Subsystem daemons** (`batcher.js`, `hacknet-manager.js`, `corp-manager.js`, `stock-trader.js`, `gang-manager.js`, `singularity-agent.js`) — each reads its own allocated budget from `/data/budgets.json` at the start of every decision cycle and operates independently within it. None of them talk to each other directly; they only read/write shared state files. This means any one of them can be killed, restarted, or reworked without taking anything else down — important since you're going to want to iterate on these independently, the same way we iterated on the corp employee ratios by testing one thing at a time.
- **Status/telemetry**: each subsystem periodically writes a small JSON blob to `/data/status/<subsystem>.json` (money/sec, current focus, warnings). `coordinator.js` aggregates these into `/data/status/summary.json` for a HUD script to `tail`.

**Confidence: high (~85%)** that this is the right shape given your explicit requirements (dynamic live-adjustable sharing, distributed-systems-comfortable design). Lower confidence (~50%) on some of the specific polling intervals and budget-recompute formulas below — those are tuning parameters, not architecture, and should be adjusted empirically once it's running, the same way we tuned `spacer` for the batcher.

---

## 3. Shared Infrastructure

All subsystems depend on a few common pieces, worth building once rather than duplicating per-subsystem (you already have most of `batchlib.js`'s network/RAM helpers — these extend that pattern):

- **`/data/` convention**: flat JSON files as the coordination substrate, same reasoning as the original hacking-framework discussion — file state is trivially inspectable (`cat` it from the terminal) and doesn't require the structured-queue semantics of `ns.ports`.
- **`config.js` or `/data/config.json`**: the single place priority weights, risk tolerances, and per-subsystem toggles live. This is your "adjustable to my preferences at the moment" control surface (§6 goes deeper).
- **RAM accounting**: extend `batchlib.js`'s `getRamDonors()` so it's aware of *reserved* RAM per subsystem (from `coordinator.js`'s budget file), not just raw free RAM. The hacking batcher already treats RAM as fully available to itself; it needs a small change to respect a coordinator-assigned ceiling instead of grabbing everything.
- **Singularity RAM note**: at SF4 level 3, Singularity function RAM costs are at the 1x multiplier (no penalty) — confirmed against source, not assumed. This matters a lot: it means the Singularity agent (§4.6) can run frequently and richly without the RAM-starvation concern I originally flagged back when we didn't know your SF4 level. **Confidence: high (95%)**, sourced directly from the game's RAM cost generator code.

---

## 4. Subsystems

### 4.1 Hacking (built)

Already covered by `batchlib.js` / `batcher.js` / `prep.js` / worker scripts. Two changes needed to fit the coordinator model:

1. Replace the "grab all available RAM" behavior with "grab up to the ceiling in `/data/budgets.json`."
2. Write periodic status (`$/sec`, active targets, drift-watchdog trigger count) to `/data/status/hacking.json`.

Everything else (atomic dispatch, drift watchdog, target ranking) stays as-is.

### 4.2 Hacknet / Hash Management (SF9.1)

**Purpose:** passive money/hash generation, and — as established earlier in this save — a lever for injecting funds directly into the corporation via hash-to-corp-funds conversion.

**Design:** `hacknet-manager.js` runs on a slow cycle (every few seconds is plenty — this isn't latency-sensitive). Each cycle:
- Buy the next node/level/RAM/core upgrade only if its payback period (cost ÷ resulting $/sec increase) is under a configurable threshold. This avoids the mistake from earlier in this save (dumping 9T into hacknet nodes with terrible marginal ROI) — payback-period gating is the direct fix.
- If hashes are accumulating and a payback-worthy hacknet upgrade isn't available, spend hashes rather than let them sit — recall hashes and hash-upgrade levels **reset to zero on augmentation install**, so stockpiling them across a planned aug-install is pure waste. `hacknet-manager.js` should check `/data/status/singularity.json` for "aug install imminent" and, if so, aggressively drain hashes beforehand.
- Default hash spend target: `Sell for Corporation Funds`, per the math we did earlier ($1b/purchase vs. $1m/purchase for personal cash — three orders of magnitude better use of hashes while the corp is actively growing). Configurable if the corp isn't the priority at some point.

**Confidence: high (90%)** on the mechanics (verified: hashes reset on prestige, cost scaling ~1.05^level, `Sell for Corporation Funds` gives $1b/level) — these were confirmed against source earlier in this conversation.

### 4.3 Corporation Management

**Purpose:** this is the most novel piece to design, because most of the "algorithm" already exists — it's what we did by hand this session (perturb a boost material, measure the multiplier delta, compute elasticity, buy whatever's currently most efficient, watch for the bottleneck moving between materials/employees/upstream supply). The job here is codifying that process, not inventing a new one.

**Design — `corp-manager.js`, per division:**

1. **Continuous elasticity tracking.** Instead of manual A/B tests, the script maintains a rolling record of `{material, quantity, productionMult}` snapshots and computes elasticity (`%Δmult / %Δqty`) automatically after every purchase, exactly like the table we built by hand. It always buys whatever currently has the best *space-adjusted* marginal efficiency (elasticity ÷ space already committed) — this is the exact metric we derived together, not a new one.
2. **Bottleneck detection.** Before spending on materials at all, check: is `productionMult` actually the binding constraint right now, or is it upstream material supply (like the Agriculture→Tobacco Plants pipeline), or downstream demand (popularity/awareness too low to sell what's produced), or an artificial `limitProductProduction` cap left over from testing? This mirrors the exact diagnostic chain we walked through by hand this session — worth automating precisely because it's a repeatable process, not a one-off.
3. **Employee rebalancing.** Since we found `productionMult` doesn't respond to employee ratios but raw output does, and Management/Operations turned out to dominate over Engineer (contrary to my initial guess) — the script should periodically test small employee reallocations the same way, tracking output-per-employee-role empirically per office rather than hard-coding the ratio we found for CigFigs specifically, since that ratio isn't guaranteed to generalize to a different industry or product mix.
4. **Morale/energy**: use `throwParty`/`buyTea` reactively if AutoPartyManager/AutoBrew aren't yet unlocked for a division; once affordable, unlock them and stop spending on manual morale/energy management.
5. **Hash injection**: coordinate with `hacknet-manager.js` via `/data/status/hacknet.json` rather than independently deciding to spend hashes — avoids both scripts trying to be "in charge" of the same lever.

**Autonomy level: confirmed hybrid.** Autonomous for routine rebalancing — material purchases, morale/energy spend, employee ratio testing. Recommendation-only (writes a suggestion to `/data/status/corp-recommendations.json` and waits) for structural decisions: new divisions, IPO/dividends, single purchases above a configurable dollar threshold. The threshold itself belongs in `/data/config.json` so it's tunable without touching code.

**Confidence: high (85%)** that this design is sound, since it's built directly on mechanics we verified empirically this session rather than external sources. The main risk is generalizing CigFigs-specific findings (e.g., "Management dominates") to divisions we haven't tested — flagged in the design itself as something the script should re-verify per division, not assume.

### 4.4 Stock Market — Deferred to Phase 2

**Confirmed: excluded from the first implementation pass.** Designed here for completeness so the coordinator's budget/config schema already has a slot for it, but not built until coordinator + the other subsystems are stable. Skip straight to §4.5 if you're implementing in order.

**Purpose:** a third money engine, currently unbuilt — you have none of the prerequisite infrastructure yet.

**Requirements (confidence: moderate, ~70% — community-sourced, not verified against your current game version):**
- WSE Account
- TIX API Access (~$5b)
- Market Data TIX API Access
- 4S Market Data + 4S Market Data TIX API Access
- Total for all four: reportedly ~$31.2b combined. **This number should be treated as a rough anchor, not gospel — check `ns.stock` cost functions in-game before budgeting for it.**
- Short selling availability is inconsistent across sources/versions — some say it's universally available once TIX API is purchased, others say it's gated. **I don't have a confident answer here (confidence: low, ~40%) — worth checking `ns.stock.short()` directly in-game rather than trusting what I found.**

**Design — `stock-trader.js`:**
- Without 4S data: momentum/mean-reversion trading off price history alone (weaker signal, more conservative position sizing).
- With 4S data: forecast-and-volatility-driven trading — buy positions where `getStockForecast()` is strongly bullish and volatility is manageable, using Kelly-criterion-style position sizing scaled by your risk tolerance config.
- Given your money situation (corp alone generating hundreds of billions), I'd suggest prioritizing 4S data acquisition immediately once you decide to fund this subsystem at all — the $31.2b entry cost is trivial at your scale, and un-forecasted trading is a much weaker edge.

**Open question:** do you want this subsystem in scope for the *first* build, or deferred? Given it's starting completely from scratch (unlike corp/gang/hacking, which already have infrastructure or at least started state), it's the one piece where "build it now" vs. "design it now, build it in phase 2" matters most for scoping the first implementation pass.

### 4.5 Gang Management

**Revised after initial design**: originally speced as a hacking-type gang, since that matched what you'd already started. Revisited later once community-reported evidence surfaced that combat-type gangs meaningfully outearn hacking-type gangs, apparently because combat-gang tasks scale more heavily with territory ownership than hacking-gang tasks do. **This is community-sourced, not lab-verified against your save — flagged medium confidence, same caveat as everything else in this project that hasn't been checked against real numbers yet.** You confirmed your current gang is hacking-type with low investment/ascension so far, meaning the switching cost is low, and decided to switch the spec to combat now rather than test-and-decide — a reasonable call given the low sunk cost, but worth remembering this was a decision made on secondhand evidence, not your own measured data, the way every other design choice in this project has been validated so far. `verify-gang.js` should be one of the first things you run once this is implemented, specifically to check whether the real numbers back up the switch.

**Purpose:** passive income, faction reputation (gang Respect converts to faction Reputation at a **75:1 ratio**, confirmed against source), and large combat/hacking stat multipliers via equipment and ascension.

**Confirmed mechanics (confidence: high, ~90%, sourced directly from game code):**
- Max 12 members. First 3 recruits are free; each subsequent recruit needs exponentially more Respect (`recruitThresholdBase = 5`).
- Ascension resets a member's XP/levels in exchange for a **permanent** stat-gain multiplier — a one-way ratchet, good candidate for automation with a clear threshold rule (ascend when the projected permanent multiplier gain outweighs the temporary reset cost, similar in spirit to the elasticity-based decisions elsewhere in this architecture).
- Installing augmentations penalizes (not fully resets) gang ascension multipliers by ~15% — worth knowing so `singularity-agent.js` and `gang-manager.js` aren't fighting each other around aug-install timing.
- Territory warfare has a **real death-risk mechanic** while `territoryWarfareEngaged = true` — a member can die during a lost clash. This needs an explicit risk-tolerance setting, not a silent default.

**Design — `gang-manager.js`:**
- Recruit up to 12 whenever Respect threshold allows.
- **Revised: combat gang** (see the note above). Task/member optimization targets Strength/Defense/Dexterity/Agility rather than Hacking — task selection favors combat-weighted tasks, equipment purchases prioritize weapons/armor/vehicles over rootkits, and ascension timing is evaluated against combat-multiplier payback. Territory ownership matters more here than it would have for a hacking gang, per the research behind this revision — territory-percent growth should be treated as a first-class driver of task output, not just a side effect of the warfare toggle.
- Assign tasks by member role/stats — split members between money-generating tasks and Respect-generating tasks based on the coordinator's current weight for "gang money" vs. "gang rep" (ties into §1's composite objective).
- Auto-ascend members when the payback math favors it.
- **Territory warfare: confirmed auto-engage above a win-probability threshold**, not off-by-default and not always-on. Proposed default threshold: engage only when clash win chance exceeds ~65-70% (a real safety margin above coin-flip, since a loss carries real death risk and a member's accumulated ascension multiplier is gone for good if they die). This threshold belongs in `/data/config.json` (`gang.territoryWarfareWinThreshold`) so you can tighten or loosen it without a code change once you see how it behaves in practice — same pattern as tuning `spacer` empirically for the batcher.

### 4.6 Singularity Agent (Faction/Augmentation/Program automation)

**Purpose:** the connective tissue between everything else — this is what actually pushes toward BN-completion readiness (or just general power growth, per §1), by managing faction reputation grinding, augmentation purchases/installs, program creation, and (early-game, less relevant now) crime-for-karma.

**Confirmed (confidence: high, ~90%, sourced):** at SF4.3 you're at the 1x RAM cost multiplier — full functions like `purchaseAugmentation`, `installAugmentations(cbScript)`, `workForFaction`-equivalents, `createProgram`, `travelToCity`, `commitCrime`, and the destroy/BN-transition functions (`b1tflum3`, `destroyW0r1dD43m0n`) are all affordably scriptable.

**Design — `singularity-agent.js`:**
- Tracks reputation across all joined factions, works whichever faction currently has the best rep/sec ROI toward your next queued augmentation (unless the composite objective from §1 weights something else higher this cycle).
- Purchases and queues augmentations according to a budget the coordinator assigns it (competing with corp reinvestment and stock capital via the same priority-weight system).
- **Critical integration point**: before calling `installAugmentations()`, it must signal `/data/status/singularity.json` with "install imminent" *in advance* (not just at the moment of install), so `hacknet-manager.js` can drain hashes and `corp-manager.js`/`stock-trader.js` can pause any in-flight large purchases that would be wasted by the reset. The `cbScript` parameter on `installAugmentations()` should point at a bootstrap script that re-launches `coordinator.js` and all subsystem daemons after the reset completes — augmentation installs stop all running scripts but do **not** wipe home RAM or purchased servers, so a clean relaunch is all that's needed, not a full rebuild.
- Surfaces BN-completion readiness (hacking level vs. requirement, Daedalus faction access, augmentation count) in its status file, per §1 — informational, not a forced trigger.

### 4.7 Bladeburner Management (SF6.1/SF7.1)

**Purpose:** added later in this project's design process, once it became clear you already have permanent Bladeburner API access via SF6.1/SF7.1 — this doesn't require being in BitNode 6 or 7, it's usable right now. You confirmed your combat stats are already at or near the 100/100/100/100 (Str/Def/Dex/Agi) join requirement.

**Your stated role for this subsystem:** money and combat-stat growth as secondary benefits, but the primary interest is that Bladeburner is **an alternate BitNode-completion route in some BitNodes** (BN6/BN7 specifically — completing the BlackOp chain up to `Operation Daedalus` is an alternative to the standard `w0r1d_d43m0n` hack). Not relevant to BN3 today, but worth building the readiness/progression machinery now rather than only when you're actually in BN6/7.

**Important correction to flag rather than build around silently:** community sourcing suggests Bladeburner money rewards are comparatively minor — the design's real currencies are rank, faction reputation (via the Bladeburner faction, joinable at rank 25), and combat stat XP, not cash. This is **medium confidence, not verified against your actual game** — treat it the same as every other unverified formula in this project: `verify-bladeburner.js` should surface real contract/operation reward numbers early so this assumption gets corrected against your real data rather than trusted blind.

**Design — `bladeburner-manager.js`:**
- One-time join sequence once the stat gate is met: `joinBladeburnerDivision()`, then `joinBladeburnerFaction()` once rank 25 is reached — after that, the Bladeburner faction is just another faction `singularity-agent.js` already knows how to work/donate toward and pursue augmentations from. No special-case aug logic needed in this subsystem; the faction-rep and augmentation-acquisition machinery already built for `singularity-agent.js` covers it once joined.
- Action loop: reactive general actions (Diplomacy when city chaos exceeds a threshold, Field Analysis when population-estimate confidence is stale, Hyperbolic Regeneration Chamber when stamina is low) interleaved with contract/operation selection by rank-gain-per-time weighted by estimated success chance, while stamina allows.
- Skill point spending: Overclock first (each level cuts action time ~1%, capped at level 90 — a strong, well-documented early priority), then stat/success-chance skills roughly evenly across the rest.
- **Hard safety guardrail, mirroring `singularity-agent.js`'s `b1tflum3`/`destroyW0r1dD43m0n` exclusion**: any BitNode-ending BlackOp (`Operation Daedalus` by name today, and defensively "whichever BlackOp is last in `getBlackOpNames()`'s progression order" so this doesn't silently break if names change in a future game version) is **never triggered autonomously** — it goes to a recommendation file the same way corp/singularity structural decisions do, requiring your explicit action. Ending a BitNode is exactly the class of irreversible, deliberate, player-only decision this project has consistently kept out of autonomous hands.

**Confidence: high (~90%)** on the API surface itself (`ns.bladeburner`'s method list, the 100/100/100/100 join requirement, `Operation Daedalus` as the final BlackOp) — sourced directly from official docs and cross-referenced community material, not memory. **Lower confidence (~50%)** on whether Bladeburner rank/progress survives an augmentation install the way gang respect/territory does, or resets — unconfirmed either way, flagged for `verify-bladeburner.js` to check rather than assumed.

---

## 5. Component Diagram (textual)

```
                        ┌─────────────────────┐
                        │   coordinator.js    │
                        │  (priority weights,  │
                        │   RAM/$ budgets)     │
                        └──────────┬───────────┘
                                   │ writes /data/budgets.json
                                   │ reads  /data/status/*.json
        ┌──────────┬───────────────┼───────────────┬──────────┬────────────┬──────────────┐
        ▼          ▼               ▼               ▼          ▼            ▼              ▼
   batcher.js  hacknet-      corp-manager.js  stock-trader  gang-manager  singularity-  bladeburner-
  (hacking,     manager.js    (Agriculture,    .js (phase    .js          agent.js      manager.js
   built)                      CigFigs, ...)     2)                       (faction/aug/  (rank/BlackOp
                                                                            program mgmt)  progression)
```

Every box reads its budget from `coordinator.js` and writes its own status back. None talk to each other directly except through those shared files — this is deliberate, so any one subsystem can be restarted, replaced, or debugged in isolation, the same resilience property we built into the hacking batcher with the drift watchdog.

---

## 6. Configurability ("adjustable to my preferences at the moment")

`/data/config.json`, read live by `coordinator.js` every cycle (no restart needed to change priorities):

```json
{
  "objectiveWeights": { "money": 1.0, "rep": 1.0, "hackingXp": 0.5, "augReadiness": 1.0 },
  "subsystems": {
    "hacking": { "enabled": true, "ramSharePriority": 1.0 },
    "hacknet": { "enabled": true, "paybackThresholdSec": 3600 },
    "corp": { "enabled": true, "autonomyLevel": "hybrid", "structuralApprovalThreshold": 1e11 },
    "stock": { "enabled": false },
    "gang": { "enabled": true, "type": "combat", "territoryWarfareWinThreshold": 0.68 },
    "singularity": { "enabled": true },
    "bladeburner": { "enabled": true, "neverAutoBlackOps": ["Operation Daedalus"] }
  }
}
```

A small `set-priority.js` convenience script lets you edit this from the in-game terminal without hand-editing JSON, e.g. `run set-priority.js gang territoryWarfare true`.

---

## 7. Open Questions

Resolved: corp autonomy (hybrid, §4.3), gang type + territory risk tolerance (revised to combat gang, 68% win threshold, §4.5), stock market scope (deferred to phase 2, §4.4).

Still open:

1. Does the north-star framing in §1 (growth maximization, not speedrun) actually match what you want? This is still the most consequential assumption in the document and the one I have the least direct evidence for — everything else in this round of questions was a concrete mechanical choice, this one is about intent.
2. When you get to phase 2, should I verify the stock market cost figures and short-selling availability in-game before finalizing that section, or proceed on the moderate/low-confidence figures I found and correct them once you check? No need to answer this now — flagging it so it doesn't get forgotten.

## 8. Suggested Build Order

Given everything can't be built at once and you'll be implementing this yourself:

1. `coordinator.js` + `/data/config.json` + status-file convention (small, unblocks everything else)
2. Retrofit `batcher.js` to respect coordinator-assigned RAM budget (small change to existing code)
3. `hacknet-manager.js` (small, low-risk, immediate value given the hash-waste lesson from earlier)
4. `singularity-agent.js` (unlocks the aug-install coordination signal everything else depends on)
5. `gang-manager.js` (revised to combat-gang task/equipment logic, 68% territory win-threshold default)
6. `corp-manager.js` (largest, most novel — worth building last so the elasticity-tracking logic can be validated against a stable coordinator/budget system first)
7. `bladeburner-manager.js` (added later in the design process once SF6.1/SF7.1 access was confirmed relevant — no hard dependency on gang/corp being built first, sequenced here mainly because it was speced after them, not because of a technical ordering requirement)
8. `stock-trader.js` — **explicitly phase 2**, not part of this build pass
