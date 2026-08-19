# Manager: `augs`

**Status:** scoped, not designed.
**Build order:** step 5 (with `factions`). **Highest-leverage component after HWGW.**
**Parent:** `claude/automation-architecture.md`

---

## Responsibility

Owns the **install cycle** — the loop the entire run is organised around.

- Decide the **target augmentation set** for this cycle
- Publish the resulting **reputation targets** for `factions` to chase
- Decide **when the cycle is done** and an install should happen
- Execute the **pre-install spend-down**
- Buy augs in the **correct order**, then NeuroFlux Governor to the limit
- Trigger the install

### Explicitly out of scope

- Earning reputation — that is `factions`
- Earning money — everything else

---

## Time constant

Seconds. But its decisions have the longest reach of any manager in the system.

---

## Inputs

- `/state/director.json` — phase, `cash.augReserve`, `reserveFloor`
- `/state/factions.json` — membership, current rep, favor
- `/state/hashes.json` — hash balance available to convert
- Game state: owned augs, available augs and their costs, money, NFG level

## Output — `/state/augs.json`

```jsonc
{
  "lastRun": 1234567890,
  "wanted": [ { "aug": "Cranial Signal Processors - Gen III", "faction": "NiteSec",
                "repCost": 50000, "moneyCost": 5.5e7, "value": 0.84 } ],
  "repTargets": { "NiteSec": 875000 },
  "moneyNeeded": 4.2e9,
  "purchased": [],
  "nfgLevelsAffordable": 12,
  "readyToInstall": false,
  "estimatedCycleEndSec": 3600,
  "wants": [ { "what": "aug-fund", "cost": 4.2e9, "expectedGain": 0,
               "paybackSec": null, "permanent": true } ],
  "blocked": null
}
```

`estimatedCycleEndSec` is what the Director turns into `timeToInstallSec`, which in turn gates
every perishable purchase in the system. It is the most load-bearing number this manager
produces.

---

## Confirmed mechanics

These drive the purchase algorithm directly.

- **Each queued augmentation multiplies the money cost of subsequent purchases by 1.9×** — not
  2×, despite the in-game text saying "doubles". Precisely:
  `getBaseAugmentationPriceMultiplier() ^ (count of queued non-SoA augs)`, base
  `CONSTANTS.MultipleAugMultiplier = 1.9`, scaled by `[1, 0.96, 0.94, 0.93][SF11 level]`.
- **Reputation costs are NOT affected by that multiplier.** Rep is a per-faction gate checked
  independently.
- **Therefore: buy in descending money-cost order.** Minimising `Σ base_i · 1.9^(i−1)` means
  putting the largest base price at the smallest exponent.
- **NeuroFlux Governor:** base 500 rep / $750,000, scaling `1.14 ^ level` on *both*, where
  `level = ownedNFGLevel + count queued this reset`. The generic 1.9× multiplier applies to
  NFG's **money cost but not its rep cost**.
- NFG is offered by essentially every faction except Shadows of Anarchy, Bladeburners and Church
  of the Machine God. NFG level **persists across installs** but resets on BitNode change —
  except SF12, which re-grants NFG at `activeSourceFileLvl(12)` levels.
- **Post-install money is `1000 + CONSTANTS.Donations`** — currently **$1,262** — plus any aug
  `startingMoney` (CashRoot Starter Kit: +$1,000,000).
- **Unspent hashes and all hash-upgrade levels are destroyed on install.** Hashes must be
  converted before installing. `Sell for Money` is flat 4 hashes → $1,000,000, never escalates.
- **Kept across the install:** home RAM/cores, karma, favor, gang, corporation, bladeburner
  rank/SP/skills, sleeves, all files on home.
- **Lost:** money, pservs, hacknet (everything), Tor, all darkweb programs, faction rep and
  membership, all stats.

---

## The pre-install sequence

Order matters and several steps are irreversible.

1. Set `directives.haltPerishableSpending` — no more pservs, no more hacknet
2. Spend hashes: **permanent upgrades first** (Bladeburner rank/SP, corp research, company
   favor), then dump the remainder via `Sell for Money`
3. Liquidate anything else perishable that converts to cash
4. Buy the wanted augs in **descending money-cost order**
5. Buy NFG repeatedly until either rep or money runs out
6. Install

---

## Key decisions still to make

1. **How to value an augmentation.** The hard problem. An aug's worth depends on which
   multipliers it touches *and* which phase the run is heading into — hacking mults matter less
   once gang income dominates; combat and bladeburner mults matter more given the
   end-node-via-Bladeburner plan. Needs an explicit weight vector, probably phase-dependent.
2. **The install trigger.** The central question of the whole run. Candidate rules: install when
   marginal rep-per-second falls below a threshold; when the wanted set is fully purchased; when
   projected cycle income no longer justifies the bootstrap tax. Probably some blend, and it
   needs to be tunable and observable.
3. **The NFG stopping rule.** NFG is infinite, so "buy until broke" is wrong — each purchase
   raises the *money* price of nothing further (it is last) but does consume money that could
   have gone to a real aug next cycle. Actually money does not carry over, so buying until broke
   may be right. **Worth working through carefully.**
4. **Whether to buy augs that only help a phase being left behind.** Probably no, but the value
   function needs to encode it.
5. **Multi-faction purchase planning.** The same aug is often available from several factions at
   different rep costs. Choosing the cheapest-rep source shapes what `factions` must grind.
6. **Donations.** Once favor ≥ threshold, money converts directly to rep. That changes the whole
   optimisation — money and rep stop being independent constraints.

---

## v1 scope

- Hand-authored wanted-aug list (not a value function)
- Publish rep targets from it
- `readyToInstall` when every wanted aug is purchasable and purchased
- Correct purchase order (descending money cost) and NFG-until-broke
- Correct pre-install hash conversion
- Manual confirmation before the actual install — do not let v1 install unattended

---

## Open questions

- Singularity is required for most of this (`purchaseAugmentation`, `installAugmentations`).
  RAM cost scales down with SF4 level, and **SF4.3 is held** — costs are at their minimum.
- How does the manager fleet restart after an install? `installAugmentations` accepts a callback
  script — that is probably the bootstrap hook.
- Should `augs` own the decision to *skip* a cycle's augs entirely and install early to reset
  a badly-degraded run?
- Does the NFG-until-broke answer change when donations are available?
