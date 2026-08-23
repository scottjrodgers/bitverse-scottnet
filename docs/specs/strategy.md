# Spec: Strategy Layer

**Status:** normative. This document defines the top layer of the automation. Implementations
must conform to it; where code and this document disagree, this document wins until it is
deliberately changed.

**Supersedes:** the phase machine, cash-fraction table, and build order previously in
`automation-architecture.md`.
**Companion:** `specs/manager-contract.md` (normative — the operational layer beneath this one).

---

## 0. Scope, and the one rule

This layer decides **what the system is trying to achieve and which resources each subsystem
may use.** It contains no domain logic.

> **The strategy layer never learns what a BitNode is, what karma is, or what a corporation is.
> Every BitNode-specific and objective-specific fact enters as data.**

If the allocator contains a branch on BitNode number, a named subsystem, or a named game
mechanic, the logic is in the wrong place. The escape hatch is always: express it as a goal, a
constraint, or a candidate.

**Vocabulary.** A **controller** is a long-lived process owning one domain (`hacking`, `infra`,
`corp`, `sleeves`, …). What earlier drafts called a "manager" is a controller; the terms are
interchangeable and `manager-contract.md` still governs their operational behaviour. The
**Director** is the single process implementing this specification.

---

## 1. Objects

Six object types. Everything in this layer is one of them.

| Object | Written by | Purpose |
|---|---|---|
| `Goal` | human or Director | what should become true |
| `Constraint` | human or Director | a hard boundary the plan may not cross |
| `Preference` | human | soft guidance, applied only at tie-break |
| `Candidate` | controllers | an offered way to make progress, with its price |
| `Directive` | Director | a purchase approval or a resource lease |
| `Decision` | Director | the record of why the current directives were chosen |

---

## 2. Goals

`/state/goals.json` — **human-writable.** The Director reads it every tick and treats an edit
as it treats any other state change. There is no separate command channel for goals: adding a
goal from the command line and the Director adding one internally are the same operation.

```jsonc
{
  "schema": 1,
  "epoch": 7,
  "goals": [
    {
      "id": "gang-karma",
      "source": "user",
      "enabled": true,
      "survivesInstall": true,
      "condition": { "kind": "threshold", "path": "player.karma", "op": "<=", "value": -54000 },
      "deadline": null,
      "preconditions": []
    },
    {
      "id": "buy-augs-this-cycle",
      "source": "system",
      "enabled": true,
      "survivesInstall": false,
      "condition": { "kind": "predicate", "name": "wantedAugsPurchased" },
      "deadline": 1755561783000,
      "preconditions": ["nitesec-rep"]
    }
  ]
}
```

### 2.1 Order is priority

The array order **is** the ranking. There is no priority field. This matches the recipe DSL's
convention and keeps the ordering visible and editable rather than emergent from weights.

### 2.2 `survivesInstall`

Required on every goal. `true` means the goal remains valid after an augmentation install;
`false` means it was a goal *of* that cycle and is removed by the install callback (§8.2).

This is the one place in the system where per-field lifecycle labelling is unavoidable. It is
tolerable because the goal list is small and human-maintained.

### 2.3 Allocatable vs. structural goals

A goal is **allocatable** if and only if all three hold:

1. its `condition` is a `threshold` on a numeric `path`,
2. the current value of that `path` is known, and
3. at least one candidate advertises production of that `path`.

Otherwise it is **structural**. Structural goals order the list, express preconditions, and
gate other goals — but they consume no resources directly and never appear in the allocation.

A structural goal is satisfied when its condition evaluates true. It is *progressed* only by
its preconditions and by the allocatable goals beneath it. "Reach BN10" is structural;
"karma ≤ −54000" is allocatable.

### 2.4 Preconditions

`preconditions` is a list of goal ids that must be **satisfied** before this goal is eligible
for allocation. Prerequisite chains are authored as data; the Director performs no search to
discover them.

An ineligible goal is skipped entirely — it neither consumes resources nor blocks goals below
it in the list.

---

## 3. Conditions

Composable. Six kinds, and no others without a schema bump.

```jsonc
{ "kind": "threshold", "path": "player.karma", "op": "<=", "value": -54000 }
{ "kind": "equals",    "path": "gang.exists", "value": true }
{ "kind": "predicate", "name": "wantedAugsPurchased" }
{ "kind": "and",  "children": [ … ] }
{ "kind": "or",   "children": [ … ] }
{ "kind": "not",  "child": { … } }
```

`op` is one of `<=`, `>=`, `<`, `>`.

**`path` is a dotted path into the world view (§8.1), not into the game.** The Director never
calls a game API to evaluate a condition. If a path is unresolvable the condition is
`unknown` — neither true nor false — and its goal is treated as structural for that tick.

**`predicate` names are resolved from a registry** that controllers populate. A predicate is a
pure function of the world view. The registry is where domain knowledge is permitted to touch
this layer, and it is the only such place.

---

## 4. Constraints and preferences

### 4.1 Constraints — hard

`/state/constraints.json`, human-writable. A directive set that violates any constraint is
invalid and must not be published.

```jsonc
{ "id": "money-floor",  "kind": "reserve", "resource": "money",     "value": 5e6 }
{ "id": "home-ram",     "kind": "reserve", "resource": "ram:home",  "value": 32 }
{ "id": "no-install",   "kind": "forbid",  "action": "installAugmentations" }
{ "id": "no-city-join", "kind": "forbid",  "action": "joinFaction", "match": { "type": "city" } }
```

`reserve` withholds an amount of a resource from all allocation. `forbid` prevents an action
type from being approved regardless of score.

This replaces the ad-hoc `reserveFloor` field and the `haltPerishableSpending` directive of
earlier drafts. Both were the same concept implemented twice.

### 4.2 Preferences — soft

Applied **only** to break a tie (§6.5). They are never terms in the score. A preference cannot
cause a lower-scoring candidate to win outright; it can only choose among candidates the
allocator considers equivalent.

```jsonc
{ "id": "prefer-sleeve-crime", "kind": "preferProducer",
  "match": { "controller": "sleeves", "producesPath": "player.karma" }, "weight": 0.3 }
```

---

## 5. Resources

Four kinds. The taxonomy is deliberately generic; nothing here names a game mechanic.

| Kind | Semantics | Examples |
|---|---|---|
| `exclusive` | one holder at a time, integral | `player`, `sleeve:3` |
| `consumable` | spent and gone | `money`, `hashes` |
| `capacity` | divisible, held for a duration, returned | `ram:home`, `ram:pserv-0` |
| `regenerating` | consumable with a refill rate | `bladeburner.stamina` |

A resource id is `kind:instance` where instances exist (`ram:pserv-0`, `sleeve:3`) and a bare
name where they do not (`money`).

**Capacity resources are the only revocable kind** (§7.2). Exclusive resources are reassigned
between planning intervals. Consumables are gone once spent.

---

## 6. Candidates and allocation

### 6.1 What a controller advertises

Each controller publishes a `candidates` array in its own state file. This replaces the `wants`
array of `manager-contract.md` §5, which conflated two different things (§6.2).

**Controllers advertise tiers, not a single take-it-or-leave-it bid.** A hacking controller
offering only "give me 4096 GB" cannot be told it has 512; one offering a curve can be
allocated the tier that fits. Tiering is also what lets the allocator find saturation without a
special-case detector (§6.4).

```jsonc
// production candidate — a standing tier
{
  "id": "hwgw:phantasy:t2",
  "kind": "production",
  "tier": 2,
  "produces": { "path": "player.money", "ratePerSec": 4.2e6 },
  "requires": { "ram": 4096 },
  "transition": { "startSec": 240, "stopSec": 90 },
  "confidence": "measured"
}

// purchase candidate — one-shot
{
  "id": "pserv-upgrade:512->1024",
  "kind": "purchase",
  "cost": { "money": 1.1e8 },
  "produces": { "path": "player.money", "ratePerSec": 90000 },
  "permanent": false
}
```

`confidence` is one of `measured`, `modelled`, `guessed`. It does not affect the score. It is
recorded so that the decision log can be analysed for estimator quality (§9), and so a human
can see when the Director is acting on a guess.

`produces.path` **must** match a goal `condition.path` for the candidate to be considered. This
name match is the entire coupling between a goal and the mechanism that satisfies it. The
Director does not know that homicide produces karma; the sleeves controller advertises
production of `player.karma` and that is sufficient.

### 6.2 Two output kinds, kept separate

Earlier drafts used one `wants` array for both. They are different problems:

| | Purchase | Lease |
|---|---|---|
| Shape | discrete, one-shot | standing, continuous |
| Resource | consumable | capacity or exclusive |
| Revocable | no | yes (§7.2) |
| Output | an approval | a `(resource, amount)` grant |

Both are scored by the same currency (§6.3). Only the directive they produce differs.

### 6.3 Marginal time is the currency

For an allocatable goal `g` with shortfall `S` and current aggregate production rate `R`:

```
eta(g) = S / R                       // seconds to completion, Infinity when R == 0
```

For a candidate contributing `ΔR`:

```
gain = eta(g) − S / (R + ΔR)         // seconds of completion time removed
score = gain / cost                  // seconds removed per unit of the binding resource
```

`cost` is the amount of the scarcest resource the candidate requires. Where a candidate
requires several, score it against each contested resource separately and allocate per
resource.

**Why this and not weighted goal scores.** Seconds are a real unit. Two candidates serving
different goals are directly comparable without inventing weights, and the number means
something a human can check.

**Zero-rate rule.** When `R == 0` and `ΔR > 0`, `gain` is infinite: this candidate is the only
way to make any progress at all. Such candidates rank above every finite improvement, tie-broken
by goal order. This is what makes bootstrap work without special-casing it (§10).

### 6.4 Saturation is free

When a goal's `eta` stops falling as more resource is added, further tiers score ~0 and stop
winning. There is no separate saturation detector, and no per-controller threshold to tune.
A controller that has saturated simply stops being allocated more.

### 6.5 The gate and the ranking

Allocation proceeds per resource, greedily:

1. Discard candidates whose `produces.path` matches no enabled, eligible goal.
2. Discard candidates violating any `forbid` constraint.
3. Apply the **horizon gate**: a candidate is admissible if
   `paybackSec < horizon || permanent == true`, where `horizon` is the smaller of the serving
   goal's remaining deadline and the current install horizon. Candidates with no deadline and
   no install horizon are admissible.
4. Rank the remainder by `score`.
5. Break ties by goal order, then by preference weight, then by candidate id.
6. Allocate down the ranked list until the resource is exhausted or no admissible candidate
   remains, respecting `reserve` constraints.

The horizon gate is the perishable/permanent rule from the mechanics reference, expressed
generally. It appears three times in this specification — here, in reallocation (§7.3), and
implicitly in purchase approval — and it is the same rule each time.

### 6.6 When to allocate

**Event-driven, not continuous.** Re-allocate on:

- a goal becoming satisfied, unsatisfied, eligible, or ineligible
- the goals or constraints file changing
- a controller publishing materially changed candidates
- a capacity resource appearing or disappearing
- a periodic safety interval (default 60s)

Continuous re-solving produces jitter in the directives and thrash in the controllers.

---

## 7. Directives

`/state/director.json`. The Director is its only writer.

```jsonc
{
  "schema": 1,
  "epoch": 7,
  "lastRun": 1755561783000,
  "purchases": [
    { "candidateId": "pserv-upgrade:512->1024", "controller": "infra",
      "approvedAt": 1755561783000, "cost": { "money": 1.1e8 } }
  ],
  "leases": [
    { "consumer": "hacking", "resource": "ram:pserv-0", "granted": 4096, "requested": 4096 },
    { "consumer": "corp",    "resource": "ram:home",    "granted": 200,  "requested": 200 }
  ],
  "assignments": { "player": "faction-work:NiteSec", "sleeve:0": "crime:homicide" },
  "horizonSec": 3600
}
```

### 7.1 Purchases

A purchase directive is an **approval**, not an instruction. The controller executes it,
inside its own convergence loop, and reports the result. An approval that is never taken up
expires at the next allocation round.

Controllers **must not** read global money to decide what to spend. They spend against
approvals. This is `manager-contract.md` §1 rule 1, unchanged.

### 7.2 Leases and revocation

Three numbers describe a lease, and **they are not all written by the same process** — this is
required to preserve single-writer ownership:

| Field | Written by | Meaning |
|---|---|---|
| `granted` | Director, in `director.json` | the ceiling the consumer may use |
| `requested` | Director, in `director.json` | what the Director wants the consumer to converge to |
| `held` | the consumer, in its own state file | what the consumer is actually using right now |

To revoke, the Director lowers `requested`. The consumer drains at its own pace and lowers
`held`. The Director may re-grant only what has actually been released — that is, up to
`granted − held`.

**The Director never pre-empts work.** It adjusts a number; the consumer decides how to shrink.
For a batching pipeline that means ceasing to launch and letting in-flight work land. Nothing
in flight is ever corrupted, and the Director remains ignorant of what "in flight" means.

`held > requested` is a normal transient state, not an error.

### 7.3 Reallocation cost

Moving a capacity resource away from a consumer costs the `transition.stopSec` of the losing
candidate plus the `transition.startSec` of the winner — real seconds of lost production.

A reallocation is admissible only if its `gain` pays back that transition cost within the
horizon. This is the §6.5 gate applied to the switch itself.

Anti-thrash therefore requires **no hysteresis constant and no per-controller tuning.**
Controllers that are expensive to disturb advertise a large `transition` and become naturally
sticky; cheap ones move freely.

### 7.4 Assignments

Exclusive resources are assigned rather than leased. An assignment holds until the next
allocation round. Controllers must tolerate reassignment between rounds.

---

## 8. State lifecycle

### 8.1 The world view

The Director evaluates conditions against a **world view** assembled from controller state
files, never by calling game APIs itself. This is forced by RAM — a single collector touching
every domain cannot fit in a bootstrap home machine — and it is better regardless, because
staleness becomes explicit.

Every contributing file carries `lastRun`. A path sourced from a file older than
`3 × tickMs` resolves to `unknown` rather than to a stale value.

### 8.2 Observations vs. knowledge

> **Observations are never persisted across an augmentation install. Knowledge is.**

```
/state/     observations — deleted wholesale on install, rebuilt by measurement
/memory/    knowledge    — survives, and is the only thing that does
```

The test is a type distinction, not a field-by-field judgment:

| Observation (`/state/`) | Knowledge (`/memory/`) |
|---|---|
| current faction reputation | measured rep-per-second per unit of charisma |
| owned servers and their RAM | measured p99 launch jitter |
| current money | measured income per GB-second by target |
| goals of this cycle | calibrated model constants, contract solutions |

This mirrors the perishable/permanent asset ledger, applied to information.

**Mechanism.** `installAugmentations` accepts a callback script. That callback deletes
`/state/` in full, removes goals with `survivesInstall: false`, increments `epoch` in
`/memory/`, and touches nothing else.

**Failsafe.** Every state file carries `epoch`. A file whose epoch does not match the current
one is invalid regardless of content. This catches a callback that failed to run — the failure
mode that would otherwise let the Director allocate against a world that has ended.

---

## 9. The decision record

The Director publishes not only its decision but **its reasoning**.

`/state/decision.json` holds the latest round; `/logs/decisions.jsonl` holds the history.

```jsonc
{
  "epoch": 7, "bitNode": 10, "t": 1755561783000,
  "trigger": "goalSatisfied:gang-karma",
  "horizonSec": 3600,
  "resource": "ram:pserv-0",
  "ranked": [
    { "candidateId": "hwgw:phantasy:t2", "goal": "cycle-income",
      "gain": 412.0, "cost": 4096, "score": 0.1006,
      "gate": "pass", "outcome": "granted", "confidence": "measured" },
    { "candidateId": "share:nitesec", "goal": "nitesec-rep",
      "gain": 88.0, "cost": 4096, "score": 0.0215,
      "gate": "pass", "outcome": "displaced", "confidence": "modelled" },
    { "candidateId": "pserv-upgrade:512->1024", "goal": "cycle-income",
      "gain": 30.0, "cost": 1.1e8, "score": 2.7e-7,
      "gate": "fail:paybackExceedsHorizon", "outcome": "rejected" }
  ]
}
```

**Rejected candidates are logged, not only chosen ones.** Counterfactuals are where the useful
analysis lives and they are unrecoverable after the fact.

This object serves three purposes at once and is written once: it is the Director's audit
trail, the CLI's data source (§11), and the analysis input (§10).

---

## 10. Logging for analysis

Three JSONL streams, designed to load into a dataframe rather than to be grepped.

| Stream | Cadence | Contents |
|---|---|---|
| `/logs/decisions.jsonl` | event-driven | §9 records |
| `/logs/actions.jsonl` | per action | what executed, cost, result |
| `/logs/observations.jsonl` | fixed interval (default 10s) | money, RAM in use, rep, income rate, goal shortfalls |

**Every record carries `epoch`, `bitNode`, and wall-clock `t`.** Without node and epoch,
cross-run analysis silently mixes incomparable regimes — BitNode multipliers mean a BN9 income
rate and a BN10 income rate are not the same measurement.

The join that matters is `decision → action → subsequent observation`, which answers: **was the
predicted marginal time right?** That is a model-validation loop on this specification's central
estimate, and it is the only way to learn whether marginal time is a good currency or merely a
plausible-sounding one.

The observation stream is sampled on a wall-clock interval, not per tick, so the series is
regular and needs no resampling.

---

## 11. The command line

The CLI is a **formatter over `/state/` and `/logs/`, with no privileged channel.** It calls no
game API and holds no logic of its own.

| Question | Answered from |
|---|---|
| what are my priorities? | goals file order + latest decision record |
| why is X getting the RAM? | decision record `ranked` array |
| how long until Y? | `eta` for goal Y in the latest decision record |
| prioritize aug Z | edit the goals file; effective next tick |

Because the CLI reads observations rather than the game, it must **report the age of what it
shows** — "as of 4s ago" — rather than implying live data. The observation interval is the
published freshness guarantee.

Human edits to goals and constraints require no restart and no protocol. Target-state
convergence means the next tick simply sees a different target.

---

## 12. Cold start

At `t = 0` after a BitNode change there is no income history, so every rate is unknown and
every `eta` is `Infinity`.

**This is the degenerate case of the general mechanism, not an exception to it:**

- **Capacity resources are uncontested.** Nothing but hacking can bid for RAM — `share()`
  requires faction membership not yet held, corp requires funds not yet held. The single
  bidder wins by default.
- **Consumables are contested but totally ordered.** The zero-rate rule (§6.3) ranks any
  candidate that produces progress above every candidate that merely accelerates it, and goal
  order settles the rest.

No phase machine is required and none is defined. The moment two controllers first bid for the
same resource is loggable, and is the honest definition of where a run begins to diverge from
every other run.

**A consequence worth stating: run the cheapest tier of every controller early even where its
output is worthless.** Its telemetry is not worthless — measurement is what converts `guessed`
estimates into `measured` ones, and nothing else populates the allocator's inputs.

---

## 13. Recursion

The allocator is a **library, not a Director feature.**

A corporation runs the same algorithm over corporate funds, its own goals, and its own
candidates — a fully separate resource pool that player money cannot enter. Any subsystem with
an internal economy may do the same.

The Director is one instantiation of the library with the player's resource pool. This is a
constraint on implementation: nothing in the allocator may reference `/state/director.json`,
player money, or any other specific pool.

---

## 14. Open questions

Live and unresolved. None blocks a first implementation.

1. **Revocation granularity.** §7.2 assumes lease-level revocation with consumer-side drain is
   sufficient. Confirm against a real HWGW pipeline before treating it as settled.
2. **Multi-resource candidates.** §6.3 scores against the scarcest required resource. A
   candidate genuinely contended on two resources at once is not handled well. Unclear whether
   this occurs in practice.
3. **`eta` for compound goals.** Structural goals have no `eta`, so the CLI cannot answer "how
   long until BN10?" — only "how long until the leaf goals beneath it." Possibly acceptable.
4. **Predicate registry ownership.** §3 permits controllers to register predicates. The
   loading mechanism, and its RAM cost, are unspecified.
5. **Estimator quality.** Whether `confidence` should eventually discount `score` rather than
   merely annotate it. Answerable from the §10 join once data exists.
