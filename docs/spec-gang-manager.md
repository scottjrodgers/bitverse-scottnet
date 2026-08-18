# Work Package Spec — `gang-manager.js`

Refer to `engineering-standards.md`, `data-contracts.md`, and `spec-logging.md`. Depends on `coordinator.js`/`coordinatorlib.js` (money budget only — see RAM note below) and watches `/data/status/singularity.json`'s `installImminent` signal.

## Purpose

Runs your gang: recruitment, task assignment, equipment purchases, ascension, wanted-level management, and territory warfare auto-engage at the already-confirmed 68% win threshold.

**Explicit framing given your playstyle**: unlike `singularity-agent.js`, which is deliberately scored on reputation only, gang is your established cash-generation lever across BNs. Task allocation here is weighted toward money-generating tasks by default, via `objectiveWeights.money` vs `objectiveWeights.rep` from `config.json` — the same global weights `coordinator.js` already normalizes, applied here to a concrete per-member task choice instead of an abstract budget split. This is the intentional mirror image of `singularity-agent.js`'s scope decision: one subsystem is the money engine, the other is the rep engine, and neither should try to do both.

**Revision: combat gang, not hacking gang.** This spec originally targeted a hacking-type gang, matching your gang as it existed when this project started. It was revised after you raised community reports that combat-type gangs meaningfully outearn hacking-type gangs — apparently because combat-gang tasks scale more heavily with territory ownership than hacking-gang tasks do. **This is community-sourced, not verified against your own save — medium confidence.** You confirmed your current gang is hacking-type with low ascension investment so far (low switching cost) and decided to switch the spec now rather than test-and-decide first. That's a reasonable call given the low sunk cost, but it means this decision rests on secondhand evidence rather than the empirical-first discipline used everywhere else in this project — `verify-gang.js` should be run early specifically to check whether your own real numbers back this up, and it's fair game to revisit if they don't.

**Also worth stating plainly, since an earlier version of `spec-singularity-agent.md` implied otherwise**: gang member stats and your own player stats are separate systems with no crossover. Switching gang type doesn't help or hurt Bladeburner (`spec-bladeburner-manager.md`) or anything else that runs on your player stats — it's a pure gang-economics decision, evaluated on its own terms.

## In Scope

### 1. Recruitment
- Every cycle, call the recruit-eligibility check (`ns.gang.canRecruitMember()`) and recruit immediately if it returns `true`, up to the hard cap of 12 members. No held-back "wait for a better name" logic — respect cost to unlock each recruitment slot beyond the first few only goes up, so there's no benefit to delaying.
- Newly recruited members are assigned a task in the same cycle (see §2), not left idle until the next pass.

### 2. Task assignment
- Tasks are assigned per member based on the gang's configured type (`config.subsystems.gang.type`, now `"combat"` per the revision above), i.e. combat-stat-weighted tasks (Strength/Defense/Dexterity/Agility) rather than hacking-stat-weighted ones.
- Split the roster between money-generating and respect-generating tasks in proportion to `objectiveWeights.money` : `objectiveWeights.rep` (both default `1.0`, i.e. default 50/50), rounded to whole members. A member's task type (money-earning vs. respect-earning) is chosen from whichever concrete combat-gang task the game exposes that best matches that role — expected candidates based on standard combat-gang task lists: `"Mug People"`/`"Deal Drugs"`/`"Strongarm Civilians"`/`"Run a Con"`/`"Armed Robbery"`/`"Traffick Illegal Arms"`/`"Threaten & Blackmail"`/`"Human Trafficking"` skew money, `"Terrorism"` skews respect-heavy — see confidence note on exact task-name enumeration below, since this list is reconstructed from general knowledge of combat-gang tasks, not pulled fresh for this revision the way the original hacking task list was.
- **Territory-weighted task scaling**: per the reasoning behind this revision, combat-gang task output is reported to scale meaningfully with territory percentage — `verify-gang.js` should confirm this against real numbers (e.g. compare a task's `getActionRankGain`/money-equivalent output at current territory% vs. after a territory gain) so the daemon's task-selection math can factor in territory as a real input, not just a side effect of the separate warfare toggle in §5.
- **Wanted-level management**: if current wanted level, as a fraction of `wantedLevelThreshold` (new config field, default suggested `1.0` meaning "let it run" — see Confidence Notes on what a sane default actually is), exceeds the threshold, reassign the minimum number of members needed to a wanted-level-reducing task (combat-type gangs have a `"Vigilante Justice"` or equivalent low-wanted task; confirm exact name via `verify-gang.js`) until the wanted level trends back down, then return those members to their normal money/respect split. This overrides the money/respect proportion temporarily — wanted-level control takes priority over throughput, since a runaway wanted level degrades both money and respect gains for the whole gang.
- Do not attempt to detect or preserve manual task overrides you make in-game — if you reassign a member yourself, the next daemon cycle will reassign them back per the algorithm above. Flagged explicitly as a scope cut, not an oversight: preserving manual overrides needs a "last known assignment vs. current assignment" diff that adds real complexity for a need you haven't expressed. Can be added later if it turns out to matter.

### 3. Equipment purchases
- Unlike corp materials, gang equipment has a fixed stat multiplier and fixed cost (`ns.gang.getEquipmentCost(equipName)`) — no diminishing-returns curve to test empirically. This is a straightforward "buy anything affordable and not yet owned by a given member" loop, no elasticity math needed.
- Priority order: weapons and armor first (equipment categories directly boosting combat-gang tasks), then vehicles, then augmentations (gang-specific, permanent, purchased once for the whole gang rather than per-member) as budget allows. Spend is capped by `budgets.gang.moneyBudget` each cycle, same missing-vs-null convention as every other subsystem.
- Buy for every member who lacks a given piece of equipment before moving to the next equipment type, so the roster stays roughly equally equipped rather than concentrating gear on one member.

### 4. Ascension
- Before ascending a member, call the ascension-preview function (`ns.gang.getAscensionResult(memberName)`, believed to return the multiplier gains that *would* apply without actually ascending — see confidence note) and compare against `config.subsystems.gang.ascensionMultiplierThreshold` (new config field, suggested default `1.10`, i.e. ascend only if the preview shows at least a 10% permanent multiplier gain on the member's primary stat for the gang's type).
- This is a "gain vs. reset" tradeoff, not a dollar-cost payback the way hacknet upgrades are — ascending resets the member's current stat levels/XP in exchange for a permanent multiplier, so the threshold should be read as "is the permanent gain big enough to justify the temporary stat/output dip," not as a literal payback-period calculation. Framed this way deliberately, since porting the hacknet payback-period pattern over here without adjustment would be modeling the wrong tradeoff.
- Awareness of the ~15% ascension-multiplier penalty from augmentation installs: this package doesn't need to actively compensate for it, but should log every ascension decision with the pre/post multiplier so a later look at `/data/logs/gang-events.jsonl` can correlate ascension timing against install events (cross-referenced via `singularity-agent.js`'s own install-event logging) if the pattern ever looks worth investigating.

### 5. Territory warfare auto-engage
- Every cycle, read the current clash win chance against other gangs (via whatever the real function turns out to be — see confidence note) and set `ns.gang.setTerritoryWarfare(true)` if win chance ≥ `config.subsystems.gang.territoryWarfareWinThreshold` (already `0.68` in `data-contracts.md`), else `false`.
- Territory warfare carries real death risk to members when engaged — this is not a free toggle. Log every state transition (`territory_warfare_engaged` / `territory_warfare_disengaged`) with the win-chance value that triggered it, and log every detected member death (`member_died`) so losses are visible in the event log rather than silently reducing headcount.
- No additional strategy beyond the threshold gate — no NPC-gang-specific targeting logic, no manual override of which gangs to prioritize. The game's own territory mechanics handle the rest once warfare is engaged.

### 6. Status reporting
- Write `/data/status/gang.json` each cycle: common fields (`schemaVersion`, `updatedAt`, `healthy`, `lastError`, `moneyPerSec`) plus `memberCount`, `respect`, `territoryPercent`, `territoryWarfareEngaged` — all four gang-specific fields already defined in `data-contracts.md`.

### 7. Install-imminent awareness
- Read `/data/status/singularity.json`'s `installImminent` field each cycle. If `true`, this package doesn't need to change behavior meaningfully (gang state — respect, territory, equipment — persists through an install, only the ~15% ascension penalty applies going forward), but should pause any in-flight ascension decisions until after the install completes, since ascending right before a reset just stacks two multiplier-affecting events at once and makes the realized-gain logging (see §4) harder to interpret cleanly.

## Out of Scope

- Full territory warfare strategy beyond the win-threshold gate (no NPC-gang power modeling, no clash-timing optimization).
- Hacking-type or full hybrid task rosters — this package now assumes `config.subsystems.gang.type === "combat"` per the revision above; if you ever switch back to hacking or to a hybrid split, the task-name lists in §2/§3 need revisiting, not a rewrite of the allocation logic itself (this is exactly the scenario this note originally anticipated, just in the other direction).
- Detecting/preserving manually-overridden task assignments (see §2).
- Money-vs-respect weighting beyond the simple proportional split — no per-member skill-based optimization of which specific member goes to which specific task variant beyond the money/respect/wanted-level categorization.

## Verify Script — `verify-gang.js`

Mostly non-destructive, with recruitment and equipment purchase flagged as real but low-risk/reversible-in-effect actions (equipment purchase is permanent but small relative to gang scale; recruitment is pure upside with no downside once karma threshold is already met, which it is).

```
CHECK: current gang info -- print raw ns.gang.getGangInformation()
CHECK: current roster -- print member names, current tasks, current stats
CHECK: canRecruitMember() = <bool>; if true, recruits one member as a real action
       and assigns it the lowest-priority open task slot
CHECK: for each member, print ns.gang.getAscensionResult(memberName) raw output --
       confirms the function name/signature and what fields it actually returns
CHECK: list of task names available for this gang's type -- print raw
       ns.gang.getTaskNames() (or equivalent), so the money/respect/wanted-level
       categorization in the main script can be confirmed against real names
       -- this is the most important check in this run given the type switch;
       the money/respect/wanted-level task lists in this spec are reconstructed
       from general knowledge, not freshly verified, and need real confirmation
CHECK: current wanted level and wanted level penalty, if exposed
CHECK: current territory clash win chance -- print raw output of whichever function
       exposes it (ns.gang.getChanceToWinClash() or equivalent), and compare against
       territoryWarfareWinThreshold from config -- would auto-engage trigger right now? <bool>
CHECK: territory-vs-task-output relationship -- print current territory% alongside
       a money-task's current getActionRankGain/money-equivalent output, so the
       territory-scaling claim behind this spec's combat-gang revision can be
       checked against real numbers over time, not just trusted from research
CHECK: equipment cost list -- print ns.gang.getEquipmentNames() and getEquipmentCost()
       for each, cross-referenced against what each member already owns
```

**Expected output when correct:** every `CHECK:` line present, real task names/equipment names/ascension-result fields confirmed against what the Algorithm section assumed, one real recruitment happened if a slot was open (harmless), win-chance value printed even if it doesn't cross the threshold.

## Acceptance Criteria

1. `verify-gang.js` run once confirms the real function names and field shapes for `getAscensionResult`, task names, and clash win chance — replacing every "believed to be" in this spec with a confirmed fact before the main daemon is trusted to run unattended.
2. Roster stays at or below 12 members, growing only via the `canRecruitMember()` gate.
3. `/data/status/gang.json` matches the schema after any run.
4. Manually setting wanted level high (or waiting for it to rise naturally) causes the next cycle to visibly reassign at least one member to a wanted-reducing task, confirmed by diffing member task assignments before/after.
5. Territory warfare only engages when the logged win-chance value is at or above the configured threshold — confirmed by cross-referencing `/data/logs/gang-events.jsonl` entries against `/data/status/gang.json`'s `territoryWarfareEngaged` value over a run.

## Confidence Notes

- **High confidence** on the existence and general shape of `ns.gang.getGangInformation()`, `ns.gang.getMemberNames()`, `ns.gang.getMemberInformation()`, `ns.gang.setMemberTask()`, `ns.gang.purchaseEquipment()`, `ns.gang.recruitMember()`/`canRecruitMember()`, `ns.gang.setTerritoryWarfare()` — these are core, well-documented gang API functions.
- **Medium confidence** on the exact task name strings for combat-type gangs and which specific tasks count as "money," "respect," or "wanted-level-reducing" — reconstructed from general knowledge of combat-gang tasks (`Mug People`/`Deal Drugs`/`Strongarm Civilians`/`Run a Con`/`Armed Robbery`/`Traffick Illegal Arms`/`Threaten & Blackmail`/`Human Trafficking` skew money, `Terrorism` skews respect, `Vigilante Justice` reduces wanted level), not freshly pulled from source the way the original hacking-gang list was. `verify-gang.js`'s task-name check exists specifically to close this gap before the main script relies on hardcoded names.
- **Medium confidence, the central assumption behind this spec's revision**: that combat-gang tasks scale meaningfully with territory percentage and that this makes combat gangs outearn hacking gangs at your scale. This is community-sourced (consistent across multiple independent reports, which raises confidence somewhat above a single anecdote) but not verified against your own save, and the reported earnings figures varied by orders of magnitude across sources, suggesting heavy stage-dependency. `verify-gang.js`'s territory-vs-output check exists to start collecting real evidence on this rather than leave it as an assumption baked into the config default.
- **Medium confidence** that `ns.gang.getAscensionResult(memberName)` is a preview-only function (computes without committing) rather than requiring a separate ascend call to see the numbers — this is the standard pattern I recall, but the verify script's raw-output check should confirm both the function name and that it doesn't have a side effect before the main daemon calls it every cycle.
- **Medium confidence** on the exact function name for territory clash win chance (`getChanceToWinClash` vs. something under `getOtherGangInformation()`'s per-gang power values needing manual comparison) — flagged for the same reason, confirmed via `verify-gang.js` before being load-bearing.
- **Low confidence, explicitly a guess** on `wantedLevelThreshold`'s sane default value — I don't have a verified sense of what wanted-level scale is "fine to ignore" vs. "actively hurting gains" at your stats/scale. Suggested starting default `1.0` is a placeholder meant to be tuned after watching real `/data/logs/gang-events.jsonl` output, not a researched number.
