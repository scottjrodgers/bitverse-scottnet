# Manager: `corp`

**Status:** designed at the architecture level; optimizers and round 3+ tuning still open.
**Build order:** step 11 in `docs/automation-architecture.md`, but see §12 — the BN3.3 goal
justifies pulling it forward.
**Parent:** `docs/automation-architecture.md`
**Primary source:** *Corporation manual*, last updated 2026-07-03 (uploaded by Scott).
Numbers below are quoted from it; the author reports round 1/2 figures were validated over
200+ headless runs.

**Immediate objective:** finish **BN3 level 3** to unlock `WarehouseAPI` and `OfficeAPI` for
free in every other BitNode. Without SF3.3 those two unlocks cost **$50b each in corp funds**,
which makes corporations painful everywhere else. This is a one-time investment with permanent
payoff — it is why corp automation is worth building well now rather than later.

**Current save context** (see `docs/implementation-plan.md` §0): BN3, early, holding SF3.2.
Because `bitNodeN === 3`, the Warehouse and Office APIs **are** auto-granted this run — the $50b
unlocks are not a concern here, only in later nodes. An existing corporation is running and is
expendable; it must be disposed of before the round 1 recipe can run (§9, restart path).

**SF9.1 is held**, which makes two hash levers live rather than hypothetical — see §1.2 and §7.3.

---

## 1. Why `corp` breaks the standard manager mould

Five structural differences from every other manager in the fleet. Each one forces a design
decision.

### 1.1 It is cycle-driven, not poll-driven

The corporation continuously transitions through **five states**:

```
START -> PURCHASE -> PRODUCTION -> EXPORT -> SALE -> START
```

One full cycle takes **10 seconds**, or **1 second** when bonus time is available. Actions must
be taken *at specific state boundaries* — Smart Supply must run immediately before PURCHASE and
immediately after it; Market-TA2 pricing must be set before SALE.

Every other manager is a "wake up, look around, act" loop. `corp` is a **state machine
synchronised to an external clock that can run 10× faster without warning.** Poll fast (~100ms),
detect state *edges*, and never assume a fixed wall-clock period.

### 1.2 It has two budgets, not one

- **Player money** — consumed exactly once, to pay the **$150b** creation cost (BN3 seed money
  is free but costs equity; see §9).
- **Corporation funds** — a completely separate pool. **Player money cannot be transferred into
  it.** The single exception is selling hashes, and **SF9.1 is held**, so this exception is
  active: `Sell for Corporation Funds` converts 100 hashes → $1e9 of corp funds. That makes the
  `hashes` manager a genuine funding channel into the corporation, not just a money faucet.

So the Director's `cash.corp` fraction is a **one-shot accumulator**, not an ongoing allowance.
After creation, the corp self-funds and the Director has no lever over its internal spending.
`corp` runs its own internal allocator (§7) that looks structurally like the Director but
operates on corp funds.

### 1.3 Money flows *back* to the player, by two paths

This is the only manager that is a net *source* for the rest of the system.

- **Dividends** — requires going public and setting a dividend rate.
  ```
  TotalDividends  = DividendRate * (Revenue - Expenses) * 10
  Dividend        = ( OwnedShares * (TotalDividends / TotalShares) ) ^ (1 - DividendTax)
  RetainedEarning = (1 - DividendRate) * (Revenue - Expenses) * 10
  DividendTax     = 1 - CorporationSoftcap + 0.15        // CorporationSoftcap = 1 in BN3
  ```
  `ShadyAccounting` (500e12) reduces `DividendTax` by 0.05; `GovernmentPartnership` (2e15) by 0.1.

- **Faction bribery** — unlocked when corporation **valuation ≥ 100e12**, at **1e9 per
  reputation point**.

The bribery path is the more important of the two for the overall run. Reputation is the
**perishable** bottleneck on augmentations (see the architecture doc's perishable/permanent
ledger). A running corporation converts money — which the corp produces in absurd quantities —
directly into the one resource that resets every install. **Once valuation crosses 100e12, the
`factions` manager should largely stop grinding reputation and start buying it.**

That single interaction is arguably worth more to the run than all the corp's dividend income.

*To verify against the installed version: faction bribery has been added and removed
historically. Confirm `ns.corporation.bribe()` exists before designing `factions` around it.*

### 1.4 It survives augmentation installs

The corporation is a **permanent** asset. `corp` must therefore be restartable at any round,
mid-cycle, with no memory of what it did before — see §1.5.

### 1.5 It is RAM-expensive enough to force script splitting

The manual states plainly: *"you don't have to do everything in one script. You can make smaller
scripts that do less and use fewer APIs to keep the RAM usage down, and use `run()` to chain
them together."*

**Design response:** split `corp` into

- a small, always-resident **cycle daemon** using a minimal API surface — tea/party, Smart
  Supply, Market-TA2 (§4–5)
- **one-shot action scripts** the daemon `run()`s and forgets — round setup, upgrade purchasing,
  product development, office reassignment

The daemon holds the RAM lease; action scripts borrow from a small reserve inside it.

---

## 2. The idempotency principle

`corp` will restart — crashes, reloads, aug installs. Every setup step must therefore be
expressed as a **target state**, with the action being a convergence step toward it.

The manual is explicit about this trap: *"Warehouse starts at level 1, so when I say 'Warehouse
level 6', it means upgrading warehouse 5 times."* And for boost materials: *"All boost
materials' numbers are the **total quantities of material units after buying**."*

> **Never write "buy N of X". Always write "ensure X is at level/quantity N."**

This is the same principle as the HWGW prep design — measure current state, compute the delta,
act on the delta. It makes restart-safety free rather than something bolted on.

---

## 3. Interface with the Director

### Reads from `/state/director.json`
- `cash.corp` fraction — used **only** while accumulating the $150b creation cost
- `ram` lease for the daemon
- `directives.haltPerishableSpending` — irrelevant to corp funds, but gates the $150b spend

### Writes `/state/corp.json`

```jsonc
{
  "lastRun": 1234567890,
  "exists": true,
  "round": 3,                       // investment rounds accepted so far
  "internalPhase": "R3_DEVELOP",
  "funds": 4.2e15,
  "profitPerSec": 1.1e19,
  "valuation": 8.4e14,
  "productCount": 2,
  "bribeAvailable": true,           // valuation >= 100e12  -> factions manager consumes this
  "bribeRatePerRep": 1e9,
  "isPublic": false,
  "dividendRate": 0,
  "dividendIncomePerSec": 0,
  "congestedWarehouses": [],
  "wants": [ { "what": "corp-seed", "cost": 150e9, "expectedGain": null,
               "paybackSec": null, "permanent": true } ],
  "blocked": null
}
```

`bribeAvailable` is the cross-manager signal that matters most. `factions` and `augs` both need
it.

---

## 4. The cycle daemon — state synchronisation

The daemon is the only always-resident piece. Its loop:

```
loop:
    state = readCorpState()                    // poll ~100ms
    if state != lastState:
        onStateEdge(lastState -> state)
        lastState = state
    sleep(POLL_MS)

onStateEdge(prev, next):
    if next == PURCHASE:   beforePurchase()    // smart supply buy  (§5.2)
    if prev == PURCHASE:   afterPurchase()     // record raw production (§5.2)
    if next == START:      onCycleStart()      // tea/party (§5.1), per-cycle allocator (§7)
    if next == SALE:       beforeSale()        // market-TA2 pricing (§5.3)
```

**Gotchas:**

- With bonus time a cycle is **1 second**, so all five edges occur inside 1s. The daemon must
  not do heavy work inline on an edge — queue it and `run()` an action script.
- Missing a PURCHASE edge means Smart Supply doesn't fire, which is the primary cause of
  warehouse congestion (§8).
- `setAutoJobAssignment` **only takes effect at the next cycle's START state**. Job changes are
  always one cycle delayed — budget for that in any office-reassignment logic.

*To verify: whether the API exposes current state, next state, or both, and its exact name.
The polling design depends on being able to detect edges reliably.*

---

## 5. The three always-on services

These run every cycle regardless of round. Build all three before any round logic.

### 5.1 Tea and party

Mandatory. Energy and morale feed `employeeProductionByJob`, which feeds RP, material quality,
product stats, raw production and `MaxSalesVolume` — i.e. everything.

- Energy/morale begin dropping once an office has **≥ 9 employees**. Minimum value **10**.
- **Tea: flat +2 energy, costs 500e3 per employee.**
- Party: `PartyMult = 1 + PartyCostPerEmployee / 10^7`, and morale also gains a flat
  `PartyCostPerEmployee / 10^6`.

Optimal party cost to restore morale from `a` to `b`, with `k = PerfMult`:

```
PartyCostPerEmployee = 500000 * ( sqrt((a*k - 10)^2 + 40*b) - a*k - 10 )
```

(The other root is always negative.)

**Policy:** buy tea / throw party whenever energy or morale drops below **99.5** (or **109.5**
once `Go-Juice` / `Sti.mu` are researched). Many small parties are cheaper than one big one, so
correcting every cycle is strictly better than letting it drift.

**Do not** use Interns (wastes employees) and **do not** buy `AutoBrew` / `AutoPartyManager`
(wastes RP). A tea/party script is trivial and strictly dominates both.

Trick worth exploiting: `PartyMult` is **independent of employee count**. Throw an enormous
party while an office has 1 employee, then hire the rest.

### 5.2 Custom Smart Supply

**Build this first. It is the highest-leverage single piece of the whole corp automation.**

The manual is soft on this — "it's fine to skip it and use the built-in." I disagree, and the
manual's own data is the argument:

| Round 1 strategy | Offer |
|---|---|
| With custom Smart Supply | **540–560b** (mean 551.164b) |
| Without (buy built-in for 25b) | 335–346b (mean 340.413b) |

That is a **62% larger round-1 offer**, and round 1 compounds through rounds 2, 3 and 4. The 25b
saved is not the point; the point is that 25b is an enormous fraction of round-1 funds.

**Logic — after PURCHASE state:**

```
getLimitedRawProduction(division, city):
    p = RawProduction(division, city)
    p = p * 10
    reqSpace = net warehouse space consumed per output unit
    if reqSpace > 0:
        maxUnits = freeSpace / reqSpace
        p = min(p, maxUnits)
    return p

afterPurchase():
    for each division, city:
        total = 0
        if division produces materials:  total += getLimitedRawProduction(...)
        if division produces products:
            for each FINISHED product:   total += getLimitedRawProduction(...)
        SmartSupplyData[`${division}|${city}`] = total
```

**Logic — before PURCHASE state:**

```
beforePurchase():
    for each division, city:
        if warehouseCongested(division, city):  alert and mitigate      // §8
        required[m] = SmartSupplyData[key] * inputCoefficient[m]        // per input material
        // align to the limiting material
        limiting = argmin over m of (required[m] producible output units)
        align all required[] to that smallest amount
        totalSize = Σ required[m] * size[m]
        if totalSize > freeSpace:  scale all required[] down by freeSpace/totalSize
        required[m] -= stored[m]                                        // deduct what we have
        buy required[m]
```

Steps 6 and 7 — the free-space clamp and the deduction of stored units — are the ones people
omit, and omitting them is the direct cause of congestion.

### 5.3 Custom Market-TA2

*"Implementing a custom Market-TA2 script is the best optimization in round 3+."*

The research path costs **70,000 RP** (`Market-TA.I` 20k + `Market-TA.II` 50k, on top of
`Hi-Tech R&D Laboratory` 5k). At the start of round 3 that is crippling. Reimplementing it costs
only two unlocks: **Market Research – Demand (5e9)** and **Market Data – Competition (5e9)**.

```
MaxSalesVolume       = PotentialSalesVolume * MarkupMultiplier
PotentialSalesVolume = ItemMultiplier * BusinessFactor * AdvertFactor
                       * MarketFactor * SaleBotsBonus * ResearchBonus

ItemMultiplier (material) = MaterialQuality + 0.001
ItemMultiplier (product)  = 0.5 * (ProductEffectiveRating)^0.65

BusinessProduction = 1 + office.employeeProductionByJob["Business"]
BusinessFactor     = (BusinessProduction)^0.26 + (BusinessProduction / 10000)

AwarenessFactor  = (Awareness + 1)^IndustryAdvertisingFactor
PopularityFactor = (Popularity + 1)^IndustryAdvertisingFactor
RatioFactor      = Awareness != 0 ? max(0.01, (Popularity + 0.001)/Awareness) : 0.01
AdvertFactor     = (AwarenessFactor * PopularityFactor * RatioFactor)^0.85

MarketFactor = max(0.1, Demand * (100 - Competition) / 100)
```

Markup multiplier is piecewise in selling price:

```
MarkupMultiplier =
  1e12                                         , SellingPrice <= 0
  MarketPrice / SellingPrice                    , 0 < SellingPrice <= MarketPrice
  1                                             , MarketPrice < SellingPrice <= MarketPrice + MarkupLimit
  (MarkupLimit / (SellingPrice - MarketPrice))^2, SellingPrice > MarketPrice + MarkupLimit
```

The optimal price, assuming we want to clear stored inventory
(`ExpectedSalesVolume = StoredUnits / 10`):

```
SellingPrice = MarkupLimit * sqrt(PotentialSalesVolume) / sqrt(ExpectedSalesVolume) + MarketPrice
```

`MarkupLimit`:
```
material: MarkupLimit = MaterialQuality / MaterialMarkup
product:  MarkupLimit = max(ProductEffectiveRating, 0.001) / ProductMarkup
```

`ProductMarkup` is **not exposed by the NS API**. Two ways to get it:

1. **Solve for it.** Product stats give 6 equations in 5 unknowns
   (`CreationJobFactors[job]`); solve with Ceres Solver. This is what the manual's sample code
   does.
2. **Measure it empirically** — cleaner, and my recommendation for v1:
   - set `SellingPrice` absurdly high so the penalty branch is guaranteed active
   - wait one cycle, read `product.actualSellAmount`
   - `MarkupLimit = (SellingPrice - MarketPrice) * sqrt(ActualSalesVolume / PotentialSalesVolume)`
   - derive `ProductMarkup` and **cache it — `ProductMarkup` never changes**

Option 2 costs one cycle of lost sales per product and needs no numerical library. Given a
product is developed every ~30–50 cycles, that is a rounding error, and it removes Ceres from
the critical path entirely. Only fall back to option 1 if the measurement proves noisy.

Also useful: **setting selling price to 0 gives `MarkupMultiplier = 1e12`** — the fastest way to
dump inventory, which is the congestion mitigation in §8.

---

## 6. Round-by-round playbook

Rounds 1 and 2 are **deterministic recipes with tested constants**. Encode them literally. Do
not optimize them, do not generalize them — the author validated these numbers over 200+ headless
runs and any optimizer you write will initially do worse.

Round 3+ is genuinely freestyle and is where the real automation lives (§7).

### Universal rules

- Always expand to **all 6 cities** and buy 6 warehouses. Division production multiplier sums
  `cityMult` across warehouses, so 6 cities ≈ **×36** effective production versus one.
- Never use **Bulk Purchase** — it requires paying upfront. Buy boost materials via the
  per-second rate and go into debt.
- Boost-material numbers are **totals after buying**. Rate to set = `(target - stored) / 10`,
  wait one PURCHASE state, **then set the rate back to 0** or it will buy forever until the
  warehouse fills.
- **Buy boost materials last**, at the end of a round, after all upgrades and expansions.
- Use `upgradeOfficeSize` via API — the UI cannot do granular sizes.

### Round 1 — Agriculture

```
Create Agriculture division; expand to 6 cities; buy 6 warehouses
upgradeOfficeSize 3 -> 4;  4 employees -> R&D;  wait until RP >= 55
Switch to Operations 1 / Engineer 1 / Business 1 / Management 1   (before buying boost)
```

**With custom Smart Supply** (target offer 540–560b):

| Upgrade | Target level |
|---|---|
| Smart Factories | 2 |
| Smart Storage | 8 |
| Warehouse | 5 |
| Advert | 2 |

Warehouse size 900. Boost totals: **AI Cores 1562, Hardware 1791, Real Estate 98470, Robots 0**.

**Without custom Smart Supply** (target offer 335–346b): Smart Storage 3, Warehouse 4, Advert 2;
warehouse size 520; boost **AI Cores 777, Hardware 919, Real Estate 60794, Robots 0**.

Skip everything else this round — no other industries, no other corp upgrades except Smart
Storage.

### Round 2 — add Chemical

**Requires at least 490b.** Following the custom-Smart-Supply round 1 puts you comfortably above
this. Target offer 14.145–14.871t.

**Phase 1:**

```
Buy "Export" (20e9)
Agriculture:  office 4 -> 8, ALL employees -> R&D;  Warehouse 17;  Advert 8
Chemical:     create; office stays at 3, 3 employees -> R&D;  Warehouse 2;  NO Advert
Export routes: Plants     Agriculture -> Chemical
               Chemicals  Chemical    -> Agriculture
Smart Storage 25   (Agriculture warehouse size 5950, Chemical 700)
Smart Factories 17
DO NOT buy Wilson this round
Wait for RP: Agriculture ~700, Chemical ~390
```

**Phase 2 (after RP targets hit):**

```
Agriculture:  Operations 3, Engineer 1, Business 2, Management 2
Chemical:     Operations 1, Engineer 1, Business 1
Boost totals:
  Agriculture: AI Cores 9081, Hardware 10146, Real Estate 459400, Robots 1416
  Chemical:    AI Cores 1717, Hardware 3194, Real Estate 54917,   Robots 54
```

Chemical is a **support division** — never spend on its Office or Advert. But do not skip its
warehouse upgrade entirely; it must produce enough high-quality Chemicals or Agriculture's output
quality collapses through PURCHASE-state dilution.

The optimal export string is **`(IPROD+IINV/10)*(-1)`**.

### Round 3+ — add Tobacco

Create the Tobacco division in round 3 and export Plants from Agriculture to it.

**Export routes are FIFO — register Tobacco before Chemical** so the product division gets first
claim on Plants.

Why Agriculture + Chemical + Tobacco: Agriculture has by far the highest `realEstateFactor`
(**0.72**) and Real Estate has a tiny size (**0.005**), so the production multiplier can be
pushed extremely high cheaply. Chemical has the highest material-industry `ScienceFactor`
(**0.75**). Tobacco needs only Plants, has `ScienceFactor` **0.75** and `AdvertisingFactor`
**0.2**.

**Milestones to check against:**

| Milestone | Target |
|---|---|
| Round 3 offer | 1e16+ |
| Round 4 offer | 1e20+ |
| Profit after 4th/5th product | 1e20/s |
| Profit after 7th/8th product | 1e90/s |
| Cycles to 1e90/s | ~400 (≈1h 6m real time) |

**Product count before accepting offers:** `1P/2P` — develop 1 product, accept round 3's offer,
develop 1 more, accept round 4's offer. Optimal **only if** all four hold:

- started round 3 with 11t+
- have a custom Market-TA2 script
- funds split properly between divisions/upgrades
- offices set up properly

Otherwise use `1P/3P` or `2P/4P`. **Encode this as a conditional on those four predicates, not
as a constant.**

---

## 7. The round 3+ allocator

This is the heart of the automation and it is structurally the same shape as the Director: a
per-cycle fractional budget split. Reuse the pattern.

**Per cycle, in order:**

1. Buy **Wilson Analytics** if affordable from last cycle's profit.
2. Buy **Advert**.
3. Split remaining funds by the ratio table.
4. Develop a new product if a slot is free.
5. Buy research per §7.3.
6. Reassign offices if the setup should change (§7.4).
7. Check whether to accept an offer (§9).

### 7.1 Wilson and Advert

Wilson multiplies Advert's benefit **at the moment Advert is bought — it is not retroactive**, so
buy it early. But Wilson's `priceMult` is **2** versus Advert's **1.06**, which is why it is a
trap in rounds 1 and 2 (the manual's optimizer tables show plain Advert 8 beating any
Wilson combination under a 10e9 budget).

Define `thresholdOfFocusingOnAdvert` ≈ **profit 1e18–1e19/s**.

- **Before threshold:** Wilson+Advert is just one line item in the split below; run the optimizer
  over combinations if you have one.
- **After threshold:** buy Wilson if affordable, then spend **at least 20%** of current funds on
  Advert — the manual's author uses **up to 60%**.
- **Stop entirely** once awareness/popularity hit max (~1.798e308).

### 7.2 Fund split

After Wilson/Advert, **≥90% of funds go to the product division and corp upgrades**.

At the *start* of round 3, give support divisions a small fixed sum: the manual says 500b/100b
for Agriculture/Chemical is plenty; the author uses only **150b/30b**.

| Bucket | Before threshold | After threshold |
|---|---|---|
| `rawProduction` (SmartFactories, SmartStorage, warehouses) | 1/23 | 1/19 |
| `wilsonAdvert` | 4/23 | 0 |
| `office` (main + support) | 8/23 | 8/19 |
| `employeeStatUpgrades` | 8/23 | 8/19 |
| `salesBot` | 1/23 | 1/19 |
| `projectInsight` | 1/23 | 1/19 |

Sub-splits:
- Support division: **warehouse 10 / offices 90**
- Main office vs support offices: **75/25 in round 3**, **50/50 in round 4+**

### 7.3 Research

- **Buy no research in round 3** — RP gain rate is too low *organically*. But **SF9.1 is held**,
  and `Exchange for Corporation Research` injects 200 hashes → **1000 RP into every division**.
  That is a direct bypass of the round-3 RP bottleneck the manual treats as unavoidable, and it
  may make `Hi-Tech R&D Laboratory` (5,000 RP) reachable a full round early. Worth measuring —
  the hash cost escalates linearly (200, 400, 600, …), so 5,000 RP is 5 purchases totalling
  3,000 hashes. Flagged as an opportunity, not yet a plan.
- **`Hi-Tech R&D Laboratory` (5,000 RP) as soon as possible in round 4.** It is the prerequisite
  for everything else and cost-effective enough to spend the whole pool on.
- After that, priority order: **`Overclock` → `Sti.mu` → `Automatic Drug Administration` →
  `Go-Juice` → `CPH4 Injections`** — energy/morale and employee stats before production.
- **Never deplete the RP pool.** Spend rules: energy/morale and stat research if it costs
  **< 20% of pool**; production research if **< 10% of pool**.
- **Never buy:** `uPgrade: Dashboard`, `AutoBrew`, `AutoPartyManager`, `HRBuddy-Recruitment`,
  `HRBuddy-Training`. Usually skip `uPgrade: Capacity.I/II` too.
- **Do not deplete RP right before a product completes** — RP feeds `ScienceMult` in the product
  rating formula.
- With SF9, hashes can be exchanged for RP, and it is **added to all divisions**. This is the
  `hashes` manager's permanent-spend path (see the architecture doc §3).

### 7.4 Office setup

Job ratios, quoted directly. These are *starting points* — the manual warns not to use them
blindly.

**Support divisions (round 3+):** R&D / non-R&D = **20 / 80**. `EngineerProduction` matters far
more than RP once funds are large. Non-R&D split:

| Job | Ratio |
|---|---|
| Operations | 0.22 |
| Engineer | 0.632 |
| Business | 0 |
| Management | 0.148 |

Business is useless in a support division — assign nobody.

**Product division main office:**

| Setup | Operations | Engineer | Business | Management |
|---|---|---|---|---|
| Round 3 ("progress") | 0.037 | 0.513 | 0.011 | 0.44 |
| Round 4 ("progress") | 0.03 | 0.531 | 0.003 | 0.436 |
| After round 4, profit < 1e30/s ("profit-progress") | 0.032 | 0.462 | 0.067 | 0.439 |
| After round 4, profit ≥ 1e30/s | 0.064 | 0.317 | 0.298 | 0.321 |
| **Round 3 "profit"** (right before accepting offer) | 49/138 | 5/138 | 51/138 | 33/138 |
| **Round 4 "profit"** (right before accepting offer) | 68/369 | 12/369 | 244/369 | 45/369 |

**Switching the main office to the "profit" setup immediately before accepting an offer is a
discrete, high-value action** — the offer is driven by `AssetDelta`, which is essentially profit.
Do it, let a few cycles run so the profit registers, then accept.

**Product division support offices:**

- Round 3, before first product completes: **all employees to R&D**
- Round 3 after first product, and round 4: **1 each to Operations/Engineer/Business/Management,
  remainder to R&D**
- After round 4: **50% R&D**, remainder on the round-4 "profit" ratio

**Implementation gotcha:** `setAutoJobAssignment` moves employees from Unassigned and **throws**
if there are not enough. The safe sequence is always:

```
1. set every job to 0
2. set every job to its target
```

### 7.5 Boost materials

The optimal quantities under a storage constraint `S` have a **closed form** — no solver needed:

```
x*s1 = ( S - 500 * ( (s1/c1)*(c2+c3+c4) - (s2+s3+s4) ) ) / ( (c1+c2+c3+c4)/c1 )
```

and analogously for `y*s2`, `z*s3`, `w*s4`, where `c_i` are the industry's boost-material
coefficients and `s_i` the material sizes.

If any result is **negative** (small `S`), **drop that material and re-solve** — implement
recursively.

Benchmark from the manual, 200 runs: closed form **0.3–0.5 ms**, Ceres **380–400 ms**, ALGLIB
**32–34 s**. **Use the closed form.** This is the one optimizer that is both trivial and
mandatory.

---

## 8. Self-healing: warehouse congestion

The corp equivalent of the HWGW resync, and the most common failure mode.

**Cause:** input-material purchase logic that ignores free space and already-stored units fills
the warehouse, leaving no room for output. Production halts completely.

**Detection heuristic:**

```
each cycle, per (division, city):
    if output material/product productionAmount == 0:  congestion[key]++
    else:                                              congestion[key] = 0
    if congestion[key] > 5:  treat as congested
```

Five cycles of tolerance to suppress false positives — note that `productionAmount` is
legitimately 0 for the first cycles after the script starts, since nothing was driving production
before.

**Mitigation:** discard the excess input materials by setting their selling price to **0**
(`MarkupMultiplier = 1e12` clears everything). Crude and wasteful, but it restarts the line
immediately, and a stalled division earns nothing at all.

**Quality health check**, worth running alongside: output quality starts at
`sqrt(MaxOutputQuality)` and rises with `AvgInputQuality` until it caps.

```
if AvgInputQuality^2 >= currentOutputQuality:  fine
else:                                          support division needs improvement
```

---

## 9. Irreversible actions

These cannot be undone and are where full automation carries real risk. Each needs an explicit
predicate, loud logging, and — until proven — a dry-run mode.

| Action | Irreversible because | Gate |
|---|---|---|
| **Create corporation** | $150b, or permanent equity loss with seed money | BN3 → seed money (free, costs 500e6 investor shares of 1.5e9 total, leaving 66.7%). Outside BN3, self-fund $150b. |
| **Accept investment offer** | Shares gone forever; cannot be bought back | Product-count target met (§6) **and** main office switched to "profit" setup **and** profit has registered for several cycles |
| **Go public** | Cannot go private again; valuation formula worsens (85000 vs 315000 multiplier on `AssetDelta`) | Only after **round 4** — there are no further investment rounds to protect |
| **Set dividend rate** | Reduces `AssetDelta`, hence valuation, hence bribery headroom | 0 until after round 4; then ramp |
| **Issue new shares** | Dilution | Probably never in v1 |

`Offer = CorporationValuation * FundingRoundShares * FundingRoundMultiplier`, with
`FundingRoundShares = [0.1, 0.35, 0.25, 0.2]` and `FundingRoundMultiplier = [3, 2, 2, 1.5]`.

Pre-IPO valuation:
```
AssetDelta = (TotalAssets - PreviousTotalAssets) / 10
Valuation  = (1e10 + Funds/3 + AssetDelta * 315000) * ((1.1)^(1/12))^NumberOfOfficesAndWarehouses
```

Two consequences the automation should exploit:

- **`AssetDelta * 315000` dominates.** Maximising profit right before accepting is the single
  biggest lever on the offer.
- **`NumberOfOfficesAndWarehouses` is an exponent.** Hence **dummy divisions**: create a
  **Restaurant** division (starting cost only 10e9), expand to 6 cities, buy 6 warehouses, and
  invest in nothing else. Pure valuation inflation. Do this in round 3+ once funds allow. (Avoid
  Spring Water despite the same 10e9 cost — the manual flags it as a newbie trap.)

**Recommendation:** ship the manager with an `advisory` mode that logs every irreversible action
it *would* take, with the predicate values that triggered it. Run a full round 1→4 in advisory
mode, read the log, then enable `auto`. Given a botched corp costs $150b (or $50b if self-funded
and you sell the CEO position) this is cheap insurance.

---

## 10. Reference: key formulas

**Division production multiplier** (why 6 cities):
```
cityMult = (0.002*RealEstate + 1)^realEstateFactor * (0.002*Hardware + 1)^hardwareFactor
         * (0.002*Robots + 1)^robotFactor * (0.002*AICores + 1)^aiCoreFactor
productionMult = Σ over warehouses of cityMult^0.73     (floored at 1)
```

**Division raw production:**
```
TotalEmployeesProd = OperationsProd + EngineerProd + ManagementProd
ManagementFactor   = 1 + ManagementProd / (1.2 * TotalEmployeesProd)
EmployeeProdMult   = ((OperationsProd)^0.4 + (EngineerProd)^0.3) * ManagementFactor
OfficeMultiplier   = 0.05 * EmployeeProdMult             // material output
                   = 0.5 * 0.05 * EmployeeProdMult       // product output
RawProduction      = OfficeMultiplier * DivisionProductionMult * UpgradeMult * ResearchMult
```

**Material quality:**
```
MaxOutputQuality = EngineerProduction/90 + RP^IndustryScienceFactor
                   + (AICoresQuantity^IndustryAICoreFactor)/1000
OutputQuality    = sqrt(MaxOutputQuality) * AvgInputQuality
```
`AvgInputQuality` is the **plain mean** of input material qualities — input coefficients do not
affect it. **Purchased material always has quality 1**, which is why PURCHASE-state dilution
matters.

**Product development:**
```
ProductDevelopmentMultiplier = ((EngineerProd)^0.34 + (OperationsProd)^0.2) * ManagementFactor
Progress                     = 0.01 * ProductDevelopmentMultiplier
// finished when DevelopmentProgress >= 100
ScienceMult = 1 + RP^ResearchFactor / 800
```

**Upgrade costs:**
```
normal:     cost(a -> b) = BasePrice * (PriceMult^b - PriceMult^a) / (PriceMult - 1)
warehouse:  cost(a -> b) = BasePrice * (1.07^(b+1) - 1.07^(a+1)) / 0.07      // note exponent +1
office:     cost(a -> b) = BasePrice * (1.09^(b/3) - 1.09^(a/3)) / 0.09
WarehouseSize = WarehouseLevel * 100 * UpgradeMult * ResearchMult
```

**RP gain**, per city per state, in **4 states** (PURCHASE, PRODUCTION, EXPORT, SALE):
```
RPGain = 0.004 * (RnDProduction)^0.5 * UpgradeMult * ResearchMult
```
Industry `ScienceFactor` does **not** affect RP gain rate.

**Unlock costs:** Export 20e9, Smart Supply 25e9, Market Research–Demand 5e9, Market
Data–Competition 5e9, VeChain 10e9 (useless), Shady Accounting 500e12, Government Partnership
2e15.

**Design/marketing investment** exponents are **0.1** — spend **1% of current funds** and stop
thinking about it.

---

## 11. Build order

| # | Piece | Why here |
|---|---|---|
| 1 | Cycle daemon + state-edge detection | everything else hangs off it |
| 2 | Tea/party service | mandatory, trivial, immediate benefit |
| 3 | **Custom Smart Supply** | 62% larger round-1 offer; compounds through every later round |
| 4 | Congestion detector + dump mitigation | Smart Supply's safety net |
| 5 | Boost-material closed-form optimizer | 20 lines, 0.5ms, mandatory |
| 6 | Round 1 recipe (idempotent, target-state form) | first real money |
| 7 | Round 2 recipe | |
| 8 | Custom Market-TA2 | saves 70k RP at the worst possible moment |
| 9 | Round 3+ allocator + product loop | the actual engine |
| 10 | Dummy divisions | cheap valuation multiplier |
| 11 | Offer/IPO/dividend policy | irreversible — last, and in advisory mode first |
| 12 | Office / storage-factory / Wilson-Advert optimizers | pure upside over the hardcoded ratios |

Steps 1–7 are enough to reach the round-2 offer of ~14.5t. Steps 8–11 are what carry it to 1e90/s.

---

## 12. Open questions

- **Should `corp` move earlier in the global build order?** The architecture doc puts it at step
  11 on the reasoning that $150b is post-gang money. But BN3 gives **free seed money**, so in BN3
  specifically the corp costs nothing but time — and finishing BN3.3 is the current objective. In
  BN3 the corp should probably run *concurrently with* the hacking bootstrap, not after it.
  This likely warrants a BN-conditional branch in the Director's phase machine.
- **Faction bribery**: confirm it exists in the installed version, then decide how much of the
  `factions` manager's rep-grinding design it obsoletes. If bribery is live, `factions` becomes a
  much smaller manager.
- **Corp API RAM cost** — measure per function, then decide the daemon/action-script split
  concretely.
- **Corp state detection API** — exact name and whether it reports current or next state.
- **Dividend rate policy after round 4.** Retained earnings compound into more profit; dividends
  buy augs now. Given profit growth is exponential and augs are the actual goal, a low rate early
  and a high rate once profit saturates seems right, but this deserves working through.
- **How does `corp` behave during an augmentation install?** The corporation persists but the
  scripts die. The daemon must restart cleanly mid-round — hence §2.
- The manual's sections 20 (Advanced strategies) and 21 (Strategies for other BitNodes) are
  marked **WIP** and contain nothing. Revisit if the author updates them.

---

## Source

*Corporation manual*, last updated 2026-07-03 (uploaded to this project by Scott). Author's
sample TypeScript is at `https://github.com/catloversg/bitburner-scripts`. All numbers and
formulas in this document are quoted from that manual; the author states rounds 1 and 2 were
validated over 200+ headless runs.
