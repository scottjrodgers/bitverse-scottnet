# Reference: Game Mechanics

**Status:** reference, not normative. Nothing here is a decision. Everything here is a fact
about Bitburner that the design depends on, with its source.

**Companion reference:** `hwgw-batching-design.md` (hacking pipeline math),
`managers/corp.md` (corporation formulas). Those are deep enough to stand alone; this document
cross-references rather than duplicating them.

**Sourcing discipline.** Every claim is either verified against
`bitburner-official/bitburner-src` at `dev` (commit `79e5cd87`, 2026-08-13, v3.0.2-dev) with
the file cited, or measured in-game and marked as such. Anything unverified is marked
*(unverified)* and should be treated as a guess. `dev` may run slightly ahead of the installed
release; constants that are periodically rebalanced are flagged.

**Contents**

1. The augmentation install reset ledger
2. BitNode multipliers
3. Augmentations
4. Factions
5. Gangs
6. Hacknet and hashes
7. Infrastructure — Tor, programs, servers
8. Hacking — worker costs and the yield metric
9. Corporations — API surface and RAM
10. Sleeves
11. Known API drift

---

## 1. The augmentation install reset ledger

This is the single most load-bearing table in the project. Nearly every prioritisation decision
reduces to which side of it a thing falls on.

Verified against `src/Prestige.ts`,
`src/PersonObjects/Player/PlayerObjectGeneralMethods.ts`, `src/Server/ServerHelpers.ts`.

### Lost on install

- **Money** — resets to `1000 + CONSTANTS.Donations`, currently **$1,262**, plus any aug
  `startingMoney`. BN8 overrides to $250,000,000.
  *`CONSTANTS.Donations` is bumped periodically and will differ between versions.*
- **Purchased servers** — all of them, and everything on them
- **Hacknet nodes and servers**, **unspent hashes**, and **all hash-upgrade levels**
- **Tor router** — re-bought at **$200,000** every cycle
- **All darkweb programs** — see §7 for what survives
- **Faction reputation** — converted to favor, then zeroed
- **Faction membership**, jobs, all stats and experience
- **Everything on non-home servers** — servers are deleted and rebuilt

### Kept on install

- **Home RAM and home cores** — reset only on BitNode change
- **All installed augmentations**, including NeuroFlux level
- **Karma** — reset only on BitNode change
- **Favor** (faction and company) — grown from the reputation just lost
- **Gang** — members and stats persist; ascension points take a ×0.95 penalty
- **Corporation** — persists entirely
- **Bladeburner** — rank, skill points and skills persist
- **Sleeves** — count persists
- **All scripts and text files on home**

### The derived rule

> Buy a perishable thing only if its payback time is shorter than the time remaining in this
> reset cycle. Buy permanent things whenever affordable.

`specs/strategy.md` §6.5 implements this as the **horizon gate**. The same distinction, applied
to *information* rather than assets, produces the `/state/` vs `/memory/` split in
`specs/strategy.md` §8.2.

---

## 2. BitNode multipliers

Source `src/BitNode/BitNode.tsx` (`getBitNodeMultipliers`). **SF5.1 is held**, so
`ns.getBitNodeMultipliers()` reads these directly at runtime — prefer the API over this table,
which exists for planning and for nodes where SF5 is unavailable.

### BN9 — "Hacktocracy"

| Multiplier | Value | Consequence |
|---|---|---|
| `ServerMaxMoney` | 0.01 | servers hold 1% of normal money |
| `ScriptHackMoney` | 0.1 | …and you take 10% of that |
| `HackExpGain` | 0.05 | hacking levels crawl |
| `CloudServerLimit` | **0** | purchased servers cannot be bought at all |
| `HomeComputerRamCost` | 5 | home RAM is 5× price |
| `CorporationValuation` | 0.5 | offers halved |
| `CorporationSoftcap` | 0.75 | dividend exponent 0.60 |
| `CorporationDivisions` | 0.8 | |
| `BladeburnerRank` / `SkillCost` | 0.9 / 1.2 | Bladeburner barely penalised |

Combined, hacking income is roughly **0.1%** of a normal node.

**On BitNode entry** BN9 grants a free, heavily upgraded Hacknet Server (level 100, 10 cores,
cache 5) — per `src/Prestige.ts`, granted on *node entry*, not on install.

### BN10 — "Digital Carbon"

| Multiplier | Value | Consequence |
|---|---|---|
| `ServerMaxMoney`, `ServerGrowthRate` | 1.0 | servers untouched |
| `ScriptHackMoney` | 0.5 | hacking genuinely viable |
| `AugmentationMoneyCost` | **5** | the squeeze |
| `AugmentationRepCost` | **2** | |
| `CorporationValuation` | 0.5 | |
| `CorporationSoftcap` | 0.9 | dividend exponent 0.75 |
| `HomeComputerRamCost` | 1.5 | |
| `CloudServerCost` / `Limit` / `MaxRam` | 5 / 0.6 / 0.5 | pservs viable but expensive |
| `HacknetNodeMoney` | 0.5 | |

### `CorporationSoftcap` is an exponent, not a percentage

`src/Corporation/Corporation.ts`:

```
tributeModifier = 1 - CorporationSoftcap + 0.15
payout          = dividends ^ (1 - tributeModifier)
                = dividends ^ (CorporationSoftcap - 0.15)
```

BN9 pays `d^0.60`; BN10 pays `d^0.75`. At `d = 1e30/s` that is `1e18` versus `1e22.5` — four and
a half orders of magnitude from a multiplier that looks like a 15% difference.

Two unlocks add the exponent back: **`ShadyAccounting`** (500e12) `+0.05` and
**`GovernmentPartnership`** (2e15) `+0.10`.

`canCreateCorporation` refuses when `CorporationSoftcap < 0.15` — only BN8.

### Corporation viability by BitNode

| BN | Valuation | Softcap | Dividend exp. |
|---|---|---|---|
| **3** Corporatocracy | 1.00 | 1.00 | 0.85 — *the only node with seed money* |
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

## 3. Augmentations

Source `src/Augmentation/AugmentationHelpers.ts`, `src/Constants.ts`.

- **Each queued augmentation multiplies the money cost of subsequent purchases by 1.9×** — not
  2×, despite the in-game text saying "doubles". Precisely
  `getBaseAugmentationPriceMultiplier() ^ (count of queued non-SoA augs)`, base
  `CONSTANTS.MultipleAugMultiplier = 1.9`, scaled by `[1, 0.96, 0.94, 0.93][SF11 level]`.
- **Reputation costs are NOT affected by that multiplier.** Rep is a per-faction gate checked
  independently.
- **Therefore buy in descending money-cost order.** Minimising `Σ base_i · 1.9^(i−1)` means
  putting the largest base price at the smallest exponent.

### NeuroFlux Governor

- Base **500 rep / $750,000**, scaling `1.14 ^ level` on **both**, where
  `level = ownedNFGLevel + count queued this reset`.
- The generic 1.9× multiplier applies to NFG's **money cost but not its rep cost**.
- Offered by essentially every faction except Shadows of Anarchy, Bladeburners, and Church of
  the Machine God.
- NFG level **persists across installs**, resets on BitNode change — except SF12, which
  re-grants NFG at `activeSourceFileLvl(12)` levels.

### Program-granting augs

These reduce the per-cycle bootstrap tax (§7):

| Aug | Grants | Source faction |
|---|---|---|
| CashRoot Starter Kit | BruteSSH.exe + $1,000,000 | Sector-12 (12.5k rep / $125m) |
| Neurolink | FTPCrack.exe + relaySMTP.exe | BitRunners |
| PCMatrix | DeepscanV1.exe + AutoLink.exe | Aevum |

---

## 4. Factions

- **Reputation is converted to favor on install, then zeroed.** Favor is permanent. Reputation
  is therefore a perishable resource that must be spent within the cycle it is earned.
- **Faction membership is reset on install** (`this.factions = []`), except factions flagged
  `keepOnInstall`, which retain the invitation.
- **NiteSec** and **The Black Hand** — the two hacking-gang factions — require only a backdoor
  on `avmnite-02h` and `I.I.I.I` respectively. No karma, no combat stats, no money.

### Combat gang faction requirements

| Faction | Requirements |
|---|---|
| Slum Snakes | combat 30, $1e6, karma −9 |
| Tetrads | combat 75, karma −18, in Chongqing / New Tokyo / Ishima |
| The Syndicate | hack 200, combat 200, $10e6, karma −90 |
| The Dark Army | hack 300, combat 300, 5 kills, karma −45, in Chongqing |
| Speakers for the Dead | hack 100, combat 300, 30 kills, karma −45 |

### Reputation producers

Four mechanisms produce faction reputation, each priced in a different resource. In
`specs/strategy.md` terms these are four candidates advertising production of the same path,
and the allocator picks whichever is cheapest in the currently-scarce resource.

| Producer | Costs | Gate |
|---|---|---|
| Faction work | a body | membership |
| `ns.share()` | RAM | membership |
| Donations | money | favor ≥ threshold *(believed 150 — unverified)* |
| Corporate bribery | money, **1e9 per rep point** | corp valuation ≥ 100e12 |

Bribery is **confirmed present** in the installed version. It does not obsolete the other three;
it is one more producer that wins when it wins.

*Unverified: the exact favor threshold that unlocks donations, and the rep-per-dollar donation
rate. `ns.share()`'s power formula and thread scaling are also unverified and are needed before
the RAM split between hacking and share can be reasoned about numerically.*

### City factions are mutually exclusive

Sector-12, Aevum, Chongqing, New Tokyo, Ishima, Volhaven. Some joins are irreversible. A wrong
automatic join can lock an augmentation out for the remainder of the node — this is the highest-
risk automatic action in the system and belongs behind a `forbid` constraint by default.

---

## 5. Gangs

Source `src/PersonObjects/Player/PlayerObjectGangMethods.ts`, `src/Gang/data/Constants.ts`,
`src/Gang/data/tasks.ts`, `src/Gang/GangMember.ts`.

- **Creation requires SF2 (any level) + karma ≤ −54,000.** BN2 waives the karma requirement
  entirely.
- **Karma is not reset by installing augs** — only by leaving the BitNode. It is therefore one
  of very few things worth accumulating across a whole node.
- **Augment availability is identical between gang types.** Every gang faction offers
  essentially the whole augmentation list, filtered by a seeded RNG. NiteSec vs. Slum Snakes
  does not change what can be bought.
- **Hacking gangs are NiteSec and The Black Hand**; the other five are combat.
- **Combat gangs get territory multipliers.** Human Trafficking carries
  `{money ×1.5, respect ×1.5}`; Terrorism carries `{respect ×2}`. The best hacking money task
  (Money Laundering) has the same base money (360) at *lower* difficulty (25 vs 36) but **no
  territory multiplier at all**.
- Gang power for warfare uses all six stats equally, so hacking gangs are not structurally
  disadvantaged at warfare — they simply gain less from winning it.

**Consequence, not a source claim:** the hacking gangs' easier entry (a backdoor, no karma) is
moot outside BN2, because grinding to −54,000 karma means committing homicide, which produces
the combat stats every combat faction wants. Combat gang outside BN2; hacking gang inside BN2.

---

## 6. Hacknet and hashes

Source `src/Hacknet/data/HashUpgradesMetadata.tsx`, `src/Hacknet/HashUpgrade.ts`,
`src/Hacknet/HacknetHelpers.tsx`.

- **`Sell for Money` is flat 4 hashes → $1,000,000 and never escalates** — a guaranteed
  **$250,000/hash** floor.
- **Overflow hashes above capacity auto-convert at that same rate**, so hashes are never
  destroyed by overflow. They *are* destroyed by an install.
- **Cost escalation is linear for everything except `Sell for Money`**: the Nth purchase of an
  upgrade costs `costPerLevel × N`.

| Perishable spends | Permanent spends |
|---|---|
| `Sell for Money` — 4 hashes, $1M | `Exchange for Bladeburner Rank` — 250, +100 rank |
| `Reduce Minimum Security` — 50, ×0.98 | `Exchange for Bladeburner SP` — 250, +10 SP |
| `Increase Maximum Money` — 50, ×1.02 | `Exchange for Corporation Research` — 200, +1000 RP to **all** divisions |
| `Improve Studying` / `Improve Gym Training` — 50, +20% additive | `Company Favor` — 200, +5 |

**SF9.1 is held**, which makes two further levers live:

- `Sell for Corporation Funds` — 100 hashes → $1e9 of **corporation** funds. This is the only
  route by which player-side resources enter the corporation's separate pool.
- `Exchange for Corporation Research` — 200 hashes → 1000 RP in every division.

Hacknet is **100% perishable** — servers, unspent hashes, and upgrade levels all reset.

---

## 7. Infrastructure — Tor, programs, servers

- **Tor router: $200,000**, lost on every install. A fixed bootstrap tax.
- **All darkweb programs are lost on install.** Home retains only `NUKE.exe`, plus `BitFlume`,
  plus `Formulas.exe` on BN5/SF5, plus programs granted by installed augs (§3).
- **SF5.1 is held**, so `Formulas.exe` appears to survive every install — one less item in the
  bootstrap tax. *Verify once; the whole HWGW design assumes Formulas is available.*
- **Home RAM and cores are kept** across installs; reset on BitNode change.
- **Purchased servers are entirely lost** on install.

### Home RAM at BitNode entry

This number is the binding constraint on every script-splitting decision, and it is easy to
misread from a late-node save.

| Situation | Home RAM |
|---|---|
| SF1.3 held | **32 GB** on BitNode entry |
| SF9.2 held | **128 GB** on BitNode entry |
| Mid-node, after upgrades | arbitrarily large — **not representative** |

A measurement of 32,768 GB was taken in a late BN9 save. It reflects purchased upgrades, not
what any future node begins with, and must not be used to size scripts.

*Unverified: whether SF1.3 and SF9.2 stack or take the maximum; purchased-server count limit
and max RAM per server (believed 25 and 1,048,576 GB); the exact pserv price formula.*

---

## 8. Hacking — worker costs and the yield metric

The full pipeline design lives in `hwgw-batching-design.md`. Only the facts other subsystems
need are repeated here.

### Per-thread worker RAM

| Worker | GB/thread |
|---|---|
| `hack` | 1.70 |
| `grow` | 1.75 |
| `weaken` | 1.75 |

A stray `ns.getServer()` inside a worker adds **2 GB × threads**. Workers must contain exactly
one `ns` call and nothing else.

### Timing constants

Source `src/Hacking.ts`, `src/Server/data/Constants.ts`.

| Fact | Value |
|---|---|
| `growTime` | `3.2 × hackTime` |
| `weakenTime` | `4 × hackTime` |
| `ServerFortifyAmount` | 0.002 |
| `ServerWeakenAmount` | 0.05 |
| grow fortify | `2 × ServerFortifyAmount` per thread |

Prefer `ns.hackAnalyzeSecurity()` and `ns.growthAnalyzeSecurity()` over the raw constants — the
latter takes a cores argument the constant does not account for.

### The yield metric

For a target, after sweeping the steal fraction `f` for its optimum:

```
scorePerGbSec = f* · moneyMax · hackChance / ( batchRam(f*) · (4t + 3g) )
```

This is income per GB-second: the natural unit for comparing targets, and the quantity a hacking
controller advertises as `produces.ratePerSec` per unit of leased RAM.

**Cores only help on `home`.** Purchased servers are always 1 core, and by standing decision
home cores are never purchased — so every thread-count calculation is core-independent.

---

## 9. Corporations — API surface and RAM

Formulas and round strategy live in `managers/corp.md`. This section covers only what the API
costs, because that is what constrains script architecture.

**Measured in-game** via `tools/ram-costs.js`; full output in `data/ram-costs.txt`.

| | |
|---|---|
| Functions in the `corporation` namespace | 63 |
| Cost tiers | 20 GB (38 fns), 10 GB (20 fns), 0 GB (5 fns) |
| Naive total, one script using all of them | **960 GB** |
| Base script overhead | 1.75 GB |

**RAM is computed by static analysis and it follows imports.** A module that references an `ns`
function costs that function's RAM in *every script that imports it*, whether or not the code
path is reachable. A single "all corp calls live here" module therefore costs 960 GB in every
importer. The packaging must be many small modules, each imported only by the script that needs
it.

Against 32 GB of entry home RAM (§7), a script can afford roughly **one 20 GB action function
plus one 10 GB getter**. Tea + party alone is 40 GB and does not fit in one script.

### The zero-cost functions

`hasCorporation`, `canCreateCorporation`, `getConstants`, `getBonusTime`, **`nextUpdate`**.

`nextUpdate` costing nothing is what makes a cheap orchestrator possible: a resident loop of
`await ns.corporation.nextUpdate()` plus `ns.run` costs under 3 GB, leaving the rest of home for
one worker at a time.

`nextUpdate()` resolves to the name of the state that was just processed —
one of START, PURCHASE, PRODUCTION, EXPORT, SALE — and the real time between updates varies with
bonus time, usually 200 ms to 2 s. It is a genuine await, not a poll, so state edges
cannot be missed regardless of bonus-time compression.

`getCorporation()`'s `state` property is deprecated in favour of `prevState`
and `nextState`; in v3.0 `state` was removed outright.

### Costs with no getter

There is no cost getter for `purchaseWarehouse`, `expandCity`, or `expandIndustry`. Those values
must come from `getConstants()`, `getIndustryData()`, or the local formula library. Any planner
that gates a step on one of those costs must have it supplied in its snapshot.

There is also **no `getProductMarkup`**, confirming that `ProductMarkup` must be measured
empirically rather than read.

---

## 10. Sleeves

Source `src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx`.

```
MaxSleevesFromCovenant = 5
BaseCostPerSleeve      = 10e12
cost of the n-th purchase = 10^n × $10e12
```

| Purchase | Cost |
|---|---|
| 1st | $10 trillion |
| 2nd | $100 trillion |
| 3rd | $1 quadrillion |
| 4th | $10 quadrillion |
| 5th | $100 quadrillion |
| **Total** | **$111.1 quadrillion** (1.111e17) |

Maximum sleeves anywhere = **3** (SF10.3) **+ 5** (Covenant) = **8**.

**Purchases require being in BN10 and a member of The Covenant, and money does not survive a
BitNode change** — so every dollar for those sleeves must be earned inside BN10.

*Unverified: whether the purchase gate requires Covenant membership and BN10 presence at the
moment of purchase, or only one of them.*

---

## 11. Known API drift

The design documents were written against remembered API names. Several are wrong for v3.0.
`@ts-check` against a committed `NetscriptDefinitions.d.ts` catches these in code but not in
prose, so they are recorded here.

| Documents say | Actual | Notes |
|---|---|---|
| `setAutoJobAssignment` | **`setJobAssignment`** | renamed in v3.0; appears in `managers/corp.md` §4 and §7.4 and `specs/recipe-dsl.md` §5 |
| `getCorporation().state` | **`.nextState`** / `.prevState` | `state` removed in v3.0 |
| `ns.formatNumber` | **`ns.format.number`** | likewise `formatRam`, `formatPercent`, `tFormat` |
| `ns.nFormat` | removed | use `ns.format.*` or `Intl` |

**`hireEmployee` exists** (20 GB) — a recipe engine that assigns jobs without hiring will throw,
since `setJobAssignment` moves employees from Unassigned and throws when there are too few.

Two behavioural changes worth knowing: `ns.nuke`, `ns.brutessh` and the other port-openers no
longer throw when the program is missing or ports are insufficient; and `.script` files can no
longer be run at all, only `.js`.

---

## Sources

Game mechanics verified against a clone of `bitburner-official/bitburner-src` at `dev`, commit
`79e5cd87` (2026-08-13, v3.0.2-dev). Files cited inline per section.

Corporation figures derive from the *Corporation manual*, last updated 2026-07-03, kept at
`docs/manuals/Corporation-manual.pdf`; author's code at
`https://github.com/catloversg/bitburner-scripts`. The author reports round 1 and 2 numbers were
validated over 200+ headless runs. Manual sections 20 (Advanced strategies) and 21 (Other
BitNodes) were still marked WIP at that revision.

Corp API RAM costs measured in-game, output retained at `data/ram-costs.txt`.
