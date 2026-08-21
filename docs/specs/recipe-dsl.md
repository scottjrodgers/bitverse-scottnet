# Spec: Recipe DSL

**Status:** normative for the corp round recipes. Pin before writing round 1.
**Parent:** `docs/managers/corp.md` §2, §6.

A "recipe" is the corp automation's representation of a round setup — the round 1 and round 2
playbooks from the manual. It exists to solve three problems at once:

1. **Idempotency** — the corp manager restarts constantly; re-running a recipe must be a no-op.
2. **Graceful degradation** — the manual's numbers are tuned for BN3. In a penalized BitNode
   there is less money, and the recipe must still produce a working (smaller) corporation.
3. **Testability** — planning must be a pure function so it can be unit-tested against hostile
   synthetic snapshots.

---

## 1. Core idea

> **A recipe is an ordered list of target states, not a list of actions.**

The engine compares each target against a snapshot and emits only the delta. Running it twice
produces nothing the second time.

```
plan(recipe, snapshot, budget) -> { actions, status, blockedOn, spend }
```

`plan` is **pure**. It calls no `ns` function. The executor applies `actions`; advisory mode
simply doesn't.

Because the engine cannot perfectly predict the snapshot after each action, one pass emits one
round of deltas and the loop re-snapshots next cycle. Convergence, not one-shot execution — the
same shape as the HWGW prep loop.

---

## 2. Step kinds

```jsonc
{ "kind": "unlock",     "name": "Export" }
{ "kind": "division",   "name": "Agriculture", "industry": "Agriculture",
                        "cities": ["Sector-12","Aevum","Chongqing","New Tokyo","Ishima","Volhaven"] }
{ "kind": "warehouse",  "division": "Agriculture", "cities": "all", "level": 17 }
{ "kind": "officeSize", "division": "Agriculture", "cities": "all", "size": 8 }
{ "kind": "jobs",       "division": "Agriculture", "cities": "all",
                        "jobs": { "Operations": 3, "Engineer": 1, "Business": 2, "Management": 2 } }
{ "kind": "upgrade",    "name": "Smart Storage", "level": 25 }
{ "kind": "advert",     "division": "Agriculture", "level": 8 }
{ "kind": "export",     "from": "Agriculture", "to": "Chemical",
                        "material": "Plants", "amount": "(IPROD+IINV/10)*(-1)" }
{ "kind": "waitFor",    "what": "researchPoints",
                        "division": "Agriculture", "atLeast": 700 }
{ "kind": "boost",      "division": "Agriculture", "cities": "all",
                        "targets": { "AI Cores": 9081, "Hardware": 10146,
                                     "Real Estate": 459400, "Robots": 1416 } }
```

`cities: "all"` means all six. Every numeric field is a **target**, never an increment — this is
the manual's own convention ("Warehouse level 6 means upgrading warehouse 5 times", "boost
material numbers are the total quantities after buying").

---

## 3. Degradation

Every step carries a `degrade` policy that determines what happens when the budget cannot cover
it. **This is the whole BitNode-robustness mechanism.**

| `degrade` | Behaviour when unaffordable | Use for |
|---|---|---|
| `partial` | buy as many levels as the budget allows, mark the recipe `degraded`, continue | Smart Storage, Smart Factories, Warehouse, Advert, Office |
| `skip` | buy nothing, continue | genuinely optional extras |
| `block` | stop the recipe here and report `blocked` | division creation, unlocks, anything later steps depend on |

Default is `partial` for anything level-based and `block` for anything structural.

A recipe that ran fully `partial` in a penalized node still yields a working corporation — just a
smaller one. That is the required "graceful, not optimal" behaviour.

---

## 4. Engine

```
plan(recipe, snapshot, budget):
    actions = []
    spend   = 0
    degraded = false

    for step in recipe:                          # order IS priority
        s = evaluate(step, snapshot)             # -> { satisfied, cost, actions }
        if s.satisfied:
            continue

        if step.kind == "waitFor":
            return { actions, status: "waiting", blockedOn: step, spend }

        if s.cost <= budget - spend:
            actions += s.actions
            spend   += s.cost
            continue

        switch step.degrade:
            case "partial":
                p = evaluatePartial(step, snapshot, budget - spend)
                actions += p.actions
                spend   += p.cost
                degraded = true
            case "skip":
                degraded = true
            case "block":
                return { actions, status: "blocked", blockedOn: step, spend }

    return { actions, status: degraded ? "degraded" : "complete", spend }
```

Notes:

- **Order is priority.** There is no separate priority field; the array is the ranking.
- `waitFor` halts the pass. Later steps must not run before their precondition — the round 2
  RP wait is the canonical case.
- Once `partial` consumes the remaining budget, subsequent level-based steps naturally
  contribute nothing this pass and pick up next cycle as funds accrue.

---

## 5. Two steps that need care

### `jobs`

`setAutoJobAssignment` moves employees from Unassigned and **throws** if there are not enough. It
also only takes effect at the **next cycle's START state**. So the emitted actions are always:

```
1. set every job to 0
2. set every job to its target
```

and the step should not be considered satisfied until a full cycle has elapsed after issuing it.

### `boost` — and why it self-clears

The manual warns that a per-second purchase order "will buy forever until you run out of storage
space" unless you clear it. That warning applies to setting it once by hand. If the engine
recomputes the rate every cycle:

```
rate = max(0, (target - stored) / 10)        // one cycle = 10 seconds of purchase
```

then the rate reaches 0 automatically as `stored` approaches `target`. **No clear-purchase state
machine is needed** — idempotent convergence handles it.

Two hard rules regardless:

- **Never use Bulk Purchase.** It requires paying upfront; the per-second route can go into debt.
- **`boost` steps always come last in a recipe**, after every upgrade and expansion.

#### `boost` is space-constrained, not budget-constrained — and that breaks naive degradation

Boost materials are bought on credit, so the budget never blocks them. Their real constraint is
**warehouse space**. That creates a coupling the other step kinds don't have:

> The hardcoded boost quantities in a recipe are simply the optimizer's output for the warehouse
> size that recipe *intended* to build. If an earlier `warehouse` or `upgrade` step degraded, the
> actual warehouse is smaller and **those numbers no longer fit.**

Left unhandled, a degraded run would try to stuff round-1 quantities into a half-size warehouse,
congest it, and halt production — turning "smaller corporation" into "broken corporation."

So `boost` carries an extra field:

```jsonc
{ "kind": "boost", "division": "Agriculture", "cities": "all",
  "targets": { "AI Cores": 1562, "Hardware": 1791, "Real Estate": 98470, "Robots": 0 },
  "refitIfSpaceDiffers": true }
```

Engine behaviour when `refitIfSpaceDiffers` is set:

1. Compute the space the literal `targets` require.
2. If it fits the actual warehouse, use them verbatim — this is the normal, tested path.
3. If it does not, **discard them and re-run the closed-form boost optimizer** against the actual
   available space, using that industry's coefficients and material sizes.

The `warehouse` step's `expectSize` field exists to make this checkable: it records the warehouse
size the recipe assumed, so a mismatch is detectable rather than silent. Those values also double
as unit-test fixtures — `WarehouseSize = level * 100 * smartStorageMult` reproduces all four of
the manual's stated sizes exactly (900, 520, 5950, 700), which is a free confirmation that the
formula is right.

---

## 6. Recipe status and the manager

`plan` returns one of four statuses, which map onto the manager-contract health field:

| status | `health` | meaning |
|---|---|---|
| `complete` | `ok` | every target met at full value |
| `degraded` | `degraded` | working, but some steps were partial or skipped |
| `waiting` | `ok` | a `waitFor` precondition has not been met (this is normal) |
| `blocked` | `blocked` | a `block` step is unaffordable; needs more funds |

A recipe is **done** when `status == "complete"` **or** `status == "degraded"` and the budget has
been static across N consecutive passes — i.e. it has extracted everything the funds allow.

---

## 7. Testing

Because `plan` is pure, the test suite is synthetic snapshots in, expected action lists out:

- **Empty snapshot** → the full round 1 action list, in order
- **Fully-satisfied snapshot** → empty action list *(the idempotency test — the most important
  one)*
- **Half-built snapshot** → only the remaining deltas
- **Zero budget** → `blocked` on the first `block` step, nothing emitted
- **Small budget** → `degraded`, with `partial` steps truncated correctly
- **`waitFor` unmet** → `waiting`, and no steps after it appear in the actions
- **Penalized-node budget** (e.g. 20% of BN3 funds) → still produces a coherent, ordered subset

Round 1 and round 2 recipes are then just data, and the engine is tested once.
