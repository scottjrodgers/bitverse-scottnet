# Manager: `factions`

**Status:** scoped, not designed.
**Build order:** step 5 (with `augs` — together they close the install cycle).
**Parent:** `claude/automation-architecture.md`

---

## Responsibility

Get and keep access to the augmentations the `augs` manager wants to buy.

- Discover and accept faction **invitations**
- Satisfy invitation requirements — notably **backdooring** specific servers
- Decide **which factions to join** (some choices are exclusive and irreversible)
- Drive **reputation** toward the targets `augs` needs: faction work, `ns.share()`, donations
- Publish the reputation shortfall so the Director can shift RAM into `share()`

### Explicitly out of scope

- Choosing *which* augmentations to buy, or when to install — that is `augs`
- Grinding karma — that is `karma` (though the two compete for the same bodies)

---

## Time constant

Seconds. Invitations appear asynchronously; rep accrues continuously.

---

## Inputs

- `/state/director.json` — phase, body allocation, RAM lease for `share()`
- `/state/augs.json` — the wanted augmentation set and the **rep target per faction** derived
  from it
- Game state: current factions, invitations, rep, favor, backdoor status, stats, karma, money

## Output — `/state/factions.json`

```jsonc
{
  "lastRun": 1234567890,
  "member": ["CyberSec", "NiteSec"],
  "invitations": ["Tian Di Hui"],
  "repTargets":  { "NiteSec": 875000 },
  "repCurrent":  { "NiteSec": 210000 },
  "repShortfall": 665000,
  "favor":       { "NiteSec": 42 },
  "canDonate":   { "NiteSec": false },
  "backdoorQueue": ["avmnite-02h", "I.I.I.I"],
  "wants": [ { "what": "ram-for-share", "cost": 0, "expectedGain": 0,
               "paybackSec": null, "permanent": false } ],
  "blocked": null
}
```

`repShortfall` is the signal the Director uses to decide whether to move RAM from HWGW into
`share()`.

---

## Confirmed mechanics

- **Reputation is converted to favor on install, then zeroed.** Favor is permanent. So rep is a
  perishable resource that must be spent (on augs) within the cycle it is earned.
- **Faction membership is reset on install** (`this.factions = []`), except factions flagged
  `keepOnInstall`, which retain the invitation.
- **NiteSec** and **The Black Hand** — the two hacking-gang factions — require only a backdoor
  on `avmnite-02h` and `I.I.I.I` respectively. No karma, no combat stats, no money.
- Combat gang faction requirements, for reference:
  - Slum Snakes — combat 30, $1e6, karma −9
  - Tetrads — combat 75, karma −18, in Chongqing / New Tokyo / Ishima
  - The Syndicate — hack 200, combat 200, $10e6, karma −90
  - The Dark Army — hack 300, combat 300, 5 kills, karma −45, in Chongqing
  - Speakers for the Dead — hack 100, combat 300, 30 kills, karma −45

*To verify: the favor threshold that unlocks donating money for reputation (believed 150), and
the exact rep-per-dollar donation rate.*

---

## Key decisions still to make

1. **Exclusivity traps.** The city factions (Sector-12, Aevum, Chongqing, New Tokyo, Ishima,
   Volhaven) are mutually exclusive, and some joins are irreversible. The manager needs an
   explicit allow/deny policy, driven by the aug set, before it accepts anything automatically.
   **This is the highest-risk decision in the whole system** — a wrong automatic join can lock
   an augmentation out for the rest of the node.
2. **Rep target derivation.** `augs` should publish "I want these augs, which needs this much
   rep at these factions." Decide whether `factions` derives targets itself or consumes them.
3. **Bribery obsoletes much of this.** Once the corporation's valuation reaches **100e12**,
   money buys reputation directly at **1e9/rep** (`claude/managers/corp.md` §1.3). If bribery
   exists in the installed version, this manager shrinks dramatically once `corp` is running —
   it becomes "join the right factions, then let `corp` pay for the rep." Design the rep-grinding
   machinery knowing it has a shelf life, and read `bribeAvailable` from `/state/corp.json`.
4. **The three rep mechanisms and when to use each:**
   - **Faction work** — costs a body, free in money and RAM
   - **`ns.share()`** — costs RAM, free in bodies
   - **Donations** — costs money, free in both, but gated behind favor
   The right mix depends entirely on which resource is currently slack. That is a Director
   decision informed by this manager's shortfall number.
5. **Sleeves doing faction work.** Sleeves can work for factions in parallel with the player.
   This is probably the single biggest rep lever once sleeves exist — coordinate with `sleeves`.
6. **Favor farming.** Because favor is permanent and unlocks donations, there is an argument for
   deliberately over-earning rep at one faction late in a cycle purely to bank favor for future
   cycles. Worth evaluating; not obviously correct.
7. **Backdoor automation.** Requires Singularity (`ns.singularity.installBackdoor`) and a path
   walk. Needed for faction invites *and* useful for hacking. Where does the path-finding live?

---

## v1 scope

- Accept every invitation on a hand-authored allowlist; never auto-accept anything else
- Backdoor a hand-authored server list when hacking level permits
- Put the player on faction work for whichever faction has the largest rep shortfall
- Publish `repShortfall`

Donations, sleeves, and the RAM/body optimisation all come later.

---

## Open questions

- Should the allowlist be static, or derived automatically from the aug set? (Static is safer
  and, given the exclusivity traps, probably right for a long time.)
- Singularity RAM costs scale down with SF4 level, and **SF4.3 is held** — they are at their
  minimum. Treat Singularity RAM as a non-issue for this manager.
- How to handle a faction whose rep target is unreachable this cycle: give up and install, or
  extend the cycle? That is really an `augs` decision, but `factions` supplies the evidence.
