# Spec: Strategy Layer

**Status:** normative. Where code and this document disagree, this document wins until it is
deliberately changed.

**Companion:** `specs/manager-contract.md` (the operational layer beneath this one).
**Reasoning:** `reference/rationale.md`. This document states rules, not arguments. Every
"why" was moved there.

---

## 0. Scope

This layer decides **what the system is trying to achieve and which resources each subsystem
may use.** It contains no domain logic.

> **The strategy layer never learns what a BitNode is, what karma is, or what a corporation
> is. Every BitNode-specific and objective-specific fact enters as data.**

If the allocator branches on a BitNode number, a named subsystem, or a named game mechanic,
the logic is in the wrong place. The escape hatch is always: express it as a goal, a
constraint, or a candidate.

**A second boundary, equally binding:**

> **The Director prices execution within a chosen means. It does not choose the means.**

Choices whose payoff lies past the currency's horizon — found a corporation, form a gang, exit
via hacking or Bladeburner — are authored as goals by the human. They are not candidates and
are never scored. Below such a choice, the domain unrolls its own prerequisite chain, and
everything in that chain is priceable normally.

**Vocabulary.** A **controller** is a long-lived process owning one domain. The **Director**
is the single process implementing this specification. There is exactly one Director per
resource pool.

---

## 1. Objects

| Object | Written by | Purpose |
|---|---|---|
| `Goal` | human, Director, or controller | what should become true |
| `Constraint` | human | a hard boundary the plan may not cross |
| `Preference` | human | soft guidance, applied only at tie-break |
| `Candidate` | controllers | an offered way to make progress, with its price |
| `Directive` | Director | a purchase approval or a resource lease |
| `Decision` | Director | the record of why the current directives were chosen |
| `Escalation` | controllers, Director | a decision deferred to the human |

---

## 2. Goals

`/state/goals.json` — human-writable. The Director reads it every tick and treats an edit as
any other state change. There is no separate command channel: adding a goal from the command
line and the Director adding one internally are the same operation.

```jsonc
{
  "schema": 2,
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
    }
  ]
}
```

`source` is `user`, `system` (Director), or a controller id.

### 2.1 Order is priority

Array order **is** the ranking. There is no priority field.

### 2.2 `survivesInstall`

Required on every goal. `false` means the goal was a goal *of* that cycle and is removed by
the install callback (§9.2).

### 2.3 Allocatable vs. structural

A goal is **allocatable** if and only if:

1. its `condition` is a `threshold` on a numeric `path`,
2. the current value of that `path` is known, and
3. at least one candidate advertises production of that `path`.

Otherwise it is **structural**. Structural goals order the list, express preconditions, and
gate other goals; they consume no resources and never appear in an allocation. A structural
goal is satisfied when its condition evaluates true.

### 2.4 Preconditions

`preconditions` lists goal ids that must be **satisfied** before this goal is eligible.
Prerequisite chains are authored as data; the Director performs no search to discover them.
An ineligible goal is skipped entirely — it neither consumes resources nor blocks goals below
it.

### 2.5 Multiple writers

`goals.json` has more than one writer: the human, the Director, the install callback, and
(§2.6) controllers. This is the sole exception to the single-writer rule of
`manager-contract.md` §1, and it is a **lost-update race** that must be handled explicitly.

**Required:** compare-and-set on a monotonically increasing `revision` field. A writer that
loses re-reads and retries. Whole-document writes without a revision check are non-conforming.

### 2.6 Controller-authored goals

A controller may author a goal for a path it does not produce — the gang controller requiring
`player.combat >= N`, satisfiable by gym or by crime. Such goals carry `source: "<controller>"`
and `survivesInstall: false` unless the controller states otherwise.

A controller must not author a goal that a means-level choice would decide (§0). It authors
prerequisites of a means already chosen, never the means.

---

## 3. Conditions

```jsonc
{ "kind": "threshold", "path": "player.karma", "op": "<=", "value": -54000 }
{ "kind": "equals",    "path": "gang.exists", "value": true }
{ "kind": "predicate", "name": "wantedAugsPurchased" }
{ "kind": "and", "children": [ … ] }
{ "kind": "or",  "children": [ … ] }
{ "kind": "not", "child": { … } }
```

`op` is one of `<=`, `>=`, `<`, `>`. Six kinds, and no others without a schema bump.

`path` is a dotted path into the world view (§9.1), **not into the game.** The Director never
calls a game API to evaluate a condition. An unresolvable path yields `unknown` — neither true
nor false — and its goal is treated as structural for that tick.

`predicate` names resolve from a registry that controllers populate. A predicate is a pure
function of the world view. **This registry is the only place domain knowledge may touch this
layer.**

---

## 4. Constraints and preferences

### 4.1 Constraints — hard

`/state/constraints.json`, human-writable. A directive set violating any constraint is invalid
and must not be published.

```jsonc
{ "id": "money-floor",  "kind": "reserve", "resource": "money",    "value": 5e6 }
{ "id": "hacking-cap",  "kind": "reserve", "resource": "ram:*",    "value": 0.5, "unit": "fraction", "against": "hacking" }
{ "id": "no-install",   "kind": "forbid",  "action": "installAugmentations" }
{ "id": "hacknet-roi",  "kind": "admit",   "match": { "controller": "hacknet" }, "maxPaybackSec": 3600 }
```

Three kinds:

- `reserve` — withholds an amount or fraction of a resource from allocation.
- `forbid` — prevents an action type from being approved regardless of score.
- `admit` — bounds the admissibility of a class of candidates (§6.5 step 3).

Run-level strategy is expressed entirely as goals plus constraints. **There is no separate
strategy file.**

### 4.2 Preferences — soft

Applied **only** to break a tie (§6.5). Never terms in the score. A preference cannot cause a
lower-scoring candidate to win outright.

```jsonc
{ "id": "prefer-sleeve-crime", "kind": "preferProducer",
  "match": { "controller": "sleeves", "producesPath": "player.karma" }, "weight": 0.3 }
```

---

## 5. Resources

| Kind | Semantics | Examples |
|---|---|---|
| `exclusive` | one holder at a time, integral | `player`, `sleeve:3` |
| `consumable` | spent and gone | `money`, `hashes` |
| `capacity` | divisible, held for a duration, returned | `ram:home`, `ram:pserv-0` |
| `regenerating` | consumable with a refill rate | `bladeburner.stamina` |

A resource id is `kind:instance` where instances exist, a bare name where they do not.

**Capacity resources are the only revocable kind** (§7.2). Exclusive resources are reassigned
between rounds. Consumables are gone once spent.

---

## 6. Candidates and allocation

### 6.1 What a controller advertises

Each controller publishes a `candidates` array in its own state file. Controllers advertise
**tiers**, not a single take-it-or-leave-it bid.

```jsonc
{
  "id": "hwgw:phantasy:t2",
  "kind": "production",
  "tier": 2,
  "produces": { "path": "player.money", "ratePerSec": 4.2e6 },
  "requires": { "ram": 4096 },
  "transition": { "startSec": 240, "stopSec": 90 },
  "confidence": "measured"
}

{
  "id": "pserv-upgrade:512->1024",
  "kind": "purchase",
  "cost": { "money": 1.1e8 },
  "produces": { "path": "player.money", "ratePerSec": 90000 },
  "permanent": false
}
```

`confidence` is `measured`, `modelled`, or `guessed`. It does not affect the score; it is
recorded for estimator analysis (§11) and so a human can see when the Director is acting on a
guess.

`produces.path` **must** match a goal `condition.path` for the candidate to be considered.
This name match is the entire coupling between a goal and the mechanism that satisfies it.

**A rate must be honest.** A candidate advertises the marginal production its resource
actually buys — for a running subsystem, the difference between operating and not operating,
not its gross output. A rate that cannot be derived or measured must not be invented; the
controller advertises fewer tiers instead (§6.7).

**Inelasticity needs no new kind.** A subsystem whose resource requirement is fixed advertises
exactly one tier.

### 6.2 Purchases and leases

| | Purchase | Lease |
|---|---|---|
| Shape | discrete, one-shot | standing, continuous |
| Resource | consumable | capacity or exclusive |
| Revocable | no | yes (§7.2) |
| Output | an approval | a `(resource, amount)` grant |

Both are scored by the same currency. Only the resulting directive differs.

### 6.3 Marginal time is the currency

For an allocatable goal `g` with shortfall `S` and aggregate production rate `R`:

```
eta(g) = S / R                       // Infinity when R == 0
gain   = eta(g) − S / (R + ΔR)       // seconds of completion time removed
score  = gain / cost                 // seconds removed per unit of binding resource
```

`cost` is the amount of the scarcest resource required.

**Zero-rate rule.** When `R == 0` and `ΔR > 0`, `gain` is infinite: this candidate is the only
way to make any progress. Such candidates rank above every finite improvement, tie-broken by
goal order. This is what makes bootstrap work without special-casing (§13.2).

**Scope limit — normative.** Marginal time prices **throughput**. It does not price:

- **search depth** — resource that buys a better decision rather than more work;
- **delayed payoff** — investment whose return lies beyond the horizon.

A candidate of either kind must not be advertised. Search depth is a private domain parameter,
not an allocator input. Delayed payoff is a means-level choice and belongs in §0.

### 6.4 Multi-resource candidates

A candidate requiring several contested resources is scored against each separately.

**A candidate may declare `atomic: true`**, meaning a partial grant is worse than none. The
allocator must grant all required resources or none. Absent this flag, partial grants are
permitted.

### 6.5 The gate and the ranking

Per resource, greedily:

1. Discard candidates whose `produces.path` matches no enabled, eligible goal.
2. Discard candidates violating any `forbid` constraint.
3. Apply the **horizon gate**: admissible if `paybackSec < horizon || permanent == true`,
   where `horizon` is the smaller of the serving goal's remaining deadline and the current
   install horizon, further bounded by any matching `admit` constraint. Candidates with no
   deadline and no install horizon are admissible.
4. Discard candidates from controllers reporting `health: "blocked"` (§8.4).
5. Rank the remainder by `score`.
6. Break ties by goal order, then preference weight, then candidate id.
7. Allocate down the list until the resource is exhausted or no admissible candidate remains,
   respecting `reserve` constraints.

**Step 7 and indivisible candidates.** An `atomic` or single-tier candidate that does not fit
in the remaining resource is **reserved toward**, not skipped: the Director records an
outstanding reservation in `director.json` and withholds the accumulating resource from
lower-ranked candidates for at most `reservationTtlSec` (default 300). On expiry the
reservation lapses and normal allocation resumes.

*This is a new mechanism. See SQ-2.*

### 6.6 Saturation

When a goal's `eta` stops falling as resource is added, further tiers score ≈ 0 and stop
winning. There is no saturation detector and no per-controller threshold.

### 6.7 When to allocate

Event-driven. Re-allocate on:

- a goal becoming satisfied, unsatisfied, eligible, or ineligible
- the goals or constraints file changing
- a controller publishing materially changed candidates
- a capacity resource appearing or disappearing
- an escalation being answered (§8)
- a periodic safety interval (default 60s)

---

## 7. Directives

`/state/director.json`. The Director is its only writer.

```jsonc
{
  "schema": 2,
  "epoch": 7,
  "lastRun": 1755561783000,
  "purchases": [
    { "candidateId": "pserv-upgrade:512->1024", "controller": "infra",
      "approvedAt": 1755561783000, "cost": { "money": 1.1e8 }, "state": "approved" }
  ],
  "leases": [
    { "consumer": "hacking", "resource": "ram:pserv-0", "granted": 4096, "requested": 4096 }
  ],
  "reservations": [
    { "candidateId": "corp:daemon", "resource": "ram:home", "toward": 200, "expiresAt": 1755562083000 }
  ],
  "assignments": { "player": "faction-work:NiteSec", "sleeve:0": "crime:homicide" },
  "horizonSec": 3600
}
```

### 7.1 Purchases

A purchase directive is an **approval**, not an instruction. The controller executes it inside
its own convergence loop and reports the result.

Controllers **must not** read global money to decide what to spend. They spend against
approvals.

**A purchase is consumed at grant time, not at observation.** The `state` field
(`approved` → `taken` → `expired`) in `director.json` is the authority on what has been funded.
The Director must not re-approve a purchase whose approval is still outstanding, even if the
domain's state file has not yet reflected it.

### 7.2 Leases and revocation

| Field | Written by | Meaning |
|---|---|---|
| `granted` | Director | the ceiling the consumer may use |
| `requested` | Director | what the Director wants the consumer to converge to |
| `held` | the consumer | what the consumer is actually using |

To revoke, the Director lowers `requested`. The consumer drains at its own pace and lowers
`held`. The Director may re-grant only what has been released — up to `granted − held`.

**The Director never pre-empts work.** It adjusts a number; the consumer decides how to shrink.
`held > requested` is a normal transient state, not an error.

### 7.3 Reallocation cost

Moving a capacity resource costs the `transition.stopSec` of the loser plus the
`transition.startSec` of the winner. A reallocation is admissible only if its `gain` pays back
that cost within the horizon.

Anti-thrash therefore needs no hysteresis constant and no per-controller tuning: expensive-to-
disturb controllers advertise a large `transition` and become naturally sticky.

**Consequence to watch.** A controller whose output degrades while its `transition` stays large
becomes progressively harder to reallocate away from, exactly when it should be abandoned. See
SQ-4.

### 7.4 Assignments

Exclusive resources are assigned, not leased. An assignment holds until the next round.
Controllers must tolerate reassignment between rounds.

---

## 8. Escalation

### 8.1 The criterion — normative

> **A decision is escalatable if and only if a wrong answer would not be corrected
> automatically within a few allocation rounds.**

Everything else in this system is convergent: controllers steer toward target state and wrong
answers wash out. Escalations are exactly the decisions that do not self-correct.

This applies to **allocator outputs as well as domain decisions.** Revoking a lease whose loss
is not merely unproductive but actively destructive is escalatable, even though it is the
Director's own conclusion.

Each escalation point is declared, named, and few. A domain requiring more than a handful
indicates the mechanism is wrong for it.

### 8.2 The dial

Per escalation point, one of three settings:

| Setting | Behaviour |
|---|---|
| `auto` | take the default, do not ask |
| `ask` | ask; take the default after `timeoutSec` |
| `block` | ask and wait indefinitely |

Every escalation point **must** declare a default, or `auto` and `ask` are unavailable to it.
The default is the house strategy for that decision and must be written down, not supplied
tacitly.

### 8.3 Representation — convergent state, not messages

A controller does **not** send a question. It writes into its own state file that it is at a
decision point it will not resolve:

```jsonc
"pending": [
  { "id": "corp:accept-round-2", "kind": "irreversible",
    "options": ["accept", "decline"], "recommend": "accept",
    "default": "accept", "dial": "ask", "expiresAt": 1755562083000,
    "since": 1755561783000 }
]
```

The answer is also state, read on the next tick. A restarted controller re-derives and
republishes the same item. No delivery guarantees, no dedup, no lost messages.

The Director publishes its own escalations in `director.json` under the same shape.

The CLI aggregates `pending` across all of `/state/` (§12).

### 8.4 A blocked controller

A controller waiting on a `block` escalation sets `health: "blocked"` and **continues to
heartbeat**. `manager-contract.md` §6 already treats `blocked` as not-an-error; the watchdog
must not restart it.

**A blocked controller keeps its lease.** Blocking is not a retraction — a self-retracting
lease would move resource without a Director decision, producing an unlogged reallocation. The
controller is not immune: the Director may still revoke it through §7.2.

**A blocked controller's candidates are discarded** (§6.5 step 4), and its unmet production is
recorded as `blocked`, not as estimator error, in the §11 validation join.

---

## 9. State lifecycle

### 9.1 The world view

The Director evaluates conditions against a **world view** assembled from controller state
files, never by calling game APIs. Every contributing file carries `lastRun`; a path sourced
from a file older than `3 × tickMs` resolves to `unknown` rather than to a stale value.

### 9.2 Observations vs. knowledge

> **Observations are never persisted across an augmentation install. Knowledge is.**

```
/state/     observations — deleted wholesale on install, rebuilt by measurement
/memory/    knowledge    — survives, and is the only thing that does
```

Both survive a BitNode transition: `.txt` and `.json` files on `home` persist across
`destroyW0r1dD43m0n`. `/state/` is nonetheless rebuilt at node entry, because its contents
describe a world that has ended.

**Mechanism.** `installAugmentations` accepts a callback. The callback deletes `/state/` in
full, removes goals with `survivesInstall: false`, increments `epoch` in `/memory/`, and
touches nothing else.

**Failsafe.** Every state file carries `epoch`. A file whose epoch does not match the current
one is invalid regardless of content.

---

## 10. The decision record

`/state/decision.json` holds the latest round; `/logs/decisions.jsonl` the history.

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
    { "candidateId": "pserv-upgrade:512->1024", "goal": "cycle-income",
      "gain": 30.0, "cost": 1.1e8, "score": 2.7e-7,
      "gate": "fail:paybackExceedsHorizon", "outcome": "rejected" }
  ]
}
```

**Rejected candidates are logged, not only chosen ones.**

This object is written once and serves three consumers: audit trail, CLI data source (§12),
and analysis input (§11).

---

## 11. Logging

| Stream | Cadence | Contents |
|---|---|---|
| `/logs/decisions.jsonl` | event-driven | §10 records |
| `/logs/actions.jsonl` | per action | what executed, cost, result |
| `/logs/observations.jsonl` | fixed interval (default 10s) | money, RAM in use, rep, income rate, goal shortfalls |

**Every record carries `epoch`, `bitNode`, and wall-clock `t`.** Without node and epoch,
cross-run analysis silently mixes incomparable regimes.

The required join is `decision → action → subsequent observation`, answering: **was the
predicted marginal time right?** This is the only validation loop on this specification's
central estimate.

The observation stream is sampled on wall-clock interval, not per tick, so the series is
regular.

---

## 12. The command line

A **formatter over `/state/` and `/logs/`, with no privileged channel.** It calls no game API
and holds no logic.

| Question | Answered from |
|---|---|
| what are my priorities? | goals file order + latest decision record |
| why is X getting the RAM? | decision record `ranked` array |
| how long until Y? | `eta` for goal Y in the latest decision record |
| what needs my answer? | `pending` arrays across `/state/` (§8.3) |
| prioritize aug Z | edit the goals file; effective next tick |

The CLI **must report the age of what it shows** — "as of 4s ago" — rather than implying live
data.

**The CLI cannot show what the system does not model.** Noticing an unmodelled mechanic is the
human's job, and is a stated reason the co-pilot design was chosen.

---

## 13. Bootstrap and cold start

**Two distinct things that share a name.** Conflating them is a known error.

### 13.1 Process bootstrap

At node entry `/state/` is empty. Controller launch metadata therefore **cannot** live only in
controller state files, or nothing can be started.

**Required:** a static `/memory/domains.json` manifest listing every known domain and how to
launch it — data, not logic. The watchdog starts what the manifest names and the Director has
leased; it makes no domain decisions.

**Required property:** the system is startable from a single script, with **no human input**,
given only what is on `home`, at **base home RAM**.

**Gate:** start cold, do not touch it, return in some hours — did it make progress? Measured
as a diff of goal shortfalls in `/logs/observations.jsonl`.

### 13.2 Allocator cold start

At `t = 0` there is no income history, so every rate is unknown and every `eta` is `Infinity`.
This is the degenerate case of the general mechanism, not an exception:

- **Capacity resources are uncontested** — the single bidder wins by default.
- **Consumables are contested but totally ordered** — the zero-rate rule (§6.3) ranks any
  candidate producing progress above every candidate merely accelerating it; goal order settles
  the rest.

No phase machine is required and none is defined.

**Consequence:** run the cheapest tier of every controller early, even where output is
worthless. Its telemetry is not — measurement is what converts `guessed` estimates into
`measured` ones.

---

## 14. Recursion

The allocator is a **library, not a Director feature.** A corporation runs the same algorithm
over corporate funds, its own goals, and its own candidates — a fully separate pool that player
money cannot enter.

The Director is one instantiation with the player's pool. **Nothing in the allocator may
reference `/state/director.json`, player money, or any other specific pool.**

---

## 15. Open questions

Stable ids. Cite these, never section numbers.

| id | Question | Blocks |
|---|---|---|
| **SQ-1** | **Revocation granularity.** §7.2 assumes lease-level revocation with consumer-side drain suffices. Confirm against a real HWGW pipeline. | no |
| **SQ-2** | **Reservation semantics.** §6.5 step 7 is new and untested. Is `reservationTtlSec` the right shape, or should indivisible candidates simply be skipped? | no |
| **SQ-3** | **`eta` for compound goals.** Structural goals have no `eta`, so the CLI cannot answer "how long until X" for them — only for the leaves beneath. Possibly acceptable. | no |
| **SQ-4** | **Degrading sticky candidates.** §7.3's anti-thrash makes a large-`transition` controller harder to displace exactly as its output collapses. Real in BN12 at high levels. | no |
| **SQ-5** | **Predicate registry ownership.** §3 permits controllers to register predicates. Loading mechanism and RAM cost unspecified. | no |
| **SQ-6** | **Estimator quality.** Should `confidence` discount `score` rather than merely annotate it? Now live: §6.1 permits `modelled` and `measured` rates to compete directly. Answerable from the §11 join. | no |
| **SQ-7** | **Escalation vs. `advisoryMode`.** `manager-contract.md`'s `advisoryMode` and §8.2's dial cover overlapping action sets with no defined composition. | yes |
| **SQ-8** | **Negative revocation.** §8.1 escalates destructive revocations, which handles the case operationally, but the schema still cannot *express* that revocation is negative rather than merely unproductive. Whether it needs to is open. | no |
