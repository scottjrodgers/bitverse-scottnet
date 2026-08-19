# Manager: `targeting`

**Status:** scoped, not designed.
**Build order:** step 3.
**Parent:** `claude/automation-architecture.md` · **Depends on:** `claude/hwgw-batching-design.md`

---

## Responsibility

Decide **which servers get attack pipelines, and how much RAM each one gets.**

- Rank all rooted, money-bearing servers by expected yield
- Decide how many concurrent pipelines to run
- Request RAM leases from the Director on behalf of each pipeline
- Start and stop `hwgw` scheduler processes
- Trigger `prep` on a target before its pipeline starts

### Explicitly out of scope

- Everything inside a pipeline — batch timing, thread sizing, the `f` sweep, resync. That is
  entirely the `hwgw` scheduler's business.
- Acquiring RAM. That is `infra` + Director.

---

## Time constant

Tens of seconds. Target rankings shift slowly (with hacking level and with hash-purchased
`Increase Maximum Money` / `Reduce Minimum Security`), and thrashing between targets is costly
because each switch pays a full prep.

---

## Inputs

- `/state/infra.json` — host inventory, rooted set
- `/state/director.json` — RAM leases available to targeting, phase
- `/state/hwgw.<target>.json` — per-pipeline health, actual measured income, skipped slots
- Game state: hacking level, per-server money/security/required level

## Output — `/state/targeting.json`

```jsonc
{
  "lastRun": 1234567890,
  "ranking": [ { "target": "phantasy", "scorePerGbSec": 1250, "ramNeeded": 4096 } ],
  "active": [ { "target": "phantasy", "pid": 123, "ramGranted": 4096, "state": "STEADY" } ],
  "spent": 0,
  "wants": [ { "what": "ram-for:the-hub", "cost": 0, "expectedGain": 800000,
               "paybackSec": null, "permanent": false } ],
  "blocked": null
}
```

Note `wants` here is a **RAM** want, not a cash want — the Director consumes both, but they use
different mechanisms (leases vs. fractions). Decide whether that belongs in the same array.

---

## The ranking metric

The HWGW doc already derives the right one. For a target, after sweeping `f` for the optimum:

```
income = f* · moneyMax · hackChance · budget / ( batchRam(f*) · (4t + 3g) )
```

Divide out `budget` and the metric is **income per GB-second**:

```
scorePerGbSec = f* · moneyMax · hackChance / ( batchRam(f*) · (4t + 3g) )
```

This is the natural currency for comparing targets *and* for deciding how to split RAM between
them — allocate to the highest score first until it saturates, then move down.

---

## Key decisions still to make

1. **The saturation signal.** From the HWGW doc: when the computed `P` clamps below
   `4g + jitterMargin`, that pipeline is timing-bound and cannot absorb more RAM. That is the
   precise trigger for opening a second pipeline. Wire it through the `hwgw` state file.
2. **How many concurrent targets.** More targets means more managers, more overhead, more
   fragmentation — but strictly more income if RAM would otherwise idle. Is there a cap?
3. **Hysteresis / anti-thrash.** Switching targets costs a full prep. A new target should have
   to beat the incumbent by a margin, and/or for a sustained period, before displacing it.
4. **RAM fragmentation.** An HWGW batch's four workers do not all have to be on one host, but
   each *worker* must fit on one host. Does targeting hand a pipeline a set of hosts, or a
   single host? The HWGW design currently assumes one host + a GB budget.
5. **Level-driven candidate churn.** As hacking level rises, better targets unlock and old ones
   become relatively worse. How often to re-rank, and does re-ranking use `Formulas` against a
   hypothetical prepped state (yes — it should, that is what makes pre-prep ranking possible).
6. **Prep cost in the ranking.** A target with huge `moneyMax` may take a very long time to
   prep. Should time-to-first-income be amortised into the score?
7. **Interaction with hash spends.** `Increase Maximum Money` and `Reduce Minimum Security`
   change a target's score. Should `targeting` publish a "this is my target, spend hashes here"
   signal for the `hashes` manager to consume?

---

## v1 scope

Single target. Rank by `scorePerGbSec` computed with Formulas against a hypothetical prepped
server; pick the best one that the current hacking level can hack; give it the entire HWGW RAM
lease; restart only when the top-ranked target changes and has held the top spot for N ticks.

Multi-target is v2, and only after the saturation signal exists.

---

## Open questions

- Should `prep` be a separate process from the `hwgw` scheduler, or a mode of it? (The HWGW doc
  currently models it as a function the scheduler calls.)
- How to handle a target whose pipeline keeps entering tier-2 drain — demote it in the ranking?
- Is there value in a low-priority "scavenger" pipeline that uses leftover fragmented RAM on
  small targets?
