# Spec: Strategy Layer

**Status:** normative. Where code and this document disagree, this document wins until it is
deliberately changed.

**Companion:** `specs/data-contracts.md` (the operational layer beneath this one).

**Division of authority.** This document owns the **meaning** of every object and rule below.
`data-contracts.md` owns their **schema** — type, permitted values, required-ness, default — and
the file layout that carries them. Where the two describe the same field, read the rule here and
the table there. Field tables are deliberately not reproduced in this document.

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

`/config/goals.json` — human-writable. The Director reads it every tick and treats an edit as
any other state change. There is no separate command channel: adding a goal from the command
line and the Director adding one internally are the same operation.

```jsonc
{
  "schema": 2,
  "revision": 41,
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

**Goals are declared intent and survive an augmentation install.** They live in `/config/`, not
`/state/`, because §9.2 deletes `/state/` in full and a `survivesInstall: true` goal deleted with
it would make that field meaningless. `/config/` holds every human-authored input to the system:
goals, constraints, preferences and the operator switches (§4.3).

### 2.1 Order is priority

Array order **is** the ranking. There is no priority field.

### 2.2 `survivesInstall`

Required on every goal. `false` means the goal was a goal *of* that cycle and is removed by
the install callback (§9.2). `true` goals are left untouched.

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

Static prerequisite knowledge — augmentation and faction chains, industry unlocks — is
pre-generated offline into `/data/prereqs.json` and read by **controllers**, which translate a
node into a goal. The Director reads neither that file nor the graph; it reads only the
`preconditions` a controller or a human already authored.

### 2.4a `eta` of a structural goal

A structural goal has no shortfall and no rate, so its completion time is defined recursively:

```
eta(g) = 0                                     if g is satisfied
       = S / R                                 if g is allocatable
       = max( eta(p) for unsatisfied p in g.preconditions )   if g is structural
       = Infinity                              if that set is empty, or any term is unknown
```

The recursion terminates because `preconditions` is a DAG. A cycle is a malformed goals file:
the Director reports `health: "blocked"` naming the cycle, treats every goal in it as
`eta = Infinity`, and carries on allocating the rest.

### 2.4b Goal roles

A goal may declare a `role`, which is how a **named** quantity reaches the allocator without the
allocator naming a goal. One role is defined:

| Role | Effect |
|---|---|
| `installHorizon` | its `eta` and `deadline` supply the install horizon of §6.5 step 3 |

At most one goal may carry a given role. No goal carries it ⇒ there is no install horizon ⇒
§6.5 admits every candidate with a finite `paybackSec`.

**This is data, exactly like `produces.path`.** The Director never branches on a goal id, and it
never decides *whether* to install — that is an ordinary candidate from an augmentations
controller, gated by an escalation (§8), eligible only once the role goal's preconditions are
satisfied.

### 2.5 Multiple writers

`goals.json` has more than one writer: the human, the Director, the install callback, and
(§2.6) controllers. This is the sole exception to the single-writer rule of
`data-contracts.md` A.1, and it is a **lost-update race** that must be handled explicitly.

**Required:** compare-and-set on a monotonically increasing `revision` field. A writer that
loses re-reads and retries. Whole-document writes without a revision check are non-conforming.

`/config/control.json` (§4.3) is the only other multi-writer file, and uses the same mechanism.

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

`unknown` propagates: `and` with an `unknown` child is `unknown` unless another child is
`false`; `or` with an `unknown` child is `unknown` unless another child is `true`; `not` of
`unknown` is `unknown`.

`predicate` names resolve from a registry that controllers populate. A predicate is a pure
function of the world view. **This registry is the only place domain knowledge may touch this
layer.**

> **`predicate` is not implementable as specified.** Nothing states how a controller registers
> one, where the registry lives, or what it costs in RAM. See SQ-5. Until that is settled, a
> boolean published through `provides` (§9.1) and tested with `equals` does the same work with
> machinery that already exists.

---

## 4. Constraints and preferences

### 4.1 Constraints — hard

`/config/constraints.json`, human-writable. A directive set violating any constraint is invalid
and must not be published.

```jsonc
{ "id": "money-floor",  "kind": "reserve", "resource": "money",    "value": 5e6 }
{ "id": "hacking-cap",  "kind": "reserve", "resource": "ram:*",    "value": 0.9, "unit": "fraction", "against": "hacking" }
{ "id": "no-install",   "kind": "forbid",  "action": "installAugmentations" }
{ "id": "hacknet-roi",  "kind": "admit",   "match": { "controller": "hacknet" }, "maxPaybackSec": 3600 }
{ "id": "no-corp",      "kind": "disable", "controller": "corp" }
```

Four kinds:

- `reserve` — withholds an amount or fraction of a resource from allocation.
- `forbid` — prevents an action type from being approved regardless of score.
- `admit` — bounds the admissibility of a class of candidates (§6.5 step 3).
- `disable` — a controller's candidates are never ranked and its leases drain to zero.

Run-level strategy is expressed entirely as goals plus constraints. **There is no separate
strategy file.**

### 4.1a How a constraint finds what it constrains

`forbid` and `admit` carry a `match`: a flat object compared by **exact equality**, conjunctively,
against a candidate's match surface — `controller`, `id`, `kind`, `group`, `action`,
`producesPath`, and the candidate's own `tags`. A key absent from that surface does not match.
No globs, no regex, no inference.

The controller names its `action` and its `tags`; the Director only compares strings. This is the
identical trick that makes `produces.path` work, and it is why the arrangement does not violate
§0. A controller declares the vocabulary it may use — its `actions` and `tagKeys` — in the domain
manifest (§13.1), so a constraint naming an action or key that no controller declares is a typo
and is reported, not silently inert.

### 4.1b Reserve arithmetic

Stated because the wrong guess is silent:

- Two `reserve` constraints on one resource take the **maximum, never the sum.** Two people
  expressing the same floor must not double it.
- `unit: "fraction"` applies **per matched instance**, not to a fleet total. `ram:*` at `0.9`
  means nine tenths of each host.
- `against` names a **ceiling on that consumer**, not an exclusive set-aside. `hacking-cap`
  above means *hacking may hold at most nine tenths of each host*; it withholds nothing from
  anyone else, and it never reduces what other candidates may be allocated.
- Reserves with different `against` values are separate quantities and never combine.
- A `fraction` and an `absolute` reserve on one resource are resolved to absolute first, then
  maximised.
- A reserve naming a **grant-form** resource or a glob (`ram:home`, `ram:*`) is subtracted from
  each matched instance in the inventory, before bin-packing. One naming a **request-form**
  resource (`money`, `ram`) is subtracted from the round's available total directly. Both forms
  are permitted; the difference is where they apply.

### 4.1c `disable` is not a process switch

A `disable` constraint acts at allocation and nowhere else. The controller is still launched, still
loops, still heartbeats, still publishes candidates; it observes only that its lease is draining,
and behaves as it would under any other revocation. **Nothing in this system stops a process
because of a constraint.** To stop a process, remove it from the manifest.

### 4.2 Preferences — soft

`/config/preferences.json`, human-writable. Applied **only** to break a tie (§6.5). Never terms
in the score. A preference cannot cause a lower-scoring candidate to win outright.

```jsonc
{ "id": "prefer-sleeve-crime", "kind": "preferProducer",
  "match": { "controller": "sleeves", "producesPath": "player.karma" }, "weight": 0.3 }
```

`match` uses the §4.1a grammar unchanged. `weight` is in `[0, 1]`; a candidate's preference score
is the **sum** of every matching weight, clamped to `[0, 1]`; higher wins; equal totals fall
through to candidate id.

### 4.3 Operator switches — `/config/control.json`

Goals say what should become true and constraints say what may not happen. Neither says **how the
machinery itself should behave right now**, and that is a third category with its own file.

| Switch | Acts at | What happens to held resources |
|---|---|---|
| `disable` *(a constraint, §4.1)* | allocation | returned to the pool; re-enabling re-competes and re-pays `transition` |
| `pause` | execution | **kept.** The controller holds its lease, takes no action, keeps writing state, reports `health: "blocked"` |
| `advisoryMode` | execution | kept. Plan normally, log the intended action list, execute nothing |

`advisoryMode` is global with a per-controller override in either direction, because validating a
new controller means running *it* in advisory while everything else executes.

**`advisoryMode` cannot be a constraint.** If it stopped the *Director* from publishing
directives, the run would show nothing about what it would have decided, which defeats the
purpose. The Director allocates normally and writes its full decision record; the *controllers*
are what stop. That makes it execution-side by construction.

**A pause is the dangerous switch.** A paused controller sits on a grant producing nothing, and
the Director cannot see this: it reads `held`, finds the resource in use, and never reallocates.
A forgotten pause is unbounded invisible waste. Pauses therefore expire by default, and the CLI
must surface every active one.

`control.json` also carries the escalation dials and the answers to escalations (§8).

---

## 5. Resources

| Kind | Semantics | Examples |
|---|---|---|
| `exclusive` | one holder at a time, integral | `player`, `sleeve:3` |
| `consumable` | spent and gone | `money`, `hashes` |
| `capacity` | divisible, held for a duration, returned | `ram:home`, `ram:pserv-0` |
| `regenerating` | consumable with a refill rate | `bladeburner.stamina` |

A resource id is `kind:instance` where instances exist, a bare name where they do not. Which
kind a given resource *is* is declared in the domain manifest (§13.1); nothing infers it.

**Capacity resources are the only revocable kind** (§7.2). Exclusive resources are reassigned
between rounds. Consumables are gone once spent.

### 5.1 Request form and grant form

A `capacity` resource has two forms, and conflating them is the difference between a working
allocator and one whose leases cannot be matched to the candidates that won them.

| | Request form | Grant form |
|---|---|---|
| Written by | the controller, in `requires` | the Director, in a lease row |
| Shape | bare kind — `ram` | placed id — `ram:pserv-0` |

**A candidate asks for an amount and names no host.** The Director bin-packs and issues one or
more lease rows, each naming a host. Allocation rounds are keyed on the **request** form —
there is no round keyed `ram:pserv-0` — and **placement happens after ranking, never during it.**

Every other kind has identical request and grant forms, so the distinction is invisible for them.

### 5.2 Two placement functions, at two levels

| | Director-side | Controller-side |
|---|---|---|
| Question | which hosts satisfy this grant? | where does *this script* go? |
| Unit | a lease, held for minutes to hours | one process, launched now |
| Objective | **fewest hosts** — the smallest single host that fits the *whole* request; only if none fits, the fewest hosts that do | pack efficiently inside what is already held |
| Input | fleet inventory minus grants already issued | this controller's own lease rows and its own usage |
| Never | reads live free RAM | reads live free RAM, or anything outside its lease |

"Best fit" is ambiguous and the wrong reading is the easier one to write. Applied greedily chunk
by chunk it fills the smallest adequate host first and hands back a pile of unusable slivers.
The objective above is applied to the **whole request**.

**A fungible number can be unusable.** 4096 GB spread over eight 512 GB hosts cannot launch one
600 GB batch, so a candidate may state a granularity floor. A requirement the fleet cannot satisfy
must fail loudly at the gate rather than produce a lease that satisfies its number and cannot run.

**The Director's notion of free is bookkeeping, never observation.** Free on a host is inventory
minus the grants the Director itself issued against it. It must not call a game API to check;
doing so re-opens the race the lease model exists to close. `held` is not an input to this — it
plays exactly one role in allocation, bounding re-grants after a revocation (§7.2).

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
  "id": "pserv-upgrade:512-1024",
  "kind": "purchase",
  "cost": { "money": 1.1e8 },
  "produces": { "path": "player.money", "ratePerSec": 90000, "unit": "money" },
  "permanent": false,
  "confidence": "modelled"
}
```

**Three kinds of candidate**, not two. `production` is satisfied by a lease, `purchase` by an
approval, and `assignment` by placing an exclusive resource on an activity. An `assignment`
carries an opaque `activity` string that the Director copies verbatim into `assignments` (§7.4)
and never interprets — the sleeves controller says `crime:homicide`, the Director says nothing.
Without this kind, this document's own leading example (sleeves producing karma) is
inexpressible.

`confidence` is `measured`, `modelled`, or `guessed`. It does not affect the score; it is
recorded for estimator analysis (§11) and so a human can see when the Director is acting on a
guess.

**A candidate id must be stable across ticks** for the same offer. The decision record, the
purchase approval and the acknowledgement all join on it.

`produces.path` **must** match a goal `condition.path` for the candidate to be considered.
This name match is the entire coupling between a goal and the mechanism that satisfies it.

**A rate must be honest.** A candidate advertises the marginal production its resource
actually buys — for a running subsystem, the difference between operating and not operating,
not its gross output. A rate that cannot be derived or measured must not be invented; the
controller advertises fewer tiers instead (§6.7).

**Inelasticity needs no new kind.** A subsystem whose resource requirement is fixed advertises
exactly one tier.

### 6.1a `group` — what stops a ladder being granted twice

A controller advertising `t1` at 512 GB and `t2` at 4096 GB has published two rows of one offer.
Nothing in §6.5's greedy loop knows they are related, so both can clear the gate and both can be
granted: 4608 GB leased to do a 4096 GB job, with `t1`'s production counted twice in the goal's
aggregate `R`.

**Every candidate belongs to a `group`, and at most one candidate per group is granted per
resource per round.** The default depends on kind:

| Kind | `group` defaults to | Why |
|---|---|---|
| `production`, `assignment` | the controller id | a ladder is one offer at several sizes |
| `purchase` | the candidate's own id | one-shot purchases are distinct things, not rungs; a shared group would serialise a controller to one purchase per round |

Set it explicitly when one controller offers two genuinely different strategies for the same
goal, or when several purchases really are rungs of one ladder.

`tier` is **annotation only.** It orders nothing and the allocator does not read it: ranking is
by `score`, exclusion is by `group`. It exists so a human reading a decision record can see
which rung was offered.

### 6.1b `paybackSec` — derived, never authored

The gate of §6.5 step 3 reads `paybackSec`, which is not a field a controller writes:

| Kind | `paybackSec` | Meaning |
|---|---|---|
| `purchase` | `cost[r] / produces.ratePerSec`, where `r` is the cost resource — **only when `produces.unit == r`** | seconds to recoup the spend |
| `production`, `assignment` | `transition.startSec`, default `0` | seconds before the lease produces anything |

These are different quantities under one name, which is why leaving it to intuition produced two
incompatible readings. Both are stated.

**Payback is resource-neutral on purpose.** Writing it as `cost.money / ratePerSec` would name a
game mechanic inside the allocator. The controller declares the denomination of the path it
produces in `produces.unit`; the Director compares two resource ids and learns nothing about
either. A purchase priced in hashes that produces a hashes-denominated path is priced correctly.

**For a `purchase`**, where `produces.unit` is absent, differs from the cost resource, or
`ratePerSec` is zero, `paybackSec` is `Infinity` and the gate rejects the candidate unless
`permanent == true`. That is correct, and it is stated so no implementation arrives there by
division. `production` and `assignment` never reach this case: their payback is a transition
time, defaulting to `0`.

**What this buys:** the gate refuses to start a four-minute prep sixty seconds before an install.
Under a purchases-only gate nothing would stop it and the loss would be silent.

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

`cost` is the amount the candidate requires of **the resource the current round is keyed on**
(§5.1). A candidate contending on two resources is ranked once in each round it appears in.

Two degenerate cases, stated because the wrong guess is silent:

| Case | Rule |
|---|---|
| `cost == 0` | `score = Infinity` |
| ties on `score`, `Infinity` included | broken by §6.5 step 7 and by nothing else |

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

Scoring a candidate once per round does not make the rounds agree with each other: it may win
`ram` and be displaced on `money` in the same pass. `atomic` turns that into all-or-nothing but
does not reconcile the two rankings. See SQ-9.

### 6.5 The gate and the ranking

One round per **request-form** resource (§5.1), greedily:

1. Discard candidates whose `produces.path` matches no enabled, eligible goal.
2. Discard candidates violating any `forbid` constraint, and any whose controller a `disable`
   constraint names.
3. Apply the **horizon gate**: admissible if `paybackSec < horizon(c) || permanent == true`.
4. Discard candidates from controllers reporting `health: "blocked"` or `"error"` (§8.4).
5. Discard candidates whose granularity floor the fleet cannot satisfy (§5.2).
6. Rank the remainder by `score`.
7. Break ties by goal order, then preference weight, then candidate id.
8. Allocate down the list until the resource is exhausted or no admissible candidate remains,
   respecting `reserve` constraints and granting at most one candidate per `group` (§6.1a).
9. Place the winners (§5.2) and issue lease rows.

**The horizon is per candidate, not a global number:**

```
horizon(c) = min(
  installHorizonSec,                      // §2.4b; Infinity if no goal carries the role
  (servingGoal.deadline - now) / 1000,    // if that goal has a deadline
  admit.maxPaybackSec                     // for each matching `admit` constraint
)
```

With no install-horizon goal, no goal deadline and no `admit` match, `horizon(c)` is `Infinity`
and the gate admits every candidate **with a finite `paybackSec`**, plus every `permanent` one.
A candidate whose `paybackSec` is `Infinity` is still rejected, because `Infinity < Infinity` is
false.

**Step 8 and indivisible candidates.** An `atomic` or single-rung candidate that does not fit in
the remaining resource is **reserved toward**, not skipped: the Director records an outstanding
reservation and withholds the accumulating resource from lower-ranked candidates for at most
`reservationTtlSec`. A reservation binds the **group**, not one candidate, so a cheaper rung of
the same ladder cannot slip past it. On expiry the reservation lapses and normal allocation
resumes.

A candidate passed over because an active reservation on **another** group is holding the
resource is **deferred**, not displaced: it lost to an accumulation, not to a better score, and
it will be reconsidered when the reservation fills or lapses. The distinction exists so the
decision record does not report a temporary hold as a ranking loss.

*This is a new mechanism. See SQ-2.*

**Every candidate considered is recorded, whatever became of it** (§10). Seven outcomes are
distinguished — granted, partial, displaced, reserved, deferred, excluded, rejected — and a
rejection records which step rejected it. Reading the ranked list top to bottom must reproduce
the allocation exactly; that property is what makes the record an audit trail rather than a
summary.

### 6.6 Saturation

When a goal's `eta` stops falling as resource is added, further tiers score ≈ 0 and stop
winning. There is no saturation detector and no per-controller threshold.

### 6.7 When to allocate

Event-driven. Re-allocate on:

- a goal becoming satisfied, unsatisfied, eligible, or ineligible
- the goals or constraints file changing
- a controller publishing materially changed candidates — the set of candidate ids changed, or
  any candidate's `requires`, `cost` or `produces.ratePerSec` moved by more than
  `MATERIAL_DELTA` relative
- a capacity resource appearing or disappearing
- an escalation being answered (§8)
- a periodic safety interval, `allocationSafetyIntervalSec`

---

## 7. Directives

`/state/director.json`. The Director is its only writer. Schema in `data-contracts.md` §B.7.

It carries the approvals, the lease rows, the outstanding reservations, the exclusive-resource
assignments, the install horizon, the Director's own escalations, and a list of constraints that
name something which does not exist — a resource no inventory carries, a controller absent from
the manifest, an action or match key no controller declares. **A constraint that merely matches
no candidate is not reported**: a `forbid` whose job is to lie dormant is working correctly, and
flagging it every round is noise.

The Director also publishes its own `tickMs`, `health` and `message` there, like any other
process. It is watched by the watchdog on the same terms as a controller.

### 7.1 Purchases

A purchase directive is an **approval**, not an instruction. The controller executes it inside
its own convergence loop and reports the result.

Controllers **must not** read global money to decide what to spend. They spend against
approvals.

**A purchase is consumed at grant time, not at observation.** The `state` field
(`approved` → `taken` → `expired`) in `director.json` is the authority on what has been funded.
The Director must not re-approve a purchase whose approval is still outstanding, even if the
domain's state file has not yet reflected it. An approval carries an expiry and lapses to
`expired` at the first round after it.

**Acknowledgement.** The controller appends the executed candidate id to an `executed` list in
its own state file; the Director reads that and transcribes `state → "taken"`. Single-writer
ownership holds on both files.

Convergence is the model — a controller stops advertising a candidate it has satisfied — and
`executed` is the interlock against the one tick of lag in which the Director would otherwise
re-approve and double-spend. The model is the story; the list is three lines of defence against
a race that costs real money.

### 7.2 Leases and revocation

| Field | Written by | Meaning |
|---|---|---|
| `granted` | Director | the ceiling the consumer may use |
| `requested` | Director | what the Director wants the consumer to converge to |
| `held` | the consumer | what the consumer is actually using |

A lease is **a set of rows, not one number**: a fungible request of 4096 GB may be answered by
`ram:pserv-0: 2048` and `ram:home: 2048` (§5.1).

To revoke, the Director lowers `requested`. The consumer drains at its own pace and lowers
`held`. The Director may re-grant only what has been released — up to `granted − held`.

**The Director never pre-empts work.** It adjusts a number; the consumer decides how to shrink.
`held > requested` is a normal transient state, not an error.

**`held` bounds re-granting and does nothing else.** It is not an input to placement, to the
Director's free-resource bookkeeping, or to scoring.

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

The string an assignment carries — `crime:homicide`, `faction-work:NiteSec` — comes from the
`activity` field of the winning `assignment` candidate (§6.1) and is copied verbatim. The
Director never parses it.

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

**The dials live in `/config/control.json`** (§4.3), alongside the other operator switches, with
a global default and a per-point override.

### 8.2a Composition with `advisoryMode`

The dial and `advisoryMode` are orthogonal, and this is how they compose:

| | `dial: auto` | `dial: ask` / `block` |
|---|---|---|
| normal | take the default, act | wait for an answer, then act |
| advisory | take the default, **log it, do not act** | wait for an answer, **log it, do not act** |

The dial governs whether a decision is *taken*. `advisoryMode` governs whether the decision is
*executed*. It never suppresses the Director's allocation or its decision record.

### 8.3 Representation — convergent state, not messages

A controller does **not** send a question. It writes into its own state file that it is at a
decision point it will not resolve:

```jsonc
"pending": [
  { "id": "corp:accept-round-2", "options": ["accept", "decline"],
    "default": "accept", "dial": "ask", ... }
]
```

Full shape in `data-contracts.md` §B.6.2.

A point resolved to `auto` publishes no `pending` item at all: the controller takes its default
and logs it. Only `ask` and `block` appear here.

**The answer is also state**, written to `/config/control.json` and read on the next tick. It
cannot live in the controller's own state file, because the human is not that file's writer. A
restarted controller re-derives and republishes the same item, so there are no delivery
guarantees to provide, nothing to dedup, and no lost messages.

An `ask` that reaches its timeout is resolved controller-side: it takes its own default and logs
at `warn`. Nothing writes an answer, because no autonomous process may write that file.

The Director publishes its own escalations in `director.json` under the same shape.

The CLI aggregates `pending` across all of `/state/` (§12).

### 8.4 A blocked controller

A controller waiting on a `block` escalation sets `health: "blocked"` and **continues to
heartbeat**. `data-contracts.md` §B.6 treats `blocked` as not-an-error; the watchdog must not
restart it.

**A blocked controller keeps its lease.** Blocking is not a retraction — a self-retracting
lease would move resource without a Director decision, producing an unlogged reallocation. The
controller is not immune: the Director may still revoke it through §7.2.

**A blocked controller's candidates are discarded** (§6.5 step 4), and its unmet production is
recorded as `blocked`, not as estimator error, in the §11 validation join. The same applies to a
controller reporting `error`: its candidates describe a state it may no longer be in.

---

## 9. State lifecycle

### 9.1 The world view

The Director evaluates conditions against a **world view** assembled from controller state
files, never by calling game APIs.

**Every path has exactly one publisher, and publishing is explicit.** A controller declares its
contribution in a `provides` map on its own state file — a flat map of dotted path to scalar.
The world view is the union of every non-stale `provides` map. A path nobody publishes does not
exist; two publishers of one path is a conflict, resolved to `unknown`, logged, and reported in
the decision record.

Without this rule the layer does not function: `player.money` and `player.karma` have no
producer, no `threshold` condition can be evaluated, and no `eta` can be computed. A small
`stats` controller owns the `player.*` namespace for exactly this reason.

**Two structured inputs are read outside `provides`**, because neither is scalar: the fleet
inventory published by the `infra` controller, and each controller's `held`. Nothing else in a
controller's `detail` is read by the Director.

**Bookkeeping is reconciled by report, never by correction.** The Director's view of what is free
is arithmetic (§5.2), and arithmetic drifts from reality — a script run from the terminal, a
server deleted, a controller killed mid-drain. The `infra` controller periodically compares each
host's observed usage against the sum of `held` against it and logs the difference. It must only
report: a corrector racing the consumers reopens the very race the lease model exists to close.

**Sub-instance state files** — a controller's child processes may publish their own — are read
by their parent only. They contribute nothing to the world view and are invisible to allocation,
which is how a domain running many pipelines still presents the Director with one bidder.

**Staleness.** Every contributing file carries `lastRun` and its own `tickMs`. A file is stale
when `now − lastRun > max(3 × tickMs, 10 s)`, measured against **the source file's** `tickMs`,
never the reader's. A path from a stale file resolves to `unknown` rather than to a stale value.
The floor is not optional: a controller waking on a 200 ms game callback has a `3 × tickMs` well
under a second, which a re-render or an autosave exceeds routinely.

### 9.2 Where things live

> **Observations are never persisted across an augmentation install. Knowledge is.**

```
/config/    declared intent  — goals, constraints, preferences, operator switches
/data/      static tables    — generated once, offline; the fleet never writes them
/state/     observations     — deleted wholesale on install, rebuilt by measurement
/memory/    knowledge        — measured, and expensive to re-measure
/logs/      history          — append-only; nothing reads it to make a decision
```

The test for each, in one line: `/config/` — a human or tool *declared* it. `/data/` — generated
offline. `/state/` — it describes a world that ends at the next install. `/memory/` — it was
*measured*. `/logs/` — it is history.

Only `/state/` is deleted. `/config/` is not observation and must not be swept away with it;
goals with `survivesInstall: true` would otherwise be deleted by the very mechanism that is
supposed to preserve them.

All five survive a BitNode transition — `.txt` and `.json` on `home` persist across
`destroyW0r1dD43m0n` — but `/state/` is nonetheless rebuilt at node entry, because its contents
describe a world that has ended.

**Mechanism.** `installAugmentations` accepts a callback. The callback deletes `/state/` in
full, removes goals with `survivesInstall: false` from `/config/goals.json`, increments `epoch`
in `/memory/run.json`, and touches nothing else.

`/memory/run.json` is the single source of `epoch` and `bitNode`. Two writers, and only two: the
install callback, and the bootstrap script — which also increments `epoch` when it finds a
`bitNode` other than the one recorded. Without that second writer, `/state/` files carried across
a node change would validate against an unchanged epoch, which is precisely the failure the
failsafe exists to catch.

**Failsafe.** Every `/state/` file carries `epoch`, and one whose epoch does not match the
current one is invalid regardless of content. The check applies to `/state/` and nowhere else:
`/config/`, `/data/` and `/memory/` survive by design, and epoch-checking them would invalidate
the goals file every install.

---

## 10. The decision record

`/state/decision.json` holds the latest round; `/logs/decisions.jsonl` the history. Schema in
`data-contracts.md` §B.8.

**One record, several rounds.** Allocation runs once per request-form resource, so the record
carries an array of rounds — each naming its resource, what was available, what was reserved, and
the full ranked list — not a single `resource` field.

**It also carries a per-goal block**: shortfall, the pre-round aggregate rate, and `eta`, for
every enabled goal. That is where the CLI answers "how long until Y?" from (§12), and it has to
be the *pre-round* rate: `gain = eta − S/(R + ΔR)` is meaningless if `R` already includes `ΔR`.

**Rejected candidates are logged, not only chosen ones.** `gate` and `outcome` are closed
vocabularies, not free strings, so that a decision can be read mechanically as well as by eye.

This object is written once and serves three consumers: audit trail, CLI data source (§12),
and analysis input (§11).

---

## 11. Logging

| Stream | Cadence | Contents |
|---|---|---|
| `/logs/decisions.jsonl` | event-driven | §10 records |
| `/logs/actions.<controller>.jsonl` | per action | what executed, cost, result |
| `/logs/observations.jsonl` | fixed wall-clock interval | the world view, RAM in use, goal shortfalls, etas, rates |

The action stream is **one file per writer**, like every other file in the system. A shared
append-only log is multi-writer by construction, and analysis can concatenate.

The observation record carries the world view as a generic `paths` map rather than named `money`
and `rep` fields. A named field would put a game mechanic in the log schema; the map carries them
without this layer learning what they are.

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
| what is paused? | `/config/control.json` — **every active pause, on the default view** (§4.3) |
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

**Required:** a static `/data/domains.json` manifest — data, not logic — carrying four things:

| | |
|---|---|
| `domains[]` | every known controller: how to launch it, its control port, its tick period, and the `actions` and `tagKeys` vocabulary a constraint may name (§4.1a) |
| `system[]` | the Director and the watchdog: launch metadata and ports. They publish no candidates, so they are not domains |
| `resources` | every resource, by bare kind, mapped to its kind in §5. Nothing else declares whether `hashes` is consumable or `bladeburner.stamina` regenerating |
| — | the manifest is also the **name → port table**, which the control channel otherwise lacks |

It lives in `/data/` rather than `/memory/` because `/memory/` is measured knowledge and a
hand-authored manifest is not.

**The watchdog starts every domain the manifest names, unconditionally.** Not gated on a lease,
and not gated on a `disable` constraint. Gating on a lease is circular — a controller must run to
publish candidates, and cannot win a lease without them — and it contradicts §13.2 directly. The
bootstrap script starts `system[]`; the watchdog starts and restarts `domains[]`, and restarts
the Director.

**A lease governs what a running controller may use, never whether it runs.**

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
| **SQ-2** | **Reservation semantics.** §6.5 step 8 is new and untested. Is `reservationTtlSec` the right shape, or should indivisible candidates simply be skipped? | no |
| **SQ-3** | **`eta` for compound goals.** *Narrowed by §2.4a, not closed.* A structural goal's `eta` is now the max over its unsatisfied preconditions — but that is `Infinity` for a goal with no unsatisfied preconditions (`gang.exists` and the like), and for any goal whose path is temporarily unresolvable and therefore structural for that tick. The CLI still cannot answer "how long until X" for those. | no |
| **SQ-4** | **Degrading sticky candidates.** §7.3's anti-thrash makes a large-`transition` controller harder to displace exactly as its output collapses. Real in BN12 at high levels. | no |
| **SQ-5** | **Predicate registry ownership.** §3 permits controllers to register predicates; the loading mechanism and its RAM cost are unspecified, so a `predicate` condition is **not implementable today**. Two designs are live: (a) a **predicate manager** — a service process arbitrating many-writer / many-reader access over ports, first-come-first-served, with a disk copy for safety; (b) **delete the kind** — a controller evaluates its own predicate and publishes the boolean through `provides` (§9.1), which `equals` then tests, using only machinery that already exists. See §15.1. | **yes**, for any goal that needs a predicate |
| **SQ-6** | **Estimator quality.** Should `confidence` discount `score` rather than merely annotate it? Now live: §6.1 permits `modelled` and `measured` rates to compete directly. Answerable from the §11 join. | no |
| **SQ-7** | ~~**Escalation vs. `advisoryMode`.**~~ **Closed** by §8.2a: the dial governs whether a decision is taken, `advisoryMode` whether it is executed. | — |
| **SQ-8** | **Negative revocation.** §8.1 escalates destructive revocations, which handles the case operationally, but the schema still cannot *express* that revocation is negative rather than merely unproductive. Whether it needs to is open. | no |
| **SQ-9** | **Two-way contention.** §6.4 ranks a multi-resource candidate once per round, so it can win `ram` and be displaced on `money` in the same pass. `atomic` makes the grant all-or-nothing but does not make the rankings agree. Unclear whether this occurs in practice. | no |

### 15.1 SQ-5 — the two designs, stated fairly

**(a) A predicate manager.** A service process owns the predicate values. Controllers write and
the Director reads over its port, one request at a time, first-come-first-served; the process
keeps a disk copy for restart safety.

**(b) Delete the kind.** A predicate is a boolean about the world. §9.1 already gives every
controller a way to publish scalars with one publisher per path and no contention, because each
writes only its own file. `{"kind":"predicate","name":"wantedAugsPurchased"}` becomes
`{"kind":"equals","path":"augs.wantedPurchased","value":true}` and the registry disappears.

The argument for (a) is write contention on a shared registry. The argument against is that
`provides` has no shared registry to contend for — the contention is an artefact of assuming one
file, not of the problem. (a) also puts a single process in the critical path of **every**
condition the Director evaluates: if it dies, no goal can be tested, where under (b) a dead
controller merely makes its own paths `unknown` and the rest keep working. It costs a process and
its RAM during the one phase §13.1 constrains to base home RAM. And it carries state over a port,
which §8.3 deliberately rejected — "no delivery guarantees, no dedup, no lost messages" — since
Bitburner ports are lossy queues, not RPC.

The case (b) does not obviously cover is a predicate the **human** wants to define without a
controller to own it. That needs an expression language, and this project has already been bitten
once by an undefined embedded language (`recipe-dsl.md`'s `export.amount`).
