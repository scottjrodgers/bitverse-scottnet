# Bitburner Automation — Architecture

**Status:** design settled at the architecture level. Individual managers are scoped but not
yet designed (see `claude/managers/*`).

**Current save:** BN3 (early), SF1.3 / 2.3 / 3.2 / 4.3 / 5.1 / 6.1 / 9.1. See
`implementation-plan.md` §0 for what each Source-File changes in these designs.

**Strategic context.** Hacking is the bootstrap engine. A gang is the mid-game revenue and
reputation engine, primarily as a route to cheap augmentations. Bladeburner is the usual means
of ending a BitNode. Corporations are the late-game money engine, funding Sleeve purchases and
upgrades and the repeated harder passes through BN12.

---

## 1. Three resources, not two

The allocation problem is usually framed as "RAM vs. cash." That framing overstates the
difficulty, because the consumers don't actually overlap much.

| Resource | Consumers |
|---|---|
| **RAM** | HWGW pipelines, `ns.share()`, manager script overhead. That is the entire list. |
| **Cash** | pservs, home RAM, Tor + programs, hacknet, augmentations, corp seed |
| **Bodies** | the player and sleeves — crime, faction work, training, bladeburner actions |

Gang, corporation, bladeburner, hacknet and sleeves are all **cash** systems with negligible
RAM footprint. So RAM allocation reduces to a three-way split — **HWGW vs. `share()` vs.
overhead** — and the genuinely hard problem is cash, with bodies second.

### The corporation short-circuits this later

Once a corporation's valuation reaches **100e12**, money converts directly into faction
reputation by bribery at **1e9 per reputation point**. Reputation is the perishable bottleneck on
augmentations, and a corporation produces money in quantities nothing else approaches. When that
threshold is crossed, most of the rep-grinding machinery below stops mattering. See
`claude/managers/corp.md` §1.3. *(Bribery has been added and removed across game versions —
confirm it exists in the installed build before designing around it.)*

### The one real RAM tension

`ns.share()` boosts faction reputation gain. Reputation gates augmentations, reputation is
**perishable** (reset on install), and RAM is the only thing that buys it faster. When the run
is money-rich and rep-poor near an install, the correct move is to shift RAM out of HWGW into
`share()`. This is the main reason the Director owns RAM at all.

*To verify: the exact `share()` power formula and its thread scaling / diminishing returns.*

---

## 2. The master heuristic — perishable vs. permanent

Everything in a BitNode organises around **time to next install**. The reset ledger splits all
spending into two classes, and that split drives nearly every priority decision.

Verified against `bitburner-src@dev` (commit `79e5cd87`, v3.0.2-dev).

### Lost on augmentation install

- **Money** — resets to `1000 + CONSTANTS.Donations` (currently **$1,262**, not exactly $1,000),
  plus any aug `startingMoney`. BN8 overrides to $250,000,000.
- **Purchased servers** — all of them
- **Hacknet nodes and servers**, **unspent hashes**, and **all hash-upgrade levels**
- **Tor router** — must be re-bought for **$200,000** every cycle
- **All darkweb programs** — home keeps only NUKE.exe, plus BitFlume, plus Formulas.exe on
  BN5/SF5, plus programs granted by installed augs
- **Faction reputation** — converted to favor, then zeroed
- **Faction membership**, jobs, all stats and experience
- **Everything on non-home servers** — servers are deleted and rebuilt

### Kept on augmentation install

- **Home RAM** and **home cores** — only reset on BitNode change
- **All installed augmentations**, including NeuroFlux level
- **Karma** — only reset on BitNode change. This is important.
- **Favor** (faction and company) — grows from the reputation just lost
- **Gang** — members and stats persist; ascension points take a ×0.95 penalty
- **Corporation** — persists entirely
- **Bladeburner** — rank, skill points and skills persist
- **Sleeves** — count persists
- **All scripts and text files on home**

### The rule

> **Buy a perishable thing only if its payback time is shorter than the time remaining in this
> reset cycle. Buy permanent things whenever affordable.**

Concretely: money into **home RAM is permanent**; money into **pservs evaporates**. Early in a
cycle pservs are the better buy because they pay back fast. Late in a cycle they are pure waste
and every dollar belongs in home RAM or the augmentation reserve.

This implies the Director must maintain an estimate of **time-to-install**, and every manager
should publish a **payback estimate** with its spending requests.

---

## 3. Cash priority ordering

1. **Tor router + port openers.** Trivial cost, gates everything else. Immediate, every cycle.
2. **Home RAM.** Permanent; compounds across every remaining cycle in the node. Highest
   long-run ROI.
3. **Purchased servers.** Early-cycle only, gated on `payback < timeToInstall`.
4. **Augmentation reserve.** Grows as the install approaches. This is the actual product of a
   cycle.
5. **Hacknet.** Mid-game, funded by gang income (see below).
6. **Corporation.** $150b self-funded. Firmly post-gang.

### Why hacknet is later than intuition suggests

`Sell for Money` is a **flat 4 hashes for $1,000,000 and never escalates** — a guaranteed
**$250,000/hash** floor. Overflow hashes above capacity auto-convert at that same rate, so
hashes are never destroyed. Hacknet servers are therefore a predictable money machine with a
known conversion rate.

But hacknet is **100% perishable** — servers, unspent hashes, *and* upgrade levels all reset —
and production ramps slowly because upgrades are incremental. Early in a node, with short
cycles, that is a losing bet. Funding a hacknet farm from early hacking income spends the
scarcest capital on the slowest-compounding asset.

Its real payoff is the hash spends that **survive an install**:

| Perishable spends | Permanent spends |
|---|---|
| `Sell for Money` — 4 hashes flat, $1M | `Exchange for Bladeburner Rank` — 250, +100 rank |
| `Reduce Minimum Security` — 50, ×0.98 | `Exchange for Bladeburner SP` — 250, +10 SP |
| `Increase Maximum Money` — 50, ×1.02 | `Exchange for Corporation Research` — 200, +1000 all divisions |
| `Improve Studying` / `Improve Gym Training` — 50, +20% additive | `Company Favor` — 200, +5 |

Cost escalation is **linear** for everything except `Sell for Money`: the Nth purchase of an
upgrade costs `costPerLevel × N`.

Given the strategy (Bladeburner to end nodes, corps for money), hacknet's value is the
**bladeburner-rank and corp-research pipes**, not the cash. Build it after gang income makes
purchase price trivial and after Bladeburner/corp exist to receive the hashes.

**Hash policy:** within a cycle, buy perishables that accelerate *this* cycle — `Reduce Minimum
Security` on the active HWGW target is directly synergistic. As the install approaches, shift
entirely to permanents, then dump the remainder to money.

---

## 4. Gang type — combat vs. hacking

Resolved more cleanly by the source than the community debate suggests.

- **Creation requires SF2 (any level) + karma ≤ −54,000.** BN2 waives the karma requirement
  entirely. Karma is **not** reset by installing augs — only by leaving the BitNode.
- **Augment availability is identical.** Every gang faction offers essentially the whole
  augmentation list, filtered by a seeded RNG. NiteSec vs. Slum Snakes does not change what
  can be bought.
- **Hacking gangs are NiteSec and The Black Hand**; the other five are combat. Entry to the
  hacking factions needs only a backdoor on `avmnite-02h` / `I.I.I.I` — no karma, no stats.
- **That entry advantage is moot outside BN2**, because grinding to −54,000 karma means
  committing homicide, which means the combat stats every combat faction wants already exist.
- **Combat gangs get territory multipliers.** Human Trafficking carries
  `{money ×1.5, respect ×1.5}`; Terrorism carries `{respect ×2}`. The best hacking money task
  (Money Laundering) has the same base money (360) at *lower* difficulty (25 vs 36) but **no
  territory multiplier at all**.
- Gang power for warfare uses all six stats equally, so hacking gangs are not structurally
  disadvantaged at warfare — they just gain less from winning it.

**Judgment (not stated in source): combat gang outside BN2, hacking gang inside BN2** — in BN2
no karma is needed and a backdoor starts the gang immediately.

---

## 5. Layer architecture

### Layer 0 — Workers

`hack.js`, `grow.js`, `weaken.js`, `share.js`. Minimal RAM, zero decisions, one `ns` call each.
Per-thread RAM: hack **1.70 GB**, grow **1.75 GB**, weaken **1.75 GB**.

### Layer 1 — Managers

One per domain, long-lived, each operating inside an allowance granted from above.

| Manager | Owns | Time constant |
|---|---|---|
| `hwgw` (one per target) | a target's attack pipeline | milliseconds |
| `infra` | Tor, programs, rooting, pservs, home RAM | seconds |
| `targeting` | which servers get pipelines and how much RAM | tens of seconds |
| `factions` | invites, backdoors, rep grinding | seconds |
| `augs` | aug selection, purchase order, install decision | seconds |
| `contracts` | find and solve coding contracts | tens of seconds |
| `karma` | drive karma toward −54,000 | seconds |
| `sleeves` | sleeve task assignment and upgrades | seconds |
| `gang` | recruitment, ascension, tasks, equipment, territory | seconds |
| `hacknet` | buy and upgrade hacknet servers | seconds |
| `hashes` | spend hashes | seconds |
| `bladeburner` | actions, skills, chaos management | seconds |
| `corp` | divisions, products, research, funding | tens of seconds |

### Layer 2 — Director

Owns exactly three things: **the phase**, **the cash split**, and **RAM leases**. Plus body
allocation once sleeves exist. **No domain logic whatsoever.**

### The discipline that makes it work

> **A manager never reads global money or free RAM. It reads its allowance.**

This is the generalisation of the per-target RAM budget in the HWGW design. It is what prevents
five scripts from all spending the same dollar, and it makes every manager testable in isolation
by handing it a synthetic allowance.

---

## 6. Coordination mechanics

### Files for state, ports only for lossy telemetry

`ns.read` and `ns.write` are **0 GB**, durable across script restarts, and survive a manager
crash. Ports lose messages when full and vanish on restart.

**Recommendation, contrary to the usual "use ports for IPC" advice:** use **files for all state
and all directives**. Reserve ports for high-frequency telemetry where loss is acceptable.

### Single-writer ownership

Each manager owns **exactly one** state file and is the **only** writer to it. The Director owns
`/state/director.json` and is its only writer. Everyone may read anything.

This makes locking unnecessary. Whole-document writes, last-writer-wins, no partial updates.

```
/state/director.json      <- Director writes; everyone reads
/state/infra.json         <- infra writes
/state/hwgw.<target>.json <- that scheduler writes
...
```

### Manager contract

Every manager, every tick:

1. Read `/state/director.json` — phase, cash fractions, RAM leases, reserve floor
2. Read the game state it needs
3. Act, strictly within its allowance
4. Write its own state file:

```jsonc
{
  "lastRun": 1234567890,
  "spent": 0,
  "wants": [
    { "what": "pserv-upgrade-64GB", "cost": 1.1e6, "expectedGain": 12000,
      "paybackSec": 92, "permanent": false }
  ],
  "blocked": null
}
```

**Publish `wants` from day one even though v1's Director ignores it.** It costs nothing, gives
immediate observability, and it is exactly the data a future ROI-bidding Director consumes — so
the upgrade path requires no manager rewrites.

---

## 7. Allocation mechanisms

### Cash — fractions, not absolute amounts

The Director publishes fractions plus a hard floor:

```jsonc
{ "reserveFloor": 5e6,
  "cash": { "infra": 0.30, "hacknet": 0.10, "augReserve": 0.60 } }
```

Each manager computes its budget **at the moment it wants to spend**:

```
budget = fraction * max(0, money - reserveFloor)
```

Three properties make this the right v1 choice:

- **Never stale.** Money arrives continuously; the fraction re-evaluates continuously.
- **No messaging.** No request/approve round trip.
- **Inherently race-safe.** If the fractions sum to ≤ 1, simultaneous spenders cannot
  collectively breach the floor — each takes at most its own share of the same headroom.

### RAM — explicit leases

RAM is physical and over-commit fails loudly (`ns.exec` returns 0), so fractions do not work.
The Director owns a host inventory and grants `(host, GB)` leases. Managers `exec` only into
their own leases.

```jsonc
{ "ram": {
    "hwgw:n00dles":  [ { "host": "pserv-0", "gb": 512 } ],
    "share":         [ { "host": "home",    "gb": 128 } ],
    "reserve":       [ { "host": "home",    "gb": 32  } ] } }
```

Managers must still handle `exec` returning 0 — leases can be wrong.

### Bodies — assignment

Player and each sleeve get an assigned activity. Distinct from both other resources; add once
`karma` and `sleeves` managers exist.

---

## 8. Phase machine

All transitions observable from game state. No manual input.

```
BOOTSTRAP -> EARLY -> KARMA -> GANG -> CORP
                                        |
                    PRE_INSTALL <--------+
                         |
                      INSTALL -> BOOTSTRAP
```

| Phase | Entered when | Emphasis |
|---|---|---|
| `BOOTSTRAP` | just installed; ~$1,262 | re-buy Tor + programs, root everything, start one small HWGW pipeline |
| `EARLY` | rooted set stable, income flowing | cash to home RAM + pservs + port openers |
| `KARMA` | (parallel) no gang yet, SF2 held | sleeves + player on homicide toward −54,000 |
| `GANG` | gang created | gang income dominates; cash to hacknet, home RAM, augs |
| `CORP` | ≥ $150b available | start corp; corp becomes primary income |
| `PRE_INSTALL` | aug target set identified and affordable-ish | stop perishable spending; convert hashes; buy augs |
| `INSTALL` | purchases complete | install, then re-enter `BOOTSTRAP` |

`PRE_INSTALL` is where the perishable/permanent rule bites hardest: halt pserv purchases, spend
hashes down (permanents first, then dump to money), buy augs in **descending money-cost order**,
then NeuroFlux Governor to the reputation limit.

---

## 9. Build order

| # | Component | Notes |
|---|---|---|
| 1 | **HWGW** | designed — see `claude/hwgw-batching-design.md` |
| 2 | **`infra`** | biggest immediate win, simplest manager |
| 3 | **`targeting`** | consumes the HWGW doc's "spare RAM" signal |
| 4 | **Dumb Director** | phase machine, fractional cash, RAM leases. No ROI. |
| 5 | **`factions` + `augs` + install cycle** | **highest leverage after HWGW** |
| 6 | `contracts` | cheap, good ROI; hashes generate them later |
| 7 | `karma` + `sleeves` | karma is permanent and slow — start early |
| 8 | `gang` | |
| 9 | `hacknet` + `hashes` | |
| 10 | `bladeburner` | |
| 11 | `corp` | **BN3 exception — see below.** Designed: `claude/managers/corp.md` |
| 12 | ROI-bidding Director | consumes the `wants` arrays managers already publish |

**BN3 ordering exception.** The step-11 placement assumes a corporation costs $150b of hacking
income. In **BN3 the government seed-money option is free** (it costs equity, not cash), so the
corp costs nothing but time and should run *concurrently with* the hacking bootstrap rather than
after it. Since finishing **BN3 level 3** — which unlocks `WarehouseAPI` and `OfficeAPI` for free
in every other BitNode, otherwise $50b each in corp funds — is the current objective, this
warrants a BitNode-conditional branch in the Director's phase machine.

**Step 5 is the one to resist deferring.** The common instinct is to build hacknet and gang
automation first. That is backwards: until buying augs and deciding when to install is
automated, every cycle stalls waiting on a human, and the compounding that makes everything
else worthwhile never starts.

---

## 10. Document index

**Plan and specs**

- `claude/implementation-plan.md` — phased plan from design to a tested system
- `claude/specs/manager-contract.md` — normative; state files, allowances, lifecycle
- `claude/specs/recipe-dsl.md` — normative; the corp round-recipe engine

**Designs**

- `claude/hwgw-batching-design.md` — the per-target attack pipeline
- `claude/managers/director.md`
- `claude/managers/infra.md`
- `claude/managers/targeting.md`
- `claude/managers/factions.md`
- `claude/managers/augs.md`
- `claude/managers/corp.md` — designed; see the BN3 ordering exception below

Managers not yet scoped: `contracts`, `karma`, `sleeves`, `gang`, `hacknet`, `hashes`,
`bladeburner`.

---

## 11. Open questions

- `ns.share()` power formula and thread scaling — needed before the RAM split between HWGW and
  share can be reasoned about numerically.
- Time-to-install estimation. Every payback gate depends on it, and it is circular (spending
  changes the estimate). Probably needs a damped/hysteretic estimator.
- Whether the Director should ever pre-empt a running HWGW pipeline to reclaim RAM, or only
  reallocate on pipeline exit.
- Manager crash detection and restart. Single-writer state files make recovery easy; the
  detection mechanism is undecided.
- Formulas API RAM cost (carried over from the HWGW doc).

---

## Sources

All game mechanics above verified against a clone of `bitburner-official/bitburner-src` at
`dev`, commit `79e5cd87` (2026-08-13, v3.0.2-dev). Key files:

- `src/Prestige.ts`, `src/PersonObjects/Player/PlayerObjectGeneralMethods.ts`,
  `src/Server/ServerHelpers.ts` — install reset ledger
- `src/Hacknet/data/HashUpgradesMetadata.tsx`, `src/Hacknet/HashUpgrade.ts`,
  `src/Hacknet/HacknetHelpers.tsx` — hash costs, effects, overflow behaviour
- `src/PersonObjects/Player/PlayerObjectGangMethods.ts`, `src/Gang/data/Constants.ts`,
  `src/Gang/data/tasks.ts`, `src/Gang/GangMember.ts` — gang requirements and task data
- `src/Corporation/helpers.ts` — corporation cost and API access
- `src/Augmentation/AugmentationHelpers.ts`, `src/Constants.ts` — augmentation price scaling

Note: `dev` may be slightly ahead of the installed release. `CONSTANTS.Donations` (the source of
the $1,262 post-install figure) is bumped periodically and will differ between versions.
