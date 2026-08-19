# Manager: `infra`

**Status:** scoped, not designed.
**Build order:** step 2 — first manager after HWGW. Biggest immediate win, simplest logic.
**Parent:** `claude/automation-architecture.md`

---

## Responsibility

Everything that creates or expands the machine the rest of the system runs on.

- Buy the **Tor router** ($200,000) and the darkweb **port openers**
  (BruteSSH, FTPCrack, relaySMTP, HTTPWorm, SQLInject)
- **Root** every newly reachable server: open ports, `NUKE`
- Maintain the **server inventory** — the authoritative list of hosts and their RAM, published
  for the Director's lease planner
- Buy and upgrade **purchased servers**
- Upgrade **home RAM**
- Copy worker scripts to any host that needs them

### Explicitly out of scope

- Deciding which servers to *attack* — that is `targeting`
- Deciding how much may be spent — that comes from the Director's allowance
- **Home cores are never purchased.** Standing decision: all servers stay at 1 core, which keeps
  every thread-count calculation core-independent.

---

## Time constant

Seconds. Faster during `BOOTSTRAP` (there is a lot to re-buy), slow once stable.

---

## Inputs

- `/state/director.json` — `cash.infra` fraction, `reserveFloor`, `phase`,
  `directives.haltPerishableSpending`
- Network scan, owned programs, purchased server list, home RAM

## Output — `/state/infra.json`

```jsonc
{
  "lastRun": 1234567890,
  "hosts": [ { "host": "pserv-0", "maxRam": 512, "cores": 1, "rooted": true, "purchased": true } ],
  "rootedCount": 42,
  "programs": { "BruteSSH.exe": true, "FTPCrack.exe": false, "...": false },
  "hasTor": true,
  "spent": 0,
  "wants": [
    { "what": "home-ram-upgrade", "cost": 4.2e9, "expectedGain": 0,
      "paybackSec": null, "permanent": true },
    { "what": "pserv-upgrade:512->1024", "cost": 1.1e8, "expectedGain": 90000,
      "paybackSec": 1200, "permanent": false }
  ],
  "blocked": null
}
```

---

## Confirmed mechanics

- **Tor router: $200,000**, and it is **lost on every install** — a fixed bootstrap tax
- **All darkweb programs are lost on install.** Home retains only NUKE.exe (plus BitFlume,
  plus Formulas.exe on BN5/SF5, plus programs granted by installed augs). **SF5.1 is held**, so
  Formulas.exe survives every install — one less item in the per-cycle bootstrap tax
- **Home RAM and cores are kept** across installs — only reset on BitNode change
- **Purchased servers are entirely lost** on install
- Program-granting augs that reduce the bootstrap tax:
  - **CashRoot Starter Kit** → BruteSSH.exe + $1,000,000 (Sector-12, 12.5k rep / $125m)
  - **Neurolink** → FTPCrack.exe + relaySMTP.exe (BitRunners)
  - **PCMatrix** → DeepscanV1.exe + AutoLink.exe (Aevum)

*To verify: purchased-server count limit and max RAM per server (believed 25 servers and
1,048,576 GB), and the exact pserv price formula.*

---

## Key decisions still to make

1. **The pserv payback gate.** The core rule from the architecture doc:
   `buy only if payback < timeToInstall`. Needs a concrete model of "what income does one more
   GB of HWGW RAM produce," which the HWGW doc's `income = f·M·hackChance·budget / (batchRam·(4t+3g))`
   formula supplies directly. Wire those together.
2. **Ladder strategy.** Many small servers vs. few large ones. Fewer, larger servers reduce RAM
   fragmentation (a batch must fit entirely on one host), which matters a lot for HWGW. Probably
   argues for **fewest, largest** — but confirm against the pserv price curve.
3. **Delete-and-replace.** Upgrading a pserv means deleting it, which kills anything running on
   it. Needs coordination with the Director's lease system: drain the lease, then replace.
4. **Home RAM vs. pserv split within the infra allowance.** Home RAM is permanent and pservs are
   not, so the split should shift toward home as `timeToInstall` shrinks. Should the Director
   express this as two separate fractions instead of one `infra` fraction?
5. **Buy vs. `createProgram`.** Writing programs costs time (a body) but no money; buying costs
   money but no time. Which is right depends on phase and on whether bodies are otherwise idle.
6. **Program purchase order.** Port openers unlock servers non-uniformly — some unlock much more
   value than others. Order by unlocked-value, not by price.
7. **Bootstrap sequencing.** At $1,262 nothing is affordable. What is the minimal path from
   post-install to first income?

---

## v1 scope

- Root everything reachable, every tick
- Buy Tor and port openers as soon as affordable, in a hand-authored order
- Buy the largest affordable pserv up to the server limit; upgrade the smallest one when it is
  cheaper than a new one
- Upgrade home RAM whenever the allowance covers it
- Publish the host inventory

Skip the payback gate in v1 — add it once `timeToInstallSec` exists.

---

## Open questions

- Should `infra` own worker-script distribution, or should each `hwgw` scheduler `scp` its own?
- How does `infra` learn a new server became reachable — periodic full scan, or event-driven?
- Purchased-server naming scheme, and whether it needs to be stable across installs.
