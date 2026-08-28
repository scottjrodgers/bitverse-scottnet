# Spec: Data Contracts

**Status:** normative. Pin this before writing any controller, the Director, or the watchdog.

**Precedence:** `specs/strategy.md` > **this document** > `specs/recipe-dsl.md`.

**Division of authority with `strategy.md`.** Where both documents describe the same field,
`strategy.md` governs its **meaning** and this document governs its **type, permitted values,
required-ness, and default.** A disagreement about meaning is a bug in this document. A field
that appears in `strategy.md` with no entry here is unimplemented.

**Supersedes:** `specs/prior-manager-contract.md` — delete it once this is accepted.

**Reasoning:** `reference/rationale.md`. This document states rules, not arguments.

**§16** records every place this document decided something `strategy.md` had not. All of it was
accepted and folded into `strategy.md` on 2026-08-26; the table is kept as the record of what
changed and why, not as a list of pending work.

---

# Part A — Rules

## A.1 The five invariants

1. **A controller never reads global money or fleet-wide free RAM to decide what to spend or
   run.** It reads its approvals and leases from `/state/director.json` and acts only inside
   them.
2. **Each file has exactly one writer.** Everyone may read anything. No locking is required.
   The two exceptions are named in A.3 and both use compare-and-set.
3. **Every write is a whole document.** No partial updates. No read-modify-write races,
   except the two compare-and-set files named in A.3.
4. **Every action converges toward a target state; none is a discrete imperative.** "Ensure
   warehouse level is 17", not "buy 17 upgrades." Restart safety follows for free.
5. **Files carry state; ports carry only imperatives.** Anything that must survive a restart is
   a file. A controller paused by a file is still paused after it crashes.

## A.2 Directory lifecycle

| Directory | Contents | Written by | Install | BitNode change |
|---|---|---|---|---|
| `/config/` | declared intent | human, CLI, Director, controllers | survives; goals pruned | survives |
| `/data/` | static pre-generated reference tables | offline tooling only | survives | survives |
| `/state/` | observations | Director, controllers, watchdog | **deleted in full** | rebuilt |
| `/memory/` | measured knowledge | controllers, install callback, bootstrap script | survives | survives |
| `/logs/` | append-only history | any writer, own file only | survives | survives |

The test for each, in one line:

| Directory | Test |
|---|---|
| `/config/` | a human or tool *declared* it; deleting it changes what the system is trying to do |
| `/data/` | generated once, offline; the fleet never writes it |
| `/state/` | it describes a world that ends at the next install |
| `/memory/` | it was *measured*, and re-measuring it costs real time |
| `/logs/` | it is history; nothing reads it to make a decision |

`.txt` and `.json` files on `home` survive `destroyW0r1dD43m0n`, so all five survive a BitNode
change. `/state/` is nonetheless rebuilt at node entry.

**Install callback.** Deletes `/state/` in full; removes goals with `survivesInstall: false`
from `/config/goals.json`; increments `epoch` in `/memory/run.json`; touches nothing else.

## A.3 Writers

| Path | Sole writer | Readers |
|---|---|---|
| `/config/goals.json` | **multi-writer, CAS** — human, CLI, Director, controllers | Director, controllers, CLI |
| `/config/constraints.json` | human / CLI | Director, controllers, CLI |
| `/config/preferences.json` | human / CLI | Director, CLI |
| `/config/control.json` | **multi-writer, CAS** — human, CLI | all controllers, Director, watchdog |
| `/data/*.json` | offline tooling | controllers, CLI |
| `/state/director.json` | Director | all controllers, watchdog, CLI |
| `/state/decision.json` | Director | CLI |
| `/state/<controller>.json` | that controller | Director, watchdog, CLI |
| `/state/<controller>.<instance>.json` | that controller's child process | that controller only |
| `/state/watchdog.json` | watchdog | CLI |
| `/memory/run.json` | install callback / bootstrap | everyone |
| `/memory/<controller>.json` | that controller | that controller, CLI |
| `/logs/*` | append-only, one writer per file | offline analysis, CLI |

The **Readers** column is informative, not restrictive: A.1 rule 2 permits anyone to read
anything, and controllers routinely read each other's state files.

**Compare-and-set.** The two multi-writer files carry a monotonically increasing `revision`
(`int`, starts at 1). A writer re-reads, compares `revision`, and retries on mismatch. A
whole-document write to either file without a revision check is non-conforming.

## A.4 Type vocabulary

| Notation | Meaning |
|---|---|
| `int` | integer |
| `num` | finite number, or `Infinity` where explicitly permitted |
| `str` | string |
| `bool` | `true` / `false` |
| `ms` | `int`, wall-clock milliseconds since epoch (`Date.now()`) |
| `sec` | `num`, seconds |
| `id` | `str` matching `^[a-z0-9][a-z0-9:._>-]*$`, max 64 chars. Case-sensitive |
| `resId` | resource id: `str`, `kind:instance` or bare `kind` (§B.5) |
| `path` | dotted world-view path, `str`, e.g. `player.karma` |
| `enum(a,b)` | exactly one of the listed literals |
| `T[]` | array of `T` |
| `{k: T}` | object map, arbitrary keys, values of type `T` |
| `?` suffix | optional; the stated default applies when absent |

A field marked **required** may still carry a `Default`. That default is the value a writer
**must emit** when it has nothing to say — usually `[]` or `{}`. It is not a reader-side fallback;
an absent required field is a malformed file.

**Numbers.** All money, RAM and rate values are plain JS numbers. RAM is in GB. `Infinity` is
permitted only where a table says so, and must be written as the JSON string `"Infinity"` —
JSON has no infinity literal. Readers must accept both `"Infinity"` and a missing field per the
stated default.

## A.5 Schema versioning

`schema` is an `int` on every file. Readers **must** tolerate a lower `schema` by applying
defaults, and **must** refuse a higher one by setting `health: "blocked"` with a message naming
the file and both versions, rather than misinterpreting fields. **Not `error`** — a restart
cannot fix a peer's schema version, and `error` would drive the watchdog into a guaranteed
crash-loop-to-`gaveUp` (D.2) over a condition that needs a human. Bump when a field's meaning changes; adding an optional field does not
require a bump.

## A.6 Epoch and staleness

| Rule | Definition |
|---|---|
| Source of truth | `/memory/run.json` → `epoch` |
| Validated against | `/state/*` **only** |
| Not validated | `/config/*`, `/data/*`, `/memory/*`, `/logs/*` — they survive by design |
| Failure | a `/state/` file whose `epoch` ≠ current is **invalid regardless of content** |
| Staleness | a file is stale when `now - lastRun > max(3 × file.tickMs, 10000)` |
| Whose `tickMs` | **the source file's own declared `tickMs`**, never the reader's |
| Effect | a world-view `path` sourced from a stale file resolves to `unknown` |

`epoch` on `/config/goals.json` is informational — the last epoch in which the file was touched.
It is never used to invalidate the file.

---

# Part B — Files

## B.1 `/config/goals.json`

Ordered goal list. **Array order is priority; there is no priority field.**

```jsonc
{
  "schema": 2,
  "revision": 41,
  "epoch": 7,
  "goals": [
    { "id": "gang-karma", "source": "user", "enabled": true, "survivesInstall": true,
      "condition": { "kind": "threshold", "path": "player.karma", "op": "<=", "value": -54000 },
      "deadline": null, "preconditions": [] }
  ]
}
```

| Field | Type | Values | Req | Meaning |
|---|---|---|---|---|
| `schema` | `int` | `2` | yes | A.5 |
| `revision` | `int` | ≥ 1, monotonic | yes | CAS token (A.3) |
| `epoch` | `int` | ≥ 0 | yes | informational only (A.6) |
| `goals` | `Goal[]` | may be empty | yes | ordered, first is highest priority |

### Goal

| Field | Type | Values | Req | Default | Meaning |
|---|---|---|---|---|---|
| `id` | `id` | unique within file | yes | — | referenced by `preconditions` |
| `source` | `str` | `user`, `system`, or a controller id | yes | — | who authored it |
| `enabled` | `bool` | | yes | — | `false` ⇒ ignored entirely |
| `survivesInstall` | `bool` | | yes | — | `false` ⇒ removed by the install callback |
| `role` | `enum(installHorizon)` | | no | absent | §B.1.1. At most one goal per role |
| `condition` | `Condition` | §B.1.2 | yes | — | what must become true |
| `deadline` | `ms` \| `null` | | yes | — | `null` ⇒ no deadline |
| `preconditions` | `id[]` | goal ids in this file | yes | `[]` | must be **satisfied** before eligible |

A goal is **allocatable** iff its `condition` is a `threshold` on a numeric `path`, that path
resolves, and at least one candidate advertises `produces.path` equal to it. Otherwise it is
**structural**.

### B.1.1 `role` and the install horizon

The `installHorizon` role names the goal whose completion bounds the current cycle.

```
installHorizonSec = min(
  (roleGoal.deadline - now) / 1000   if roleGoal.deadline != null,
  eta(roleGoal)
)
```

`installHorizonSec` is one term, not the whole gate. **The gate's horizon is per candidate**, per
`strategy.md` §6.5 step 3:

```
horizon(c) = min(
  installHorizonSec,
  (servingGoal.deadline - now) / 1000   if servingGoal.deadline != null,
  admit.maxPaybackSec                   for each matching `admit` constraint
)
```

No goal carries the role ⇒ `installHorizonSec = Infinity`. With no goal deadline and no `admit`
match, `horizon(c) = Infinity`, and the gate then admits every candidate **with a finite
`paybackSec`**, plus every candidate with `permanent == true`. A `purchase` whose `paybackSec` is
`Infinity` (§B.6.1) is still rejected, because `Infinity < Infinity` is false.

`director.json.horizonSec` and `decision.json.horizonSec` record `installHorizonSec`; the
per-candidate horizon is recoverable from the record's `goal` and the constraints file.

**`eta` of a structural goal** — required for the above, and a partial answer to SQ-3:

```
eta(g) = 0                                        if g is satisfied
       = S / R                                    if g is allocatable
       = max( eta(p) for p in g.preconditions
              where p is not satisfied )          if g is structural
       = Infinity                                 if that set is empty and g is unsatisfied,
                                                  or any term is Infinity or unknown
```

The recursion terminates because `preconditions` is a DAG. **A cycle is a malformed goals file.**
The Director sets its own `health: "blocked"` with a `message` naming the cycle (§B.7), treats
every goal in the cycle as `eta = Infinity`, and continues allocating the rest. It does not stop,
and it does not silently break the cycle at an arbitrary edge.

The Director derives the number. It never decides *whether* to install; that is §B.6.2's
escalation.

### B.1.2 Condition

| `kind` | Fields | Types |
|---|---|---|
| `threshold` | `path`, `op`, `value` | `path`, `enum(<=,>=,<,>)`, `num` |
| `equals` | `path`, `value` | `path`, `str`\|`num`\|`bool` |
| `predicate` | `name` | `id` — resolved from the controller-populated registry |
| `and` | `children` | `Condition[]`, ≥ 1 |
| `or` | `children` | `Condition[]`, ≥ 1 |
| `not` | `child` | `Condition` |

Six kinds; no others without a schema bump. An unresolvable `path` yields `unknown` — neither
true nor false — and the goal is treated as structural for that tick. `unknown` propagates:
`and` with an `unknown` child is `unknown` unless another child is `false`; `or` with an
`unknown` child is `unknown` unless another child is `true`.

## B.2 `/config/constraints.json`

Hard boundaries. A directive set violating any constraint is invalid and must not be published.

```jsonc
{
  "schema": 2, "revision": 12,
  "constraints": [
    { "id": "money-floor", "kind": "reserve", "resource": "money", "value": 5e6 },
    { "id": "home-ram",    "kind": "reserve", "resource": "ram:home", "value": 32 },
    { "id": "hacking-cap", "kind": "reserve", "resource": "ram:*", "value": 0.9,
      "unit": "fraction", "against": "hacking" },
    { "id": "no-install",  "kind": "forbid",  "action": "installAugmentations" },
    { "id": "no-city-join","kind": "forbid",  "action": "joinFaction",
      "match": { "factionType": "city" } },
    { "id": "hacknet-roi", "kind": "admit",   "match": { "controller": "hacknet" },
      "maxPaybackSec": 3600 },
    { "id": "no-bladeburner", "kind": "disable", "controller": "bladeburner" }
  ]
}
```

| Field | Type | Req | Meaning |
|---|---|---|---|
| `schema` | `int` = `2` | yes | |
| `revision` | `int` | yes | |
| `constraints` | `Constraint[]` | yes | unordered; all apply simultaneously |

### Constraint kinds

| `kind` | Field | Type | Req | Default | Meaning |
|---|---|---|---|---|---|
| all | `id` | `id` | yes | — | unique within file |
| all | `kind` | `enum(reserve,forbid,admit,disable)` | yes | — | |
| `reserve` | `resource` | `resId` or glob | yes | — | glob: `*` may replace the instance, e.g. `ram:*` |
| | `value` | `num` ≥ 0 | yes | — | |
| | `unit` | `enum(absolute,fraction)` | no | `absolute` | `fraction` applies **per matched instance**, not to the fleet total |
| | `against` | `id` \| `null` | no | `null` | `null` ⇒ withheld from **everyone**; a controller id ⇒ a **ceiling on that consumer alone**, the rest of the resource stays allocatable |
| `forbid` | `action` | `str` | yes | — | matched against the candidate's `action` |
| | `match` | `Match` | no | `{}` | additional conjunctive constraints |
| `admit` | `match` | `Match` | yes | — | selects the candidate class |
| | `maxPaybackSec` | `sec` | yes | — | tightens the horizon gate for that class |
| `disable` | `controller` | `id` | yes | — | its candidates are never ranked; its leases drain via `requested → 0` |

`reserve.resource` accepts either the request form or the grant form, and globs
(`money`, `ram`, `ram:home`, `ram:*`). **The arithmetic — max-not-sum, per-instance fractions,
where each form applies, and `against` as a per-consumer ceiling — is `strategy.md` §4.1b.**
Only the field types are settled here.

**`against` reads as a ceiling, not an exclusive grant.** `hacking-cap` above means *hacking may
hold at most nine tenths of each host*, not *nine tenths of each host is set aside for hacking*.
The opposite reading is equally natural in English and inverts the example, so it is stated here
rather than left to intuition. The example is `0.9` and not `0.5` because at `0.5` the ceiling
and set-aside readings coincide numerically and the ambiguity is invisible.

**`disable` vs. `pause` vs. `advisoryMode`** — three switches at three pipeline positions:

| Switch | Acts at | Resources | Home |
|---|---|---|---|
| `disable` | allocation | returned to the pool | `constraints.json` |
| `pause` | execution | **held** | `control.json` |
| `advisoryMode` | execution | held; Director allocates and logs normally | `control.json` |

### B.2.1 `Match` — the join key

`Match` is a **flat object of `str` keys to `str` \| `num` \| `bool`**, compared by **exact
equality**, conjunctively, against the candidate's **match surface**:

```
matchSurface(c) = { controller, id, kind, group, action, producesPath, ...c.tags }
```

Two members are injected by the Director rather than authored on the candidate: `controller` is
the `controller` field of the state file the candidate was read from, and `producesPath` is
`c.produces.path`. Everything else is authored by the controller.

A key absent from the match surface **does not match**. No globs, no regex, no nesting, no
inference from `kind`.

This does not violate `strategy.md` §0: the controller names the action and the tags; the
Director only compares strings.

**A controller declares its `tagKeys` and its `actions` in `/data/domains.json`** (§B.11). A
constraint naming a match key or an action that no domain declares is a **typo, not a
non-match**, and is reported in `unresolvedConstraints` (§B.7, §B.8).

**A `forbid` that matches nothing is not an error.** A constraint whose whole job is to lie
dormant — `no-install` — matches nothing on almost every round, so "matched no candidate" is
noise rather than signal. What is worth reporting is a constraint that refers to something that
*does not exist*, and that is what `unresolvedConstraints` carries.

## B.3 `/config/preferences.json`

Soft. Applied **only** to break a tie. Never a term in the score.

```jsonc
{ "schema": 1, "revision": 3,
  "preferences": [
    { "id": "prefer-sleeve-crime", "kind": "preferProducer",
      "match": { "controller": "sleeves", "producesPath": "player.karma" }, "weight": 0.3 }
  ] }
```

| Field | Type | Values | Req | Default |
|---|---|---|---|---|
| `id` | `id` | unique | yes | — |
| `kind` | `enum(preferProducer)` | | yes | — |
| `match` | `Match` | §B.2.1, unchanged | yes | — |
| `weight` | `num` | `0.0 … 1.0` inclusive | yes | — |

**Combination:** a candidate's preference score is the **sum** of the weights of all matching
preferences, clamped to `[0, 1]`. Higher wins. Equal totals fall through to candidate `id`
ascending.

## B.4 `/config/control.json`

Operator switches and escalation answers. The only file whose purpose is *how the machinery
should behave right now* rather than what it should achieve.

```jsonc
{
  "schema": 1,
  "revision": 8,
  "advisoryMode": false,
  "controllers": {
    "corp":    { "advisoryMode": true },
    "hacknet": { "paused": true, "pausedAt": 1755561783000, "pauseExpiresAt": 1755563583000 }
  },
  "escalations": {
    "defaultDial": "ask",
    "defaultTimeoutSec": 900,
    "points": { "corp:accept-round-2": { "dial": "block" } }
  },
  "answers": {
    "corp:accept-round-2": { "choice": "accept", "at": 1755561900000, "by": "user" }
  }
}
```

| Field | Type | Req | Default | Meaning |
|---|---|---|---|---|
| `schema` | `int` = `1` | yes | — | |
| `revision` | `int` | yes | — | CAS token |
| `advisoryMode` | `bool` | no | `false` | global: every controller plans and logs, executes nothing |
| `controllers` | `{id: ControllerSwitch}` | no | `{}` | per-controller overrides |
| `escalations.defaultDial` | `enum(auto,ask,block)` | no | `ask` | applies to any point not listed |
| `escalations.defaultTimeoutSec` | `sec` | no | `900` | applies to `ask` |
| `escalations.points` | `{id: {dial, timeoutSec?}}` | no | `{}` | per-point override |
| `answers` | `{id: Answer}` | no | `{}` | §B.4.1 |

### ControllerSwitch

| Field | Type | Req | Default | Meaning |
|---|---|---|---|---|
| `advisoryMode` | `bool` | no | inherits global | per-controller override, **either direction** |
| `paused` | `bool` | no | `false` | keeps lease, takes no action, keeps heartbeating, reports `health: "blocked"` |
| `pausedAt` | `ms` | when `paused` | — | |
| `pauseExpiresAt` | `ms` \| `null` | no | `pausedAt + 1800000` | `null` ⇒ never expires |

**Expiry is read-side.** A controller observing `pauseExpiresAt !== null && now > pauseExpiresAt`
resumes; a `null` expiry never does; it does not write
`control.json`, which only a human or the CLI may write. The stale flag stays in the file until a human clears
it, so the CLI reports an expired pause as *expired*, not as active.

**A pause is loud and expires by default.** A paused controller sits on a grant producing
nothing, and the Director cannot see this — it reads `held`, finds the resource in use, and
never reallocates. A forgotten pause is unbounded invisible waste. The CLI **must** display
every active pause on its default view. `null` expiry is permitted and is the dangerous case.

**Composition with `advisoryMode`** — the two are orthogonal and compose as follows:

| | `dial: auto` | `dial: ask` / `block` |
|---|---|---|
| normal | take default, act | wait for `answers`, then act |
| advisory | take default, **log it, do not act** | wait for `answers`, **log it, do not act** |

`advisoryMode` suppresses *execution* only. It never suppresses the Director's allocation or its
decision record — a run that showed nothing about what it would have decided would defeat the
purpose. `strategy.md` §8.2a states the full composition; this is its execution half.

### B.4.1 Answer

Escalation answers live here, not in the controller's own file, because the human is not that
file's writer.

| Field | Type | Req | Meaning |
|---|---|---|---|
| `choice` | `str` | yes | must be one of the `pending` item's `options` |
| `at` | `ms` | yes | |
| `by` | `enum(user,cli)` | yes | who answered. There is no `timeout` value — a lapsed `ask` is handled controller-side (§B.6.2) and writes nothing here, because no process may write this file |

A controller clears its `pending` entry once it observes a matching answer. Stale answers whose
`pending` item no longer exists are ignored and may be garbage-collected by the CLI.

## B.5 Resource identity

| Form | When | Examples |
|---|---|---|
| `kind:instance` | instances exist | `ram:home`, `ram:pserv-0`, `sleeve:3` |
| `kind` | they do not | `money`, `hashes`, `player` |
| `kind:*` | constraint globs only | `ram:*` |

| Kind | Semantics | Revocable |
|---|---|---|
| `exclusive` | one holder, integral | reassigned between rounds |
| `consumable` | spent and gone | no |
| `capacity` | divisible, held, returned | **yes** — the only revocable kind |
| `regenerating` | consumable with a refill rate | no |

**Capacity resources are requested fungibly and granted placed.** A candidate asks for
`requires: { "ram": 4096 }` and names no host. The Director bin-packs and issues **one or more
lease rows**, each naming a host. Two placement functions, at two levels:

| | Director-side | Controller-side |
|---|---|---|
| Question | which hosts satisfy this grant? | where does *this script* go? |
| Objective | **fewest hosts**: smallest single host that fits the *whole* request; only if none fits, the fewest hosts that do | pack efficiently inside what is already held |
| Input | fleet inventory minus grants already issued | this controller's own lease rows and its own usage |
| Never | reads live free RAM | reads live free RAM, or anything outside its lease |

"Best fit" is ambiguous and the wrong reading is the easier one to write: applied greedily chunk
by chunk it fills the smallest adequate host first and returns a pile of unusable slivers. The
objective above is applied to the **whole request**.

**The Director's notion of free RAM is bookkeeping, never observation.** Free on a host is
inventory minus the grants the Director has itself issued against it. It must not call
`getServerUsedRam`.

`held` plays exactly one role in allocation and no other: **it bounds re-granting.** After
lowering `requested`, the Director may re-grant only `granted − held` — what the consumer has
actually released. It is never an input to placement, to free-RAM bookkeeping, or to scoring.

**The Director has exactly two *world-view* inputs it does not get from `provides`** (§B.6.0): this fleet
inventory, read from `/state/infra.json` → `detail.inventory` (§B.9), and `held` from each
controller's envelope. Both are structured rather than scalar, which is why they are named
exceptions rather than world-view paths.

### B.5.1 Request form vs. grant form — normative

Two forms of the same resource, and the distinction decides what an allocation round is keyed on.

| | Request form | Grant form |
|---|---|---|
| Appears in | candidate `requires` / `cost`; decision-record `rounds[].resource`; reservations | `director.json` lease rows; `held`; `assignments` |
| `reserve.resource` | permitted | permitted (and globs) — see §B.2 |
| `capacity` | bare kind — `ram` | placed id — `ram:pserv-0` |
| `consumable` | bare kind — `money`, `hashes` | identical — `money` |
| `regenerating` | bare kind — `bladeburner.stamina` | identical |
| `exclusive` | full id — `sleeve:3` | identical |

**Allocation proceeds one round per request-form resource**, and **placement happens after
ranking, not during it.** A round over `ram` ranks every candidate that asked for `ram` against
the fleet's total allocatable RAM; the winners are then bin-packed into lease rows per §B.5.
There is no round keyed `ram:pserv-0`, and a candidate never names a host.

Only `capacity` has two distinct forms, so the distinction is invisible everywhere else.

## B.6 `/state/<controller>.json`

The envelope every controller publishes. Domain-specific data goes in `detail`, whose schema is
owned by that domain's document.

```jsonc
{
  "schema": 2, "epoch": 7, "controller": "corp",
  "pid": 1234, "startedAt": 1755561600000, "lastRun": 1755561783000, "tickMs": 1000,
  "health": "ok", "message": null,
  "held": { },
  "provides": { "corp.funds": 4.1e9, "corp.exists": true },
  "executed": ["pserv-upgrade:512-1024"],
  "candidates": [],
  "pending": [],
  "spentThisRun": 0,
  "detail": { }
}
```

| Field | Type | Values | Req | Default | Meaning |
|---|---|---|---|---|---|
| `schema` | `int` | `2` | yes | — | |
| `epoch` | `int` | | yes | — | must equal `run.json.epoch` or the file is invalid |
| `controller` | `id` | matches the filename stem | yes | — | |
| `pid` | `int` | | yes | — | for the watchdog's `ns.kill` |
| `startedAt` | `ms` | | yes | — | launch grace is measured from this |
| `lastRun` | `ms` | | yes | — | heartbeat; staleness per A.6 |
| `tickMs` | `int` | > 0 | yes | — | expected loop period; the staleness denominator |
| `health` | `enum(ok,degraded,blocked,error)` | | yes | — | table below |
| `message` | `str` \| `null` | | yes | — | required non-null when `health != "ok"` |
| `held` | `{resId: num}` | | yes | `{}` | what it is **actually** using now |
| `executed` | `id[]` | candidate ids | yes | `[]` | §B.7 purchase acknowledgement |
| `candidates` | `Candidate[]` | | yes | `[]` | §B.6.1 |
| `pending` | `Pending[]` | | yes | `[]` | §B.6.2 |
| `provides` | `{path: num\|str\|bool}` | | yes | `{}` | this controller's contribution to the world view; §B.6.0 |
| `spentThisRun` | `num` | | no | `0` | cash spent since `startedAt`, observability only |
| `detail` | `{}` | | yes | `{}` | domain-owned |

There is **no `launch` block.** Launch metadata lives in `/data/domains.json` (§B.11), because
`/state/` is empty at node entry and nothing could be started from it.

| `health` | Meaning | Watchdog | Allocator |
|---|---|---|---|
| `ok` | normal | none | candidates ranked |
| `degraded` | working sub-optimally | none | candidates ranked |
| `blocked` | cannot progress without something external — funds, an unlock, an answer, a pause | **none — log it** | **candidates discarded; leases kept** |
| `error` | unexpected exception; state may be inconsistent | restart | candidates discarded |

`blocked` is **not** an error. A controller waiting for funds is behaving correctly. A blocked
controller **keeps its lease** — a self-retracting lease would move resource without a Director
decision, producing an unlogged reallocation. The Director may still revoke it via §B.7.

**Sub-instance files.** A controller running child processes may publish
`/state/<controller>.<instance>.json` with this same envelope. **The Director does not read
them** and they contribute nothing to the world view; the parent controller aggregates. This is
how per-target HWGW schedulers stay invisible to allocation: the Director sees one `hacking`
bidder, and prioritisation among pipelines is that controller's own business.

### B.6.0 `provides` — who publishes the world view

Every `path` used by a goal `condition`, a candidate's `produces.path`, a predicate, or an
observation record must be **published by exactly one controller**, in that controller's
`provides` map. The Director's world view is the union of every non-stale `provides` map. It
calls no game API; a path nobody publishes does not exist.

| Rule | |
|---|---|
| Ownership | **exactly one** controller per path. Two publishers of one path is a conflict |
| Conflict | the Director resolves to `unknown`, logs at `warn`, and lists the path in `decision.json.pathConflicts` |
| Staleness | a path from a stale file (A.6) resolves to `unknown`, never to its last value |
| Namespacing | a controller should publish under a prefix it owns; the prefix is a convention, not a rule, and does not resolve a conflict |
| Sub-instances | `provides` on a `<controller>.<instance>.json` file is ignored — the parent aggregates |
| Type | flat map, dotted keys, scalar values only. No nesting; `player.money`, not `player: {money}` |

**The `player.*` namespace belongs to a `stats` controller.** It publishes money, karma, skills
and reputation, publishes no candidates, and consumes no resources — a manifest domain with no
allocator role. Without it no `threshold` condition on the player can be evaluated, which is why
it exists before any domain that might want one.

`threshold` conditions require a `num`; `equals` accepts any of the three types.

**This is the same gap that `/state/infra.json` fills for the fleet inventory, generalised.**
Without it, `player.money` and `player.karma` have no producer, no goal condition can be
evaluated, and nothing in the allocator can be computed. The two structured exceptions are named
in §B.5. (Candidates, `pending` and `executed` are read from controller envelopes too, but they
are the allocation protocol, not the world view.)

### B.6.1 Candidate

Three kinds. Common fields first.

| Field | Type | Values | Req | Default | Meaning |
|---|---|---|---|---|---|
| `id` | `id` | unique per controller, **stable across ticks** | yes | — | |
| `kind` | `enum(production,purchase,assignment)` | | yes | — | |
| `group` | `id` | | no | **kind-dependent — see below** | **at most one candidate per group is granted per resource per round** |
| `produces` | `{path, ratePerSec, unit?}` | `path`, `num` ≥ 0, `resId` | yes | — | `path` must equal a goal's `condition.path`. `unit` names the resource the path is **denominated in**, when it is one |
| `confidence` | `enum(measured,modelled,guessed)` | | yes | — | annotation only; never affects score |
| `action` | `str` | | no | absent | the join key for `forbid` (§B.2.1) |
| `tags` | `{str: str\|num\|bool}` | flat | no | `{}` | additional `Match` surface |
| `atomic` | `bool` | | no | `false` | `true` ⇒ all required resources or none |

| `kind` | Field | Type | Req | Default | Meaning |
|---|---|---|---|---|---|
| `production` | `tier` | `int` ≥ 0 | no | `0` | rung on this group's ladder. **Annotation only** — it orders nothing and is not read by the allocator; ranking is by `score`, exclusion by `group` |
| | `requires` | `{resId: num}` | yes | — | capacity fungible: `{"ram": 4096}` |
| | `minPerHost` | `num` | no | `0` | smallest usable contiguous chunk on one host |
| | `transition` | `{startSec, stopSec}` | no | `{0, 0}` | reallocation cost |
| `purchase` | `cost` | `{resId: num}` | yes | — | consumable, e.g. `{"money": 1.1e8}` |
| | `permanent` | `bool` | yes | — | survives an augmentation install? |
| `assignment` | `requires` | `{resId: 1}` | yes | — | exactly one exclusive resource, value `1` |
| | `activity` | `str` | yes | — | opaque; copied verbatim into `assignments` |
| | `transition` | `{startSec, stopSec}` | no | `{0, 0}` | |

**`group` is the tier-exclusion mechanism**, and its default depends on `kind`:

| `kind` | `group` default | Why |
|---|---|---|
| `production`, `assignment` | **the controller id** | a controller's ladder is one offer at several sizes; granting two rungs over-leases it and double-counts its production |
| `purchase` | **the candidate's own `id`** | one-shot purchases are distinct things, not rungs. A shared group would silently serialise a controller to one purchase per round — at the 60 s safety cadence, four server upgrades would take four minutes |

Set `group` explicitly when one controller offers two genuinely different strategies for the same
goal, or when several purchases genuinely are rungs of one ladder (`pserv 512→1024` and
`1024→2048`) and only one should be approved per round.

**`minPerHost` exists because a fungible number can be unusable.** 4096 GB spread over eight
512 GB hosts cannot launch one 600 GB batch. A granularity requirement the fleet cannot satisfy
fails loudly through a named channel: the candidate's `gate` is `fail:granularityUnsatisfiable`,
its `outcome` is `rejected`, and the Director logs at `warn`. It is never silently downgraded to
a lease that satisfies the number and cannot run a batch.

**Feasibility is checked at gate time against the inventory, not against a placement.** Placement
happens after ranking (§B.5.1), so the gate test is the cheap one: does the fleet contain enough
hosts with at least `minPerHost` free, unreserved, to cover `requires`? A candidate that passes
this and still cannot be placed is a bin-packer bug, logged at `error`.

**`paybackSec` is derived, never authored:**

| `kind` | `paybackSec` | Meaning |
|---|---|---|
| `purchase` | `cost[r] / produces.ratePerSec`, where `r` is the cost resource — **only when `produces.unit == r`** | seconds to recoup the spend |
| `production` | `transition.startSec` | seconds before the lease produces anything |
| `assignment` | `transition.startSec` | as above |

`paybackSec = Infinity` for a `purchase` when `produces.ratePerSec == 0`, when `produces.unit`
is absent, or when `produces.unit` differs from the cost resource. The gate then rejects it
unless `permanent == true`. That is correct behaviour and is stated here so no implementation
reaches it by division.

**Payback is stated resource-neutrally on purpose.** Writing it as `cost.money` would name a game
mechanic inside the allocator. The controller declares the denomination in `produces.unit`; the
Director only compares two resource ids — the same trick that makes `produces.path` work. A
purchase priced in `hashes` that produces a `hashes`-denominated path is priced correctly and the
Director learns nothing about hashes.

**A rate must be honest.** A candidate advertises **marginal** production — the difference
between operating and not operating — not gross output. A rate that cannot be derived or
measured must not be invented; advertise fewer tiers instead.

**Scoring inputs, for completeness** (`strategy.md` §6.3 owns the semantics):

| Term | Definition |
|---|---|
| `cost` | the amount the candidate requires of **the resource this round is keyed on** (§B.5.1) |
| scoring across rounds | a multi-resource candidate is ranked separately in each round it appears in; `atomic: true` means it must win all of them or none |
| `cost == 0` | `score = Infinity`. Ties among equal scores — `Infinity` included — break by `strategy.md` §6.5 step 7 (goal order, then preference weight, then candidate id) and by nothing else |
| `R == 0, ΔR > 0` | `gain = Infinity` (zero-rate rule); ranks above every finite improvement |

**"Materially changed"** — the §6.7 reallocation trigger, so it must be a number: the set of
candidate ids changed, **or** any candidate's `requires`, `cost`, or `produces.ratePerSec` moved
by more than `MATERIAL_DELTA = 0.10` relative.

### B.6.2 Pending — an escalation

A controller does not send a question; it publishes that it is at a decision it will not resolve.
A restarted controller re-derives and republishes the same item. No delivery guarantees, no
dedup, no lost messages.

| Field | Type | Req | Default | Meaning |
|---|---|---|---|---|
| `id` | `id` | yes | — | stable across restarts; the key into `control.json.answers` |
| `kind` | `str` | yes | — | free, e.g. `irreversible`, `destructiveRevocation` |
| `options` | `str[]` | yes | — | ≥ 2, distinct |
| `recommend` | `str` | no | absent | one of `options` |
| `default` | `str` | no | absent | one of `options`. **Absent ⇒ the point may only be dialled `block`** — `auto` and `ask` both require a default |
| `dial` | `enum(ask,block)` | yes | — | resolved from `control.json`, copied here for the CLI. `auto` cannot appear: such a point publishes nothing |
| `since` | `ms` | yes | — | |
| `expiresAt` | `ms` \| `null` | yes | — | when `ask` will take the default; `null` for `block` |

A point resolved to `dial: "auto"` publishes **no** `pending` item: the controller takes its
default and logs at `info`. Only `ask` and `block` appear here.

When an `ask` item reaches `expiresAt` the controller takes its own `default`, logs at `warn`,
and clears the item. **No answer is written** — `control.json` has no autonomous writer — only a human, or the CLI acting for one.

The Director publishes its own escalations in `director.json` under the identical shape.

**A decision is escalatable if and only if a wrong answer would not be corrected automatically
within a few allocation rounds.** Everything else in this system is convergent. Each escalation
point is declared, named, and few; a domain needing more than a handful indicates the mechanism
is wrong for it.

The install is one: it is irreversible and does not self-correct. It is expressed as an
`installAugmentations` **candidate from the augs controller**, eligible only once the
`installHorizon` goal's preconditions are satisfied, with a `pending` escalation gating
execution. The Director never triggers an install directly — that would put a named game action
in the strategy layer.

## B.7 `/state/director.json`

The Director is its only writer.

> **One scenario runs through §B.7, §B.8 and §B.9.** Fleet: `home` 512 GB, `pserv-0` 4096 GB —
> 4608 total. The `home-ram` reserve (§B.2) withholds 32, leaving 4576 allocatable. `hacking`
> wins 2304 and is placed whole on `pserv-0`; `factions` wins 2048, which fits on no single host
> and is split 1792 + 256; 224 GB remains on `home`, so `corp`'s atomic 256 GB candidate does not
> fit and a reservation is opened toward it. A lowered `requested` on one `factions` row shows a
> revocation in progress.

```jsonc
{
  "schema": 2, "epoch": 7, "lastRun": 1755561783000, "tickMs": 5000,
  "health": "ok", "message": null, "horizonSec": 3600,
  "purchases": [
    { "candidateId": "pserv-upgrade:512-1024", "controller": "infra",
      "approvedAt": 1755561783000, "expiresAt": 1755561843000,
      "cost": { "money": 1.1e8 }, "state": "approved" }
  ],
  "leases": [
    { "consumer": "hacking",  "resource": "ram:pserv-0", "granted": 2304, "requested": 2304 },
    { "consumer": "factions", "resource": "ram:pserv-0", "granted": 1792, "requested": 1792 },
    { "consumer": "factions", "resource": "ram:home",    "granted": 256,  "requested": 128 }
  ],
  "reservations": [
    { "group": "corp", "consumer": "corp", "resource": "ram",
      "toward": 256, "expiresAt": 1755562083000 }
  ],
  "assignments": { "player": "faction-work:NiteSec", "sleeve:0": "crime:homicide" },
  "pending": [],
  "unresolvedConstraints": []
}
```

| Field | Type | Req | Default | Meaning |
|---|---|---|---|---|
| `schema` | `int` = `2` | yes | — | |
| `epoch` | `int` | yes | — | |
| `lastRun` | `ms` | yes | — | |
| `horizonSec` | `sec` \| `"Infinity"` | yes | — | §B.1.1 |
| `purchases` | `Purchase[]` | yes | `[]` | approvals, not instructions |
| `leases` | `Lease[]` | yes | `[]` | **one row per (consumer, host)** |
| `reservations` | `Reservation[]` | yes | `[]` | |
| `assignments` | `{resId: str}` | yes | `{}` | exclusive resource → `activity` string |
| `pending` | `Pending[]` | yes | `[]` | §B.6.2 |
| `tickMs` | `int` | yes | — | the Director's own loop period; the staleness denominator for readers of this file |
| `health` | `enum(ok,degraded,blocked,error)` | yes | — | the watchdog monitors `director` like any domain (§B.11), so `error` is meaningful. A malformed config file is `blocked`, not `error` (A.5, X27) |
| `message` | `str` \| `null` | yes | — | non-null when `health != "ok"`, e.g. a cycle in `goals.json` preconditions |
| `unresolvedConstraints` | `id[]` | yes | `[]` | constraints naming something that does not exist: a `reserve.resource` no inventory carries, a `disable.controller` absent from the manifest, a `forbid.action` no domain declares, a `match` key that is neither a match-surface member nor any domain's declared `tagKey` |

### Purchase

| Field | Type | Req | Meaning |
|---|---|---|---|
| `candidateId` | `id` | yes | |
| `controller` | `id` | yes | who may execute it |
| `approvedAt` | `ms` | yes | |
| `expiresAt` | `ms` | yes | `approvedAt + allocationSafetyIntervalSec × 1000`; the approval lapses at the first round after this and `state → "expired"` |
| `cost` | `{resId: num}` | yes | copied from the candidate at approval time |
| `state` | `enum(approved,taken,expired)` | yes | |

**A purchase is consumed at grant time, not at observation.** `state` is the authority on what
has been funded; the Director must not re-approve a candidate whose approval is still
`approved`, even if the controller's state file has not yet reflected it.

**Acknowledgement.** The controller appends the executed `candidateId` to its own `executed`
array; the Director reads that and transcribes `state → "taken"`. Single-writer holds on both
files. Convergence is the model — the controller stops advertising a candidate it has satisfied
— and `executed` is the interlock against the one-tick race that would otherwise double-spend.
The controller may prune an `executed` entry once it observes `state == "taken"`.

### Lease

| Field | Type | Req | Written by | Meaning |
|---|---|---|---|---|
| `consumer` | `id` | yes | Director | controller id |
| `resource` | `resId` | yes | Director | **grant form** — a placed resource, e.g. `ram:pserv-0` (§B.5.1) |
| `granted` | `num` | yes | Director | the ceiling the consumer may use |
| `requested` | `num` | yes | Director | what the Director wants it to converge to |
| `held` | — | — | **the consumer**, in its own file | what it is actually using |

**To revoke, the Director lowers `requested`.** The consumer drains at its own pace and lowers
`held`. The Director may re-grant only what has been released — up to `granted − held`. The
Director never pre-empts; it adjusts a number and the consumer decides how to shrink.
`held > requested` is a normal transient, not an error.

Reallocation costs the loser's `transition.stopSec` plus the winner's `transition.startSec`, and
is admissible only if the `gain` pays that back within the horizon. This is the whole anti-thrash
mechanism: no hysteresis constant, no per-controller tuning.

### Reservation

An `atomic` or single-rung candidate that does not fit is **reserved toward**, not skipped.

| Field | Type | Req | Meaning |
|---|---|---|---|
| `group` | `id` | yes | the reservation binds the **group**, not one candidate |
| `consumer` | `id` | yes | |
| `resource` | `resId` | yes | **request form** — a round is keyed on it (§B.5.1) |
| `toward` | `num` | yes | the target amount |
| `expiresAt` | `ms` | yes | `now + reservationTtlSec × 1000` |

Accumulating resource is withheld from lower-ranked candidates until the reservation is filled or
expires.

## B.8 `/state/decision.json`

The latest round, written once, serving three consumers: audit trail, CLI data source, analysis
input. **Rejected candidates are logged, not only chosen ones** — counterfactuals are where the
analysis lives and are unrecoverable afterwards.

```jsonc
{
  "schema": 2, "epoch": 7, "bitNode": 9, "t": 1755561783000,
  "trigger": "goalSatisfied:gang-karma", "horizonSec": 3600,
  "unresolvedConstraints": [], "pathConflicts": [],
  "goals": {
    "gang-karma":   { "shortfall": 0,      "rate": 12.5,  "eta": 0 },
    "cycle-income": { "shortfall": 1.5e11, "rate": 4.2e6, "eta": 35714.3 },
    "nitesec-rep":  { "shortfall": 250000, "rate": 250,   "eta": 1000.0 },
    "corp-funds":   { "shortfall": 4e9,    "rate": 1e6,   "eta": 4000.0 }
  },
  "rounds": [
    { "resource": "ram", "available": 4608, "reserved": 32,
      "ranked": [
        { "candidateId": "hacking:t2", "group": "hacking", "controller": "hacking",
          "goal": "cycle-income", "gain": 412.0, "cost": 2304, "score": 0.1788,
          "paybackSec": 240, "gate": "pass", "outcome": "granted", "confidence": "measured" },
        { "candidateId": "hacking:t3", "group": "hacking", "controller": "hacking",
          "goal": "cycle-income", "gain": 470.0, "cost": 4096, "score": 0.1147,
          "paybackSec": 240, "gate": "pass", "outcome": "excluded", "confidence": "measured" },
        { "candidateId": "share:nitesec", "group": "factions", "controller": "factions",
          "goal": "nitesec-rep", "gain": 88.0, "cost": 2048, "score": 0.0430,
          "paybackSec": 0, "gate": "pass", "outcome": "granted", "confidence": "modelled" },
        { "candidateId": "corp:daemon", "group": "corp", "controller": "corp",
          "goal": "corp-funds", "gain": 6.1, "cost": 256, "score": 0.0238,
          "paybackSec": 0, "gate": "pass", "outcome": "reserved", "confidence": "guessed" }
      ] }
  ]
}
```

| Field | Type | Req | Meaning |
|---|---|---|---|
| `schema` | `int` = `2` | yes | |
| `epoch`, `bitNode`, `t` | `int`, `int`, `ms` | yes | required on every analysable record |
| `trigger` | `str` | yes | `<event>:<subject>`, e.g. `goalSatisfied:gang-karma`, `periodic` |
| `horizonSec` | `sec` \| `"Infinity"` | yes | |
| `unresolvedConstraints` | `id[]` | yes | as §B.7 |
| `pathConflicts` | `path[]` | yes | paths published by more than one controller (§B.6.0) |
| `goals` | `{id: GoalState}` | yes | **one entry per enabled goal**, satisfied ones included; this is what the CLI answers "how long until Y?" from |
| `rounds` | `Round[]` | yes | **one entry per request-form resource evaluated** (§B.5.1), not one field. The example shows the `ram` round only; a real record also carries `money`, `player` and each `sleeve:N` |

### GoalState

| Field | Type | Req | Meaning |
|---|---|---|---|
| `shortfall` | `num` \| `null` | yes | `S`; `null` for a structural goal |
| `rate` | `num` \| `null` | yes | **the pre-round aggregate `R`** — the same number the round's `gain` calculations were scored against, not the post-grant total. `null` for a structural goal |
| `eta` | `sec` \| `"Infinity"` | yes | `shortfall / rate`, or §B.1.1's structural recursion |

`rate` is stated as pre-round because `gain = eta(g) − S/(R + ΔR)` is meaningless if `R` already
includes `ΔR`. The post-grant rate is recoverable by summing the granted candidates' `ratePerSec`,
and appears in the next `/logs/observations.jsonl` sample anyway.

### Round

| Field | Type | Req | Meaning |
|---|---|---|---|
| `resource` | `resId` | yes | **request form** |
| `available` | `num` | yes | total allocatable before reserves |
| `reserved` | `num` | yes | withheld by `reserve` constraints |
| `ranked` | `RankedEntry[]` | yes | every candidate considered, granted or not |

### Ranked entry

**`ranked` is in descending `score` order**, ties broken per `strategy.md` §6.5 step 7. It carries
every candidate considered — granted, excluded, displaced, reserved and rejected alike. Reading
the array top to bottom reproduces the allocation exactly, which is the property that makes the
record an audit trail rather than a summary.

| Field | Type | Req | Values |
|---|---|---|---|
| `candidateId` | `id` | yes | |
| `group` | `id` | yes | |
| `controller` | `id` | yes | |
| `goal` | `id` | yes | the goal it was scored against |
| `gain` | `num` \| `"Infinity"` | yes | seconds of completion time removed |
| `cost` | `num` | yes | amount required of this round's resource |
| `score` | `num` \| `"Infinity"` | yes | `gain / cost` |
| `paybackSec` | `sec` \| `"Infinity"` | yes | derived per §B.6.1 |
| `gate` | `str` | yes | `pass`, or one of the `fail:` values below |
| `outcome` | `str` | yes | one of the values below |
| `confidence` | `enum(measured,modelled,guessed)` | yes | |

| `gate` | Cause |
|---|---|
| `pass` | admissible |
| `fail:noGoal` | `produces.path` matches no enabled, eligible goal (§6.5 step 1) |
| `fail:forbidden` | a `forbid` constraint matched (step 2) |
| `fail:paybackExceedsHorizon` | `paybackSec ≥ horizon(c)` and `permanent != true` (step 3) |
| `fail:granularityUnsatisfiable` | no placement satisfies `minPerHost` (§B.6.1) |
| `fail:controllerBlocked` | its controller reports `health: "blocked"` or `"error"` (§6.5 step 4) — an errored controller's candidates describe a state it may no longer be in |
| `fail:disabled` | a `disable` constraint names its controller |

| `outcome` | Meaning |
|---|---|
| `granted` | fully allocated |
| `partial` | allocated less than `requires`; impossible when `atomic: true` |
| `displaced` | passed the gate, but the resource was exhausted by higher-ranked candidates |
| `reserved` | did not fit; a reservation was opened toward it (§B.7) |
| `deferred` | withheld because an active reservation on another group holds the resource |
| `excluded` | a higher-scoring candidate in the same `group` already won this round |
| `rejected` | failed the gate |

## B.9 `/state/infra.json` — `detail.inventory`

Nothing else publishes which hosts exist. The Director assembles its world view from controller
state files and may not call game APIs, so the fleet inventory has to arrive here.

```jsonc
"detail": {
  "inventory": {
    "scannedAt": 1755561780000,
    "hosts": [
      { "host": "home",    "maxRam": 512,  "cores": 1, "root": true, "purchased": false },
      { "host": "pserv-0", "maxRam": 4096, "cores": 1, "root": true, "purchased": true }
    ]
  },
  "reconciliation": {
    "at": 1755561780000,
    "drift": [ { "host": "home", "observedUsed": 320, "sumHeld": 256, "deltaGb": 64 } ]
  }
}
```

| Field | Type | Req | Meaning |
|---|---|---|---|
| `inventory.scannedAt` | `ms` | yes | |
| `hosts[].host` | `str` | yes | game hostname |
| `hosts[].maxRam` | `num` | yes | GB |
| `hosts[].cores` | `int` | yes | |
| `hosts[].root` | `bool` | yes | admin rights |
| `hosts[].purchased` | `bool` | yes | perishable at install |
| `reconciliation.drift[]` | see above | yes | |

**This is one of the two structured inputs the Director reads outside `provides`** (§B.5). The
host list is not scalar, so it cannot be a world-view path; the Director reads
`/state/infra.json` → `detail.inventory` directly, by that exact path, and reads no other
controller's `detail`.

`infra` additionally publishes the scalars a goal might threshold on — `ram.total`,
`servers.owned`, `servers.rooted` — in its `provides` map like any other controller.

**Reconciliation reports; it never corrects.** Bookkeeping drifts from reality — a script run
from the terminal, a server deleted, a controller killed mid-drain. A periodic comparison of each
host's observed used RAM against the sum of `held` against it is what makes an unobserved
allocator trustworthy. A corrector racing the consumers would reintroduce exactly the race the
lease model exists to close. History goes to `/logs/reconcile.jsonl`.

## B.10 `/state/watchdog.json`

```jsonc
{ "schema": 1, "epoch": 7, "lastRun": 1755561783000, "tickMs": 5000,
  "domains": {
    "corp": { "launchedAt": 1755561600000, "lastSeenAt": 1755561783000,
              "restarts": 2, "consecutive": 0, "lastRestartAt": 1755561600000,
              "gaveUp": false }
  } }
```

| Field | Type | Req | Meaning |
|---|---|---|---|
| `schema` | `int` = `1` | yes | |
| `epoch` | `int` | yes | |
| `lastRun` | `ms` | yes | the watchdog's own heartbeat |
| `tickMs` | `int` | yes | the watchdog's own loop period |
| `domains` | `{id: DomainRecord}` | yes | keyed by manifest id |

### DomainRecord

| Field | Type | Req | Meaning |
|---|---|---|---|
| `launchedAt` | `ms` \| `null` | yes | when the watchdog last `exec`ed it; `null` if never |
| `lastSeenAt` | `ms` | yes | last non-stale heartbeat observed |
| `restarts` | `int` | yes | lifetime, this epoch |
| `consecutive` | `int` | yes | consecutive restarts; counts *cannot start*, not *is unreliable* |
| `lastRestartAt` | `ms` \| `null` | yes | |
| `gaveUp` | `bool` | yes | cleared only by hand or by `RELOAD` |

This is observation, so it lives in `/state/` and is wiped on install. That is correct: after an
install nothing has started and nothing is in a crash loop.

## B.11 `/data/domains.json`

The launch manifest. **Required for process bootstrap** — at node entry `/state/` is empty, so
launch metadata cannot live in controller state files or nothing can be started. It is data, not
logic: the watchdog starts what the manifest names, and makes no domain decision.

It is also the **name → port table**, which resolves the control channel's missing join.

```jsonc
{
  "schema": 1, "generatedAt": 1755500000000,
  "resources": {
    "ram":                  "capacity",
    "money":                "consumable",
    "hashes":               "consumable",
    "player":               "exclusive",
    "sleeve":               "exclusive",
    "bladeburner.stamina":  "regenerating"
  },
  "system": [
    { "id": "director", "port": 1, "tickMs": 5000,
      "launch": { "script": "/daemon/director.js", "host": "home", "threads": 1, "args": [] } },
    { "id": "watchdog", "port": 2, "tickMs": 5000,
      "launch": { "script": "/daemon/watchdog.js", "host": "home", "threads": 1, "args": [] } }
  ],
  "domains": [
    { "id": "stats", "port": 10, "tickMs": 1000,
      "launch": { "script": "/daemon/stats.js", "host": "home", "threads": 1, "args": [] },
      "bootRam": 8, "critical": true },
    { "id": "corp", "port": 11, "tickMs": 1000,
      "launch": { "script": "/daemon/corp.js", "host": "home", "threads": 1, "args": [] },
      "bootRam": 64, "critical": false,
      "tagKeys": ["industry", "round"], "actions": ["acceptInvestment", "expandIndustry"] }
  ]
}
```

### `resources` — the kind of each resource

| Field | Type | Req | Meaning |
|---|---|---|---|
| `resources` | `{str: enum(exclusive,consumable,capacity,regenerating)}` | yes | keyed by the **bare kind** (§B.5.1), never by an instance |

Nothing else declares a resource's kind, and the kind decides which form a round is keyed on,
whether the resource is bin-packed, and whether it is revocable (§B.5). Without this table the
Director cannot tell `hashes` from `bladeburner.stamina`. An instance id inherits its kind from
its bare prefix: `ram:pserv-0` is `capacity` because `ram` is.

A resource named in a candidate, a constraint or a lease but absent from this table is reported
in `unresolvedConstraints` and its round is skipped.

### `system` — processes that are not domains

The Director and the watchdog participate in no allocation and publish no candidates, so they are
not `domains[]` entries. They carry `id`, `port`, `tickMs` and `launch` and nothing else.

| Started by | |
|---|---|
| `director`, `watchdog` | the bootstrap script, at node entry, before any domain |
| every `domains[]` entry | the watchdog |
| `director`, if it dies | the watchdog, by the same D.2 rules |
| `watchdog`, if it dies | **nothing** — see §17 O-9 |

### `domains` — controllers

| Field | Type | Req | Default | Meaning |
|---|---|---|---|---|
| `id` | `id` | yes | — | matches `/state/<id>.json` |
| `port` | `int` ≥ 1 | yes | — | **unique across all domains**; its control channel |
| `tickMs` | `int` | yes | — | expected loop period; the watchdog's fallback before the first heartbeat |
| `launch.script` | `str` | yes | — | absolute in-game path |
| `launch.host` | `str` | yes | — | |
| `launch.threads` | `int` ≥ 1 | yes | — | |
| `launch.args` | `str[]` | yes | `[]` | |
| `bootRam` | `num` | no | `0` | GB needed to start; informational for the bootstrap script |
| `critical` | `bool` | no | `false` | `true` ⇒ `gaveUp` toasts at `error` rather than `warn` |
| `tagKeys` | `str[]` | no | `[]` | tag keys this controller may set on a candidate; the vocabulary a `match` may use (§B.2.1) |
| `actions` | `str[]` | no | `[]` | `action` values this controller may set on a candidate; the vocabulary a `forbid` may name |

**Reserved ports** by convention: `1` Director, `2` watchdog, `3` CLI. Domains start at `10`.

**The watchdog starts every domain in the manifest, unconditionally.** Not gated on a lease, and
not gated on a `disable` constraint either. Gating on a lease would be circular — a controller
must run to publish candidates, and it cannot win a lease without candidates — and it would
contradict `strategy.md` §13.2's "run the cheapest tier of every controller early, even where
output is worthless," which is how `guessed` estimates become `measured` ones.

**A lease governs what a running controller may use, never whether it runs.** A controller
holding no lease still loops, still heartbeats, still publishes candidates, and takes no
resource-consuming action. A `disable`d controller is that same state arrived at deliberately:
the Director stops ranking it and drives `requested → 0`, and the process itself never notices
anything except a draining lease. **Nothing in this system stops a process because of a
constraint.** To stop a process, remove it from the manifest.

**The system must be startable from a single script, with no human input, given only what is on
`home`, at base home RAM.** The gate: start cold, do not touch it, return in some hours — did it
make progress? Measured as a diff of goal shortfalls in `/logs/observations.jsonl`.

## B.12 `/data/prereqs.json`

Pre-generated dependency graph — augmentation → faction → reputation chains, division and
industry prerequisites, and anything else with a known static dependency structure. **Generated
once, offline, by tooling; never written by the fleet; not intended to be human-readable.**

Readers: controllers, and the CLI. It is what a controller consults to author a goal's
`preconditions` (`strategy.md` §2.6). The Director does not read it — §2.4 forbids the search
that reading it would imply. See §17 O-1.

```jsonc
{
  "schema": 1, "generatedAt": 1755500000000, "generator": "tools/gen_prereqs.py@a3f19c",
  "gameVersion": "3.0.2-dev",
  "nodes": {
    "aug:NeuroFlux Governor": {
      "kind": "augmentation",
      "requires": ["faction:any"],
      "data": { "baseCost": 750000, "repCost": 500 }
    }
  }
}
```

| Field | Type | Req | Meaning |
|---|---|---|---|
| `schema` | `int` = `1` | yes | |
| `generatedAt` | `ms` | yes | |
| `generator` | `str` | yes | tool identity and revision — provenance for a stale table |
| `gameVersion` | `str` | yes | what it was generated against |
| `nodes` | `{str: Node}` | yes | keyed by node id, `<kind>:<name>` |
| `Node.kind` | `str` | yes | open set: `augmentation`, `faction`, `company`, `server`, `skill`, … |
| `Node.requires` | `str[]` | yes | node ids; **must form a DAG** |
| `Node.provides` | `str[]` | no | node ids this node satisfies. A `requires` edge naming `X` is met if the graph contains `X`, **or** any node whose `provides` lists `X`. This is how `faction:any` in the example is satisfied by every concrete faction node |
| `Node.data` | `{}` | yes | opaque payload; interpreted only by the owning controller |

Node ids are **not** goal ids and are never used as `preconditions` directly. A controller
translates a node into a goal with a `condition`, and it is that goal's id that appears in
`preconditions`.

Additional static tables follow the same envelope at `/data/<name>.json`.

## B.13 `/memory/run.json`

The single source of truth for `epoch` and `bitNode`. Every `/state/` file is validated against
this, and every analysable log record carries both.

```jsonc
{ "schema": 1, "epoch": 7, "bitNode": 9,
  "sourceFiles": { "1": 3, "2": 3, "3": 3, "4": 3, "5": 1, "6": 1, "9": 1 },
  "epochStartedAt": 1755561000000, "lastInstallAt": 1755560900000,
  "resetReason": "install" }
```

| Field | Type | Req | Meaning |
|---|---|---|---|
| `schema` | `int` = `1` | yes | |
| `epoch` | `int` ≥ 0 | yes | incremented by the install callback, and by the bootstrap script on a BitNode change (writer table below); never by anything else |
| `bitNode` | `int` | yes | |
| `sourceFiles` | `{str: int}` | yes | SF number → level |
| `epochStartedAt` | `ms` | yes | |
| `lastInstallAt` | `ms` \| `null` | yes | |
| `resetReason` | `enum(install,bitnode,bootstrap)` | yes | why this epoch began |

| Writer | When | Effect |
|---|---|---|
| install callback | after `installAugmentations` | `epoch += 1`, `resetReason: "install"`, `lastInstallAt` set |
| bootstrap script | file absent | writes `epoch: 0`, `resetReason: "bootstrap"` |
| bootstrap script | file present but `bitNode` ≠ the running node | `epoch += 1`, `resetReason: "bitnode"`, `bitNode` updated |

A missing `run.json` is a cold start, not an error.

**The BitNode row is not decoration.** `/state/` files survive a BitNode change on disk (§A.2)
and would otherwise validate against an unchanged `epoch`, letting the Director allocate against
a world that has ended — the exact failure the epoch failsafe exists to catch. The bootstrap
script is the only thing that runs before anything else at node entry, so it is the only
candidate for the writer.

## B.14 `/memory/<controller>.json`

Measured knowledge that survives an install. A controller writing a calibration, a measured
constant, or a solved contract into `/state/` loses it every cycle.

| Field | Type | Req | Meaning |
|---|---|---|---|
| `schema` | `int` | yes | |
| `controller` | `id` | yes | |
| `updatedAt` | `ms` | yes | |
| `writtenInEpoch` | `int` | yes | **provenance only** — never validated against the current epoch |
| `data` | `{}` | yes | controller-owned |

| Belongs in `/state/` | Belongs in `/memory/` |
|---|---|
| current faction reputation | measured rep-per-second per unit of charisma |
| owned servers and their RAM | measured p99 launch jitter |
| current money | measured income per GB-second by target |
| this cycle's shortfalls | calibrated model constants, solved contracts |

## B.15 Logs

All streams are JSONL: one complete JSON object per line, append-only, one writer per file.

| Path | Writer | Cadence |
|---|---|---|
| `/logs/decisions.jsonl` | Director | event-driven; §B.8 records verbatim |
| `/logs/actions.<controller>.jsonl` | that controller | per action |
| `/logs/observations.jsonl` | Director | fixed wall-clock interval, default `10s` |
| `/logs/reconcile.jsonl` | infra | per reconciliation pass |
| `/logs/<controller>.log` | that controller | free |

**One writer per file, as everywhere else (A.1 rule 2).** The action stream is therefore split
per controller rather than shared; analysis concatenates them. Nothing appends to a file another
process appends to.

**Every record in every stream carries `t`, `epoch`, and `bitNode`.** Without node and epoch,
cross-run analysis silently mixes incomparable regimes: a BN9 income rate and a BN10 income rate
are not the same measurement.

### Common record fields

| Field | Type | Req | Meaning |
|---|---|---|---|
| `t` | `ms` | yes | wall clock |
| `epoch` | `int` | yes | |
| `bitNode` | `int` | yes | |
| `lvl` | `enum(debug,info,warn,error)` | yes | |
| `ev` | `str` | yes | dotted event name, e.g. `recipe.step`, `lease.revoke` |

`/logs/decisions.jsonl` carries §B.8 records, which have no `lvl` or `ev` of their own. The
Director adds `lvl: "info"` and `ev: "decision"` at write time; nothing else about the record
changes.

### `/logs/actions.<controller>.jsonl`

| Field | Type | Req | Meaning |
|---|---|---|---|
| `controller` | `id` | yes | |
| `candidateId` | `id` \| `null` | yes | links back to the decision record |
| `action` | `str` | yes | |
| `cost` | `{resId: num}` | yes | actual, not approved |
| `result` | `enum(ok,failed,skipped)` | yes | |
| `error` | `str` \| `null` | yes | |

### `/logs/observations.jsonl`

Sampled on a wall-clock interval, not per tick, so the series is regular and needs no
resampling.

| Field | Type | Req | Meaning |
|---|---|---|---|
| `paths` | `{path: num\|str\|bool}` | yes | the world view at sample time — the union of every controller's `provides` (§B.6.0). Subsumes money, reputation, karma and everything else; there are no named per-domain fields |
| `ramTotal`, `ramHeld` | `num` | yes | GB, fleet-wide |
| `shortfalls` | `{id: num\|null}` | yes | goal id → `S`; `null` for a structural goal |
| `etas` | `{id: num\|"Infinity"}` | yes | goal id → `eta` |
| `rates` | `{path: num}` | yes | aggregate `R` per produced path |

A named `money` or `rep` field would put a game mechanic in the log schema. `paths` carries them
without the strategy layer learning what they are.

**The join that matters is `decision → action → subsequent observation`**, answering: *was the
predicted marginal time right?* That is the only validation loop on this specification's central
estimate, and it is why `candidateId` appears in the action record.

### Levels

`warn` and above also fire `ns.toast`. **Every irreversible action logs at `warn` with the full
predicate values that triggered it, before it executes.**

---

# Part C — Ports

Ports carry **only imperatives**. Anything that must survive a restart is a file.

| Kind | Medium | Why |
|---|---|---|
| state; standing directives; switches | file | durable across crash, reload, install |
| `STATUS`, `RELOAD`, `PAUSE`, `SHUTDOWN` | **port** | one-shot; loss is recoverable by resending |
| high-frequency telemetry | port | loss is acceptable |

Each domain owns one port, declared in `/data/domains.json` (§B.11), and reads it at the top of
every tick using `ns.getPortHandle()` / `handle.empty()` — never `ns.peek()` against the
`"NULL PORT DATA"` sentinel.

## C.1 Message envelope

```jsonc
{ "ts": 1755561783000, "id": "a1", "from": "terminal", "to": "corp",
  "type": "STATUS", "data": null, "replyPort": 3 }
```

| Field | Type | Req | Default | Meaning |
|---|---|---|---|---|
| `ts` | `ms` | yes | — | |
| `id` | `str` | yes | — | correlation id, unique per sender |
| `from` | `id` | yes | — | sender's domain id, or `terminal` / `cli` |
| `to` | `id` | yes | — | recipient's domain id; the port is looked up in the manifest |
| `type` | `enum(STATUS,RELOAD,PAUSE,RESUME,SHUTDOWN,PING)` | yes | — | |
| `data` | any \| `null` | yes | — | command-specific |
| `replyPort` | `int` \| `null` | yes | — | **`null` ⇒ send no reply.** Replaces the ambiguous boolean |

A message addressed to an unknown `to`, or carrying an unknown `type`, is logged at `warn` and
discarded. Never crash on a malformed message.

## C.2 Commands

| `type` | Effect | Durable equivalent |
|---|---|---|
| `STATUS` | write the current state envelope to `replyPort` | read `/state/<id>.json` |
| `RELOAD` | re-read `/config/`, `/data/` and `director.json` immediately | wait one tick |
| `PAUSE` / `RESUME` | transient | `control.json` → `controllers.<id>.paused` |
| `SHUTDOWN` | exit cleanly after finishing the current tick | — |
| `PING` | reply `{ok: true}` to `replyPort` | `lastRun` |

**A transient `PAUSE` does not survive a restart; the `control.json` flag does.** That is the
whole reason the split exists.

---

# Part D — Behaviour

## D.1 Controller tick

1. Read `/state/director.json`. Missing or stale ⇒ **assume zero**: no leases, no approvals, no
   assignments. Take no resource-consuming action, keep heartbeating, publish candidates as
   normal, and set `health: "degraded"`. A controller never substitutes its own judgement for a
   missing directive (A.1 rule 1).
2. Read `/config/control.json`. If `paused && (pauseExpiresAt === null || now <= pauseExpiresAt)`, take no action and
   report `health: "blocked"` — **but keep looping and keep writing the state file.** Do not
   exit. A controller never reads `constraints.json` to learn it is disabled; `disable` is
   invisible to it (§B.11).
3. Drain the control port.
4. Read the game state it needs.
5. **Plan — a pure function from snapshot to action list.**
6. If `advisoryMode` (global or per-controller), log the action list and skip step 7.
7. Execute, inside its approvals and leases, each action wrapped so one failure does not kill the
   loop.
8. Write its own state file — **always**, including on every failure path.

**A paused controller idles; it never exits.** That is what lets a subsystem be toggled live
without killing processes, and stops the watchdog fighting a deliberate stop.

**A `disable` constraint is not something a controller reads.** It acts at allocation: the
Director stops ranking that controller's candidates and drives `requested → 0`. The controller
notices only that its lease is draining and behaves exactly as it would under any other
revocation. This is the difference from `pause`, which the controller does read and which holds
the lease.

## D.2 Watchdog

`daemon/watchdog.js` reads `/state/<id>.json` for each `id` in `/data/domains.json`, decides
whether that domain is alive, and restarts the ones that are not. It never inspects `detail`,
never makes a domain decision, and **ignores any `/state/` file whose stem is not an id in
`domains[]` or `system[]`** — sub-instance files (§B.6) among them. It monitors `director` by the
same rules as any domain, and never monitors itself.

It starts **every** manifest domain, whether or not that domain holds a lease and whether or not
a `disable` constraint names it (§B.11). It never reads `constraints.json`.

### Liveness

A domain is dead when either holds:

```
now - lastRun > staleAfterMs
health == "error"
```
```
staleAfterMs = max(3 × tickMs, STALE_FLOOR_MS)      // STALE_FLOOR_MS = 10_000
```

`tickMs` is the domain's own, from its state file, or from the manifest before the first
heartbeat.

**The floor is not optional.** The corp daemon wakes on `ns.corporation.nextUpdate()`, whose real
period is 200 ms to 2 s, which puts `3 × tickMs` well under a second — a figure a React
re-render, an autosave, or a backgrounded tab exceeds routinely. **Restarting a healthy
controller is strictly worse than noticing a dead one ten seconds late**, because a restart
discards in-flight convergence and re-pays start-up cost.

### Launch grace

A just-started controller has not written its state file and is indistinguishable from a dead
one. The watchdog records `launchedAt` and judges nothing until:

```
now - launchedAt > max(staleAfterMs, LAUNCH_GRACE_MS)      // LAUNCH_GRACE_MS = 15_000
```

Without this the watchdog restarts every controller it starts, immediately and forever. The same
grace applies to a hand-started controller, measured from its envelope's `startedAt`.

### Restart

1. **`ns.kill(pid)` first.** Two live copies writing one state file breaks A.1 rule 2, and a
   wedged process still holds its RAM.
2. `ns.exec(launch.script, launch.host, launch.threads, ...launch.args)` from the manifest.
3. Record `launchedAt`; bump the counters.

A domain absent from `/data/domains.json` cannot be restarted. Log at `error` and leave it alone
rather than guessing a script path.

### Crash-loop backoff

```
delayMs = min(BACKOFF_BASE_MS × 2 ** consecutive, BACKOFF_MAX_MS)   // 5_000, 300_000

consecutive += 1 on every restart
consecutive  = 0 once health != "error" for GOOD_PASSES consecutive passes   // 3
```

After `MAX_CONSECUTIVE = 5` the watchdog **stops restarting that domain**, sets `gaveUp`, logs at
`error` and toasts. A controller that cannot start needs a human; a watchdog hammering it
converts a loud failure into a quiet one. Clearing `gaveUp` is deliberate — start it by hand, or
`RELOAD` the watchdog.

`consecutive` counts restarts, not errors: a controller that errors, restarts, runs healthily for
an hour and errors again has `consecutive == 1`. It measures *cannot start*, not *is unreliable*.

## D.3 Constants

| Name | Default | Where |
|---|---|---|
| `STALE_FLOOR_MS` | `10_000` | D.2, A.6 |
| `LAUNCH_GRACE_MS` | `15_000` | D.2 |
| `BACKOFF_BASE_MS` | `5_000` | D.2 |
| `BACKOFF_MAX_MS` | `300_000` | D.2 |
| `GOOD_PASSES` | `3` | D.2 |
| `MAX_CONSECUTIVE` | `5` | D.2 |
| `MATERIAL_DELTA` | `0.10` | B.6.1 |
| `reservationTtlSec` | `300` | B.7 |
| `observationIntervalSec` | `10` | B.15 |
| `allocationSafetyIntervalSec` | `60` | `strategy.md` §6.7 |
| `defaultPauseTtlSec` | `1800` | B.4 |
| `escalationDefaultTimeoutSec` | `900` | B.4 |

---

# Part E — Reconciliation

## §16 Divergences from `strategy.md`, and provisional decisions

**Status: X1–X42 accepted and landed in `strategy.md`, 2026-08-26.** Nothing in this table is an
outstanding divergence. It is kept because the "`strategy.md` today" column records what the
specification used to say and why it was wrong — which is the part that would otherwise be lost,
and the reason `reference/rationale.md` exists.

The table is meant to be exhaustive. A divergence from `strategy.md` not listed here is a defect
in this document, not a decision.

| # | This document | `strategy.md` today | Origin |
|---|---|---|---|
| X1 | `goals.json` and `constraints.json` live in `/config/` and survive an install | §2 and §4.1 put them in `/state/`, which §9.2 deletes in full — `survivesInstall` would be a field with no effect | agreed 2026-08-26 |
| X1b | `preferences.json` lives in `/config/` | §4.2 names **no path at all** for it | undecided, decided here |
| X2 | Five directories: `/config/`, `/data/`, `/state/`, `/memory/`, `/logs/` | three: `/state/`, `/memory/`, `/logs/` | follows from X1 |
| X3 | `/data/domains.json` | §13.1 says `/memory/domains.json` | `/memory/` is measured knowledge; a hand-generated manifest is not |
| X4 | `/memory/run.json` is the sole source of `epoch` and `bitNode` | §9.2 says "increments `epoch` in `/memory/`", naming no file | review U8 |
| X5 | Epoch validation applies to `/state/` only | §9.2 says "every state file", ambiguous whether config counts | review U8 |
| X6 | Staleness uses the **source file's** `tickMs`, **and** a `STALE_FLOOR_MS = 10_000` floor | §9.1 says "older than `3 × tickMs`", unqualified and with no floor. The floor changes the outcome for every controller with `tickMs < 3333` | review U9; floor carried from the prior contract §6 |
| X7 | `control.json`: `pause`, `advisoryMode`, escalation dials, escalation answers | no such file; both switches homeless | review Q3, decided 2026-08-25 |
| X8 | `disable` constraint kind | §4.1 has `reserve`, `forbid`, `admit` only | review Q3 |
| X9 | Escalation **answers** live in `control.json` | §8.3 says "the answer is also state", naming no file. It cannot be the controller's own file — the human is not its writer | new here |
| X10 | Candidate `action` + `tags`; `Match` is exact key/value; `tagKeys` declared in the manifest | §4.1's one `forbid` example is inert against §6.1's schema, and `admit.match` has no grammar either | review Q4, decided 2026-08-26 |
| X11 | Third candidate kind `assignment`, with `activity` | §6.1 has two kinds; §7.4's `assignments` has no producer | review Q5, decided 2026-08-26 |
| X12 | `group`; defaults to the controller id for `production`/`assignment` and to the candidate id for `purchase`; one grant per group per resource per round; reservations bind the group | nothing prevents two rungs of one ladder both being granted | review Q6, decided 2026-08-26 |
| X13 | Goal `role: "installHorizon"`; structural `eta` = max over unsatisfied preconditions | §6.5 says "the current install horizon", sourced from nowhere | review Q7, decided 2026-08-26. **Narrows SQ-3; does not close it** |
| X13b | The gate's horizon stays **per candidate** — `min(installHorizonSec, servingGoal.deadline, admit.maxPaybackSec)`; `horizonSec` in the directive and decision files records only the install term | §6.5 step 3 already says this; X13 must not be read as replacing it with a global scalar | clarification |
| X14 | Install is an augs-controller candidate gated by an escalation | unstated anywhere | new here |
| X15 | `executed[]` on the controller; Director transcribes `state → "taken"`; `Purchase.expiresAt` derived from `allocationSafetyIntervalSec`; candidate `id` must be stable across ticks | §7.1 makes `state` authoritative but names no writer for the transition, has no `expiresAt`, and does not require id stability | review Q8, decided 2026-08-26 |
| X16 | Fungible `requires`, placed lease **rows**; `minPerHost`; Director's free RAM is bookkeeping | §6.1 and §7 examples are consistent with this but the rule is unstated | review Q1, decided 2026-08-25 |
| X16b | **Allocation rounds are keyed on the request-form resource** (`ram`, not `ram:pserv-0`); placement happens after ranking; `reserve.resource` accepts either form and grant-form reserves are applied to the inventory before packing | §6.5 says "per resource" without saying which form, and §10's single `resource` field implies the grant form | follows from X16 |
| X17 | `/state/infra.json` → `detail.inventory`; reconciliation reports and never corrects | no `infra` controller and no inventory schema exist | review Q1, obligations 2–3 |
| X17b | **`provides` on every controller envelope is the sole producer of the world view**; one publisher per path; conflicts resolve to `unknown` and are reported | §9.1 says the world view is "assembled from controller state files" but names no field and no ownership rule. Without this, `player.money` and `player.karma` have no producer and nothing in the allocator computes | new here — the general form of X17 |
| X17c | Sub-instance files `/state/<c>.<i>.json` exist, are read by their parent only, and contribute nothing to the world view | §9.1's "controller state files" is unqualified | new here; supports the one-bidder-per-domain framing |
| X18 | `decision.json` holds `rounds[]`, one per request-form resource, plus a `goals` map carrying `shortfall`/`rate`/`eta` | one `resource` field, though allocation is per resource; and §12 requires the CLI to read `eta` from the decision record, which had nowhere to live | review U11 |
| X19 | Two `reserve` constraints on one resource take the **max**; `fraction` applies **per matched instance**; `against` is a **ceiling on that consumer**, not an exclusive set-aside | no arithmetic given; `fraction` on a glob undefined; `against` undefined and the opposite reading inverts §4.1's own example | review U12 |
| X20 | Preference `weight` ∈ `[0,1]`, summed, clamped | scale, bounds and combination unstated | review U14 |
| X21 | `unresolvedConstraints` reported every round — a constraint naming a resource, controller, action or match key that does not exist. **A `forbid` that merely matches nothing is not reported**: a dormant constraint is working correctly, and reporting it every round is noise | a constraint that silently matches nothing has no channel at all | review U15 |
| X22 | Ports declared in the manifest; `replyPort: int\|null` replaces `reply: bool` | no name→port table exists anywhere; `reply`'s semantics undefined | review U25 |
| X23 | `MATERIAL_DELTA = 0.10` defines "materially changed" | unquantified | review U13 |
| X24 | `cost` is the amount of **this round's** resource; `cost == 0` ⇒ `score = Infinity`; a multi-resource candidate is ranked once per round it appears in | "the scarcest resource", undefined; division by zero unaddressed | review U10 |
| X25 | `advisoryMode` × dial composition table | SQ-7, marked **blocking** | accepted 2026-08-26; **closes SQ-7** via `strategy.md` §8.2a |
| X26 | `launch` removed from the state envelope; the manifest is authoritative | prior contract §3 had it in both places | follows from X3 |
| X27 | A reader meeting a **higher** `schema` sets `health: "blocked"`, not `"error"` | prior contract §8 said `error`, which the same document's watchdog restarts — a guaranteed crash-loop over a condition a restart cannot fix | correction to the prior contract |
| X28 | `/data/prereqs.json` — a pre-generated dependency graph, new file and new schema | does not exist | requested 2026-08-26 |
| X29 | *(superseded by X38)* | | |
| X30 | `/logs/actions.<controller>.jsonl`, one per writer; `/logs/observations.jsonl` carries a generic `paths` map rather than named `money`/`rep` fields | §11 names a single `actions.jsonl` (multi-writer by construction) and lists `money` and `rep` as fields | follows from A.1 rule 2 and §0 |
| X31 | `paybackSec` is **defined here for the first time**, and resource-neutrally: `cost[r] / produces.ratePerSec` only when the new `produces.unit` equals the cost resource `r`, else `Infinity` | §6.5 step 3 uses `paybackSec` and never defines it. The obvious definition (`cost.money / …`) would name a game mechanic inside the allocator, contrary to §0 | review Q2 decided 2026-08-25; the resource-neutral form is new here |
| X32 | `tier` is **annotation only** — it orders nothing and the allocator does not read it; exclusion is `group`, ranking is `score` | §6.1 presents tiers as the advertising mechanism and §6.6/§13.2 speak of "further tiers", implying the allocator understands them | follows from X12 |
| X33 | The `gate` and `outcome` vocabularies are closed enums: seven `gate` values, seven `outcome` values | §10 shows four ad-hoc strings in an example and defines no enum | new here |
| X34 | `fail:controllerBlocked` fires on `health: "error"` as well as `"blocked"` | §6.5 step 4 and §8.4 name only `blocked` | new here |
| X35 | `unknown` propagation through `and` / `or` / `not` | §3 says an unresolvable path yields `unknown` and stops there | new here |
| X36 | The **bootstrap script** increments `epoch` on a BitNode change | §9.2 names only the install callback, so `/state/` from the previous node would validate against an unchanged epoch — the exact failure the failsafe exists to catch | new here |
| X37 | The Director itself carries `tickMs`, `health` and `message` in `director.json` | §7's schema has none of the three | follows from X27 |
| X38 | The watchdog starts **every** manifest domain, ignoring both leases and `disable`; nothing in the system stops a process because of a constraint | §13.1's "what the manifest names and the Director has leased" | X29, corrected |
| X39 | `spentThisRun` on the controller envelope | not in `strategy.md`; carried over from the prior contract §3 | continuity |
| X40 | `/data/domains.json` → `resources` classifies every resource by kind | nothing anywhere declares whether `hashes` is consumable or `bladeburner.stamina` regenerating, though §5's four kinds decide round keying, packing and revocability | new here |
| X41 | `/data/domains.json` → `system[]` carries the Director's and the watchdog's launch metadata; the bootstrap script starts both; the watchdog then monitors the Director | neither process has launch metadata, a port, or a launcher anywhere, yet §13.1 requires a single-script cold start | new here |
| X42 | The `hacking-cap` example is `0.9` | at `0.5` the ceiling and set-aside readings of `against` coincide numerically, so the example could not distinguish them | follows from X19 |

## §17 Open

| id | Question |
|---|---|
| **O-1** | Does the **Director** read `/data/prereqs.json`? This document says no, because §2.4 forbids the search that would justify it. If the Director should read it, §2.4 needs rewording — it is not a schema change. |
| **O-2** | Bitburner port-number bounds are asserted, not verified. `/data/domains.json` requires `int ≥ 1` and unique. **Verify against `bitburner-src` before the manifest is written.** |
| **O-4** | SQ-3 survives X13 for two cases: a structural goal with no unsatisfied `preconditions` (`{kind: "equals", path: "gang.exists"}`), and any goal whose path is temporarily unresolvable and is therefore structural for that tick. Both yield `eta = Infinity`, so the CLI still cannot answer "how long until X" for them. Whether that is acceptable is the original SQ-3 question, narrowed. |
| **O-5** | *Now `strategy.md` SQ-9.* A candidate contended on two resources at once is ranked once per round, so it can win one and be displaced in the other; `atomic` makes the grant all-or-nothing without reconciling the rankings. Tracked there, not here. |
| **O-6** | `/config/` is multi-writer for two files and single-writer for two others. Whether `constraints.json` and `preferences.json` should also carry `revision` for uniformity, or stay human-only, is a judgement call not yet made. |
| ~~**O-7**~~ | **Decided 2026-08-26: a `stats` controller.** It owns the `player.*` namespace in `provides` — money, karma, skills, reputation — and does nothing else. It publishes no candidates and consumes no resources, so it is a manifest domain with no allocator role. Its `provides` key list is not yet enumerated. |
| **O-8** | `Condition.kind: "predicate"` has no data contract at schema 2 and is **not implementable**. Two designs are live and neither is chosen — a **predicate manager** service arbitrating writes over a port, or **deleting the kind** in favour of a boolean published through `provides` and tested with `equals`. `strategy.md` §15.1 states both and the argument between them. Whichever wins, this document gains either a port protocol and a persistence file, or one deleted `Condition` row. |
| **O-9** | **Nothing restarts the watchdog.** It monitors the Director and every domain; if it dies, the fleet keeps running on its last directives and no controller is ever restarted again — a silent degradation. A mutual-watch, a cheap external heartbeat script, or accepting it as a known limit are all defensible; none is chosen. |

## §18 Downstream edits this document requires

**All doc-set edits are done as of 2026-08-26.** One row remains, and it is code, not prose.

| File | Edit |
|---|---|
| ~~`specs/strategy.md`~~ | **Done 2026-08-26.** X1–X42 folded in; SQ-7 closed by §8.2a; SQ-3 narrowed by §2.4a; SQ-9 opened for two-way contention |
| ~~`START-HERE.md`~~ | **Done 2026-08-26.** §3, §4, §5, §6 and §8 rewritten; the same dead references fixed in `recipe-dsl.md`, `corp.md`, `hwgw-batching-design.md` and `rationale.md` |
| ~~`review-2026-08.md`~~ | **Closed and deleted 2026-08-26.** Q1–Q8 all decided; C1–C4, U1–U15 and U25 dispositioned in §16. `git show 12da099:docs/review-2026-08.md` |
| ~~`specs/prior-manager-contract.md`~~ | **Deleted 2026-08-26** |
| `scripts/` | `/data/domains.json`, `/data/prereqs.json` and the bootstrap script do not exist; nothing conforms to this document yet |
| ~~`claude/` project mirror~~ | **Retired 2026-08-26.** The mirror is gone; the project holds one pointer file. `START-HERE.md` §8 has the reasoning |
