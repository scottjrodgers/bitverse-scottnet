# BitNode Planning

Verified against `bitburner-official/bitburner-src`. Primary file `src/BitNode/BitNode.tsx`
(`getBitNodeMultipliers`), plus `src/Corporation/Corporation.ts`,
`src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx`, `src/Prestige.ts`.

**Why this doc exists:** which managers are worth building, and in what order, is **not constant
across BitNodes**. A plan tuned for BN3 is actively wrong in BN9. Check this table before
re-sequencing work.

---

## 1. The current situation

- **SF3.3 achieved** — `WarehouseAPI` and `OfficeAPI` are now free in every BitNode. The original
  objective is complete.
- **Currently in BN9**, working toward SF9.2 (128 GB home RAM on every future BitNode entry).
- **Target: BN10**, for Duplicate Sleeves.
- No corporation exists.

---

## 2. BN9 — "Hacktocracy" — a hostile environment for most of this plan

| Multiplier | Value | Consequence |
|---|---|---|
| `ServerMaxMoney` | **0.01** | servers hold 1% of normal money |
| `ScriptHackMoney` | **0.1** | …and you take 10% of that |
| `HackExpGain` | **0.05** | hacking levels crawl |
| `CloudServerLimit` (`PurchasedServerLimit`) | **0** | **purchased servers cannot be bought at all** |
| `HomeComputerRamCost` | **5** | home RAM is 5× price |
| `CorporationValuation` | 0.5 | offers halved |
| `CorporationSoftcap` | 0.75 | dividend exponent **0.60** |
| `CorporationDivisions` | 0.8 | |
| `BladeburnerRank` / `SkillCost` | 0.9 / 1.2 | Bladeburner barely touched |

Combined, hacking income is roughly **0.1%** of a normal node. HWGW is not merely weak here, it
is unmeasurable — you cannot validate an income model against noise.

**On entry BN9 grants a free, heavily upgraded Hacknet Server** (level 100, 10 cores, cache 5),
per `src/Prestige.ts` — granted on BitNode entry, not on install. Hashes are the economy here.

### What this means for the build order

The architecture doc ranks `hacknet` 9th, on the argument that it is 100% perishable and
slow-ramping. **That reasoning is correct in a normal node and wrong in BN9**, where hacknet is
not the slowest-compounding asset but the only one. `Sell for Money` is a flat 4 hashes → $1e6
($250k/hash) and never escalates, so it is also the only realistic route to the **$150b** a
corporation costs outside BN3.

| Build here in BN9 | Do **not** build against BN9 |
|---|---|
| Phase 0 scaffolding (BitNode-agnostic) | HWGW / `targeting` — income is noise |
| Corp math library and Phases 2–5 | `infra`'s pserv logic — the limit is literally 0 |
| `hacknet` + `hashes` — the economy | anything keyed to hacking level-ups — XP is at 5% |

Corp **mechanics** are identical in BN9; only valuation and dividends are scaled. That makes BN9
a good place to *debug* the corp automation and a bad place to *depend* on it.

---

## 3. BN10 — "Digital Carbon" — the real target

| Multiplier | Value | Consequence |
|---|---|---|
| `ServerMaxMoney`, `ServerGrowthRate` | **1.0** | servers untouched — unusually generous |
| `ScriptHackMoney` | 0.5 | hacking is genuinely viable here |
| `AugmentationMoneyCost` | **5** | the squeeze |
| `AugmentationRepCost` | **2** | |
| `CorporationValuation` | 0.5 | |
| `CorporationSoftcap` | 0.9 | dividend exponent **0.75** |
| `HomeComputerRamCost` | 1.5 | |
| `CloudServerCost` / `Limit` / `MaxRam` | 5 / 0.6 / 0.5 | pservs viable but expensive |
| `HacknetNodeMoney` | 0.5 | |

Two consequences that reshape manager priorities:

1. **HWGW is worth building — for BN10, not BN9.** Servers are at full money and growth; only the
   hack take is halved.
2. **The augmentation squeeze makes `augs` and `factions` far more valuable.** Money cost ×5 and
   rep cost ×2 means the descending-money-cost purchase order matters five times more, and
   corporate **bribery** (money → rep at 1e9/rep) is worth roughly double what it is elsewhere.

### The sleeve math — and why it forces the sequencing

`SleeveCovenantPurchases.tsx`: `MaxSleevesFromCovenant = 5`, `BaseCostPerSleeve = 10e12`,
cost of the *n*-th purchase = `10^n × $10e12`.

| Purchase | Cost |
|---|---|
| 1st | $10 trillion |
| 2nd | $100 trillion |
| 3rd | $1 quadrillion |
| 4th | $10 quadrillion |
| 5th | $100 quadrillion |
| **Total** | **$111.1 quadrillion** (1.111e17) |

Max sleeves anywhere = **3** (SF10.3) **+ 5** (Covenant) = **8**.

**The binding constraint:** purchases require being *in BN10* and a member of **The Covenant**,
and money does not survive a BitNode change. **Every dollar for those sleeves must be earned
inside BN10.** You cannot bank it here.

That is the whole argument for the sequencing below: the corporation that buys the sleeves is a
**BN10 corporation**, and it needs to work on first contact.

---

## 4. `CorporationSoftcap` is an exponent, not a percentage

`src/Corporation/Corporation.ts`:

```
tributeModifier = 1 - CorporationSoftcap + 0.15
payout          = dividends ^ (1 - tributeModifier)
                = dividends ^ (CorporationSoftcap - 0.15)
```

So BN9 pays `d^0.60` and BN10 pays `d^0.75`. At `d = 1e30/s` that is `1e18` versus `1e22.5` —
**four and a half orders of magnitude**, from a multiplier that looks like a 15% difference.

Two unlocks add the exponent back: **`ShadyAccounting`** (500e12) `+0.05` and
**`GovernmentPartnership`** (2e15) `+0.10`. In BN10 both together take the exponent to **0.90**.
Given the sleeve target, buying both is close to mandatory.

The creation gate `canCreateCorporation` refuses when `CorporationSoftcap < 0.15` — only BN8.

### Corporation viability by BitNode

| BN | Valuation | Softcap | Dividend exp. |
|---|---|---|---|
| **3** Corporatocracy | 1.00 | 1.00 | 0.85 — *and the only node with seed money* |
| 1 / 4 | 1.00 | 1.00 | 0.85 |
| 5 | 0.75 | 1.00 | 0.85 |
| 2 | 1.00 | 0.90 | 0.75 |
| **10** Digital Carbon | 0.50 | 0.90 | 0.75 |
| 11 / 14 | 0.10 / 0.40 | 0.90 | 0.75 |
| **9** Hacktocracy | 0.50 | 0.75 | 0.60 |
| 6 / 7 | 0.20 | 0.90 | 0.75 |
| 12 | decays `1/1.02^lvl` | 0.80 | 0.65 |
| 13 / 15 | 0.001 / 0.20 | 0.40 | 0.25 |
| 8 | 0.00 | 0.00 | **corp disabled** |

---

## 5. Recommended sequencing

1. **Build the corp automation here in BN9.** Mechanics are identical; only the payoff is scaled.
   Low stakes, and a botched round 1 costs a node you are leaving anyway.
2. **Promote `hacknet` + `hashes` to immediately after Phase 1.** In BN9 they are the economy and
   the only realistic route to the $150b a corporation costs.
3. **Defer HWGW, `targeting`, and `infra`'s pserv logic.** Untestable here. Build them for BN10,
   where servers are at full money.
4. **Finish BN9 via Bladeburner**, not hacking — `BladeburnerRank` is only 0.9 here while hacking
   is at 0.1% income and 5% XP. The existing gang and Bladeburner scripts already did this in BN3.
   Collect **SF9.2** (128 GB home RAM on entry) on the way out.
5. **Enter BN10 with debugged corp automation**, build the corporation immediately, buy
   `ShadyAccounting` and `GovernmentPartnership`, join The Covenant, and grind toward $111
   quadrillion for the full sleeve set.

The through-line: **BN9 is the rehearsal, BN10 is the performance.**

---

## 6. Open

- How long does $150b of hashes actually take in BN9 from the granted server? Measure before
  committing to building a corporation here rather than after entering BN10.
- Does hash → corp funds (`Sell for Corporation Funds`, 100 hashes → $1e9) meaningfully
  accelerate the early rounds? SF9.1 is held, so this is available.
- Confirm the sleeve-purchase gate requires Covenant membership *and* BN10 presence at the moment
  of purchase.
