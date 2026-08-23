# HWGW Batching — Design Notes (Part 1)

**Status:** design settled, not yet implemented.
**Scope:** prep a single target, then run a steady-state HWGW pipeline against it from a single host with a fixed RAM budget.
**Assumes:** Formulas.exe available. One scheduler process per target. One pipeline per target.

*With SF5 held, Formulas.exe appears to be re-granted automatically after every augmentation
install, so this assumption holds permanently rather than needing to be re-established each
cycle. Verify once.*

---

## 1. Confirmed mechanics

Verified against `bitburner-src/dev` source, August 2026.

| Fact | Value | Source |
|---|---|---|
| `growTime` | `3.2 × hackTime` | `src/Hacking.ts` `calculateGrowTime` |
| `weakenTime` | `4 × hackTime` | `src/Hacking.ts` `calculateWeakenTime` |
| `ServerFortifyAmount` | `0.002` | `src/Server/data/Constants.ts` |
| `ServerWeakenAmount` | `0.05` | `src/Server/data/Constants.ts` |
| grow fortify | `2 × ServerFortifyAmount` per thread | use `ns.growthAnalyzeSecurity()` |

Prefer the API over hardcoded constants — `ns.hackAnalyzeSecurity(threads, host)` and
`ns.growthAnalyzeSecurity(threads, host, cores)`. The latter takes a cores argument the raw
constant doesn't account for.

### The mechanic the whole design rests on

`additionalMsec` is added to the computed duration **before** a single `netscriptDelay`.
It is not a pre-sleep. From `src/NetscriptFunctions.ts`, identical for all three ops:

```js
const hackTime = calculateHackingTime(server, Player) + additionalMsec / 1000.0;
return helpers.netscriptDelay(ctx, hackTime * 1000).then(...)
```

API docs: *"Number of additional milliseconds that will be spent waiting between the start
of the function and when it completes."*

Consequences:

- **Duration is locked at call time**, from the server's security at that instant.
- **Effect is applied at resolution**, against server state at that instant. (Confirmed by
  Scott for hack, grow, and weaken.)
- Therefore: **launch all four ops of a batch simultaneously and stagger the landings with
  `additionalMsec`.** All four durations get computed in the same tick against identical
  server state. This is what makes the whole thing tractable.

`ns.exec` is synchronous and does not yield, so all four exec calls occur in the same JS tick.

---

## 2. Timing model

Notation: `t` = hackTime, so `weakenTime = 4t`, `growTime = 3.2t`.
`g` = gap between landings inside a batch. `P` = period between batch landing slots.

### Landings, not launches

The ops are separated by `g` at the **finish**, not the start. Naive per-op launching would
mean four launch instants per batch spread over ~15 seconds, with W1 first and H last. We do
not do that.

Instead: one launch instant `L`, four `additionalMsec` offsets.

```
L    = T - 4t - S                    // S >= 0, slack (see §3)

a_H  = 3t + S                        // lands T
a_W1 = g + S                         // lands T + g
a_G  = 0.8t + 2g + S                 // lands T + 2g
a_W2 = 3g + S                        // lands T + 3g
```

All offsets are non-negative for any `S >= 0` because weaken (4t) is the longest op and sets
the floor for `L`.

### Fixed landing grid

```
T_k = T_0 + k*P
```

Anchor off `T_0`; never accumulate `T += P`. Schedule **backward** from each landing slot:

```
t_k = live hackTime
S_k = solveSlack(t_k, g, P)
L_k = T_k - 4*t_k - S_k
if L_k < now + margin:  skip slot k
```

**Why the grid matters — level-ups.** Each batch is internally self-consistent and fully
locked at launch, so in-flight batches are *unaffected* by a hacking level change. Only
future batches see the new, shorter `t`. With a fixed landing grid, a level-up just moves
`L_k` later; landings are unchanged. No drain required. (Earlier draft of this design called
level-ups the "#1 killer" requiring a resync — that was wrong, and it mattered most in early
game where you level fastest.)

Re-derive thread counts each batch too: `hackPercent` rises with level, so `hThreads` for a
given `f` falls.

---

## 3. The security-phase problem and the slack solve

A batch dirties the server during two windows relative to its landing slot:

- `(T_k, T_k + g)` — after H lands, before W1 clears it
- `(T_k + 2g, T_k + 3g)` — after G lands, before W2 clears it

If a *launch* instant falls inside another batch's dirty window, all four of that batch's
durations inflate by the same **ratio**, but by very different **absolute** amounts:
a 3% security bump on `t = 5s` shifts hack by 150ms and weaken by 600ms. That scrambles a
200ms batch completely.

Because launches and dirty windows are both periodic in `P`, the phase relationship is fixed.
Solve it in closed form — aim for the middle of the widest clean window `[3g, P]`:

```
target = (3*g + P) / 2
S      = (((-4*t - target) % P) + P) % P
```

Margin to the nearest dirty edge is `(P - 3g) / 2`. At `P = 4g` that's only `g/2` — another
reason not to run `P` at its floor.

Recompute `S` per batch, since it depends on `t`.

---

## 4. Choosing `f` and `P`

### `P` is not a performance knob

When RAM-bound:

```
income     = f · M · hackChance / P
RAM in use = batchRam(f) · inFlight,   inFlight ≈ (4t + 3g) / P
```

`P` cancels. Substituting the RAM cap:

```
income = f · M · hackChance · budget / ( batchRam(f) · (4t + 3g) )
```

Only `f` appears. Halving `P` doubles the batch rate *and* doubles RAM in flight — same
income per GB. So:

**Take the largest `P` that still leaves RAM as the binding constraint.** Bigger `P` is free
income-wise and buys jitter margin, which is the only thing that actually threatens
correctness.

### `f` has a true interior optimum

- `hThreads ∝ f` — linear
- `gThreads ∝ −ln(1−f)` — near-linear at small `f`, superlinear above ~0.3
  (at `f = 0.9` it is ~2.5× the linear estimate)
- at tiny `f`, `ceil()` rounding dominates — you still pay ≥1 thread each for G, W1, W2, so
  a batch stealing a sliver still costs ~7GB

Rounding overhead falls with `f`; grow superlinearity rises with `f`. The optimum sits
between. Don't hand-tune it — sweep it. Pure math, no game time:

```
sweepF(preppedServer, player, cores):
    pctPer = formulas.hacking.hackPercent(preppedServer, player)
    best = null
    for f in linspace(pctPer, 0.99, 200):
        b = sizeBatch(f, preppedServer, player, cores)
        score = (b.fActual * hackChance) / b.batchRam
        if score > best.score: best = {f, b, score}
    return best
```

### Then `P` falls out

```
inFlightWanted = floor( budget / batchRam(f*) )
P              = floor( (4t + 3g) / inFlightWanted )
P              = max( P, 4*g + jitterMargin )
```

If that clamp bites — computed `P` below `4g + margin` — you are timing-bound and have more
RAM than this target can absorb. **The answer is a second target, not a bigger `f`.** That is
a layer-2 decision, which is exactly why the scheduler is per-target.

### `g`

`g`'s floor is set by *variance*, not by the game's timing math:

1. **Launch-latency jitter** — spread in the gap between `exec` returning and each child's
   first line executing. Constant latency is free (it shifts the whole grid uniformly);
   variance is what collides batches.
2. **Scheduler wake accuracy** — `ns.sleep(x)` wakes on a game tick, not exactly at `x`.

Measure both (see v0 in §8), take the p99 spread, set `g >= 3×` that. Expect to land somewhere
in 100–200ms, but it depends on total script count.

---

## 5. Sizing a batch

**Rule: timings from the live server, thread counts from the prepped model.**

In steady state live == prepped, so this costs nothing. In repair mode (§7) the server is
*not* at min security, and using the prepped model would under-predict durations — landings
would arrive late, at exactly the wrong moment.

```
sizeBatch(f, target, host, cores):
    live = ns.getServer(target)
    p    = ns.getPlayer()

    # --- timings: LIVE state ---
    t = formulas.hacking.hackTime(live, p)          # wT = 4t, gT = 3.2t

    # --- threads: PREPPED model ---
    prepped = {...live, hackDifficulty: live.minDifficulty,
                        moneyAvailable: live.moneyMax}
    wPer   = ns.weakenAnalyze(1, cores)

    pctPer  = formulas.hacking.hackPercent(prepped, p)
    hT      = max(1, floor(f / pctPer))
    fActual = hT * pctPer

    afterHack = {...prepped, moneyAvailable: prepped.moneyMax * (1 - fActual)}
    gT_       = ceil( formulas.hacking.growThreads(afterHack, p, prepped.moneyMax, cores)
                      * GROW_PAD )                  # GROW_PAD ≈ 1.10

    w1 = ceil( ns.hackAnalyzeSecurity(hT, target) / wPer )
    w2 = ceil( ns.growthAnalyzeSecurity(gT_, target, cores) / wPer )

    batchRam = hT*1.70 + gT_*1.75 + (w1 + w2)*1.75

    return {t, hT, gT_, w1, w2, fActual, batchRam}
```

**Pad grow, never hack.** Grow overshoot is free (clamped at `moneyMax`). Grow undershoot
compounds across batches into a slow bleed that only a resync fixes.

---

## 6. Part 1 — Prep

Bring security to min and money to max. Not a loop of "weaken till min, then grow till max" —
a single three-op batch landing W, G, W.

```
prep(target, host, budget):
    live = ns.getServer(target); p = ns.getPlayer(); wPer = ns.weakenAnalyze(1, cores)

    if live.hackDifficulty <= live.minDifficulty
       and live.moneyAvailable >= live.moneyMax:  return DONE

    w1 = ceil( (live.hackDifficulty - live.minDifficulty) / wPer )

    # grow RESOLVES at min security -> size it against that
    atMin = {...live, hackDifficulty: live.minDifficulty}
    gT_   = ceil( formulas.hacking.growThreads(atMin, p, live.moneyMax, cores) * GROW_PAD )
    w2    = ceil( ns.growthAnalyzeSecurity(gT_, target, cores) / wPer )

    # timings from LIVE state (ops start now, at current security)
    wTime = formulas.hacking.weakenTime(live, p)
    gTime = formulas.hacking.growTime(live, p)

    # land W1 @ X, G @ X+g, W2 @ X+2g   where X = now + LEAD + wTime
    exec W(w1)  additionalMsec = 0
    exec G(gT_) additionalMsec = wTime + g - gTime
    exec W(w2)  additionalMsec = 2*g

    if RAM insufficient: scale threads to fit and repeat next round
```

Prep is naturally self-correcting — it re-measures every round, so level-ups and partial
progress are harmless.

**Prep gotchas**

- `moneyAvailable == 0` → `ns.growthAnalyze` returns `Infinity`. `formulas.growThreads`
  handles it correctly (grow is `(money + threads) × mult`), but guard anyway.
- If RAM can't cover a full prep, prioritise getting security to min first — grow is much
  more thread-efficient at min security.

---

## 7. Part 2 — The batcher

### Main loop (just-in-time launching)

```
run(target, host, budget, g):
    prep(target) until clean
    T_0 = now + LEAD
    k = 0; repairStreak = 0

    loop:
        b = sizeBatch(f*, target, host, cores)       # re-sized every slot
        S = solveSlack(b.t, g, P)
        T_k = T_0 + k*P
        L_k = T_k - 4*b.t - S

        if L_k < now + MIN_LEAD:
            k++; skippedSlots++; continue            # slot already passed

        sleepUntil(L_k)

        # --- pre-launch guard ---
        clean = ns.getServerSecurityLevel(target) <= minSec + EPS
            and ns.getServerMoneyAvailable(target) >= moneyMax * 0.99

        if clean:
            pids = execFour(k, b, S)                 # H, W1, G, W2
            repairStreak = 0
        else:
            pids = execThree(k, b, S)                # SAME offsets, H omitted
            repairStreak++

        if any pid == 0:
            ns.kill(the others); goto DRAIN

        if repairStreak >= REPAIR_LIMIT: goto DRAIN

        k++
```

### Tier 1 — the repair batch

When the guard fails, launch **the same batch with the hack simply omitted**. No new math
required: the batch's `G` is already sized to restore `f` of max money, and `W1 + W2` are
sized to clear hack + grow fortification — so with no hack it over-weakens (harmless, clamped
at min) and grows toward max.

Keep the *same* `additionalMsec` offsets, just skip one `exec`. This leaves the dirty-window
structure unchanged, so the phase solve in §3 still holds.

It corrects at only `f` per slot — down 30% at `f = 0.10` takes ~3 slots — but it cannot
overshoot, and its RAM is bounded by the normal batch size. Both are worth more than speed.

### Tier 2 — drain and prep

Tier 1 fights a moving target: at the moment drift is detected, `inFlight` batches are
already committed and will land over the next `4t`. If drift is *small* those batches are
still basically correct and the repair wins. If drift is *structural* — an inverted batch,
an orphaned grow from a partial launch, a backgrounded tab — they are actively making it
worse and no repair catches up.

```
DRAIN:
    stop launching
    sleep(4*t + 3*g + MARGIN)      # let everything in flight land
    prep() until clean
    T_0 = now + LEAD; k = 0; repairStreak = 0
    resume
```

`REPAIR_LIMIT` ≈ `4t / P` (one full in-flight window), roughly 5–8 slots. Use the
**persistence counter, not a magnitude threshold** — magnitude thresholds need per-server
tuning; "it didn't clear after a full drain window" is self-scaling and needs no constant.

### Resync trigger set

- security `> minSec + EPS` at the pre-launch guard → tier 1
- money `< moneyMax * 0.99` at the pre-launch guard → tier 1
- `repairStreak >= REPAIR_LIMIT` → tier 2
- any `exec` returning 0 → kill partial batch → tier 2
- N consecutive skipped slots → tier 2

Note: hacking level changes are **not** on this list. See §2.

**Unsolved:** another script hacking the same target produces symptoms identical to desync,
but the fix is different (stop the other script, not re-prep). No cheap detection known.

---

## 8. RAM ownership

One scheduler per target. Two schedulers on the same host will both compute free RAM and both
conclude it's theirs.

**Rule: a scheduler never queries free RAM.** It self-limits by tracking
`batchRam × inFlight` against a budget it is given. Whoever hands out those budgets owns the
partitioning.

Still handle `exec` returning 0. Budgets can be wrong.

### The budget is a Director lease, not a launch arg

That budget now arrives as a **lease** from the Director (`specs/strategy.md` §7.2), which
changes three things about this section:

- **It is not fixed for the process's lifetime.** A launch arg is written once; a lease is three
  numbers the Director can move at any time. `granted` is the ceiling the scheduler may use,
  `requested` is what the Director wants it to converge to.
- **The scheduler writes `held` itself**, in its own state file — what it is actually using right
  now. The Director never writes it. `held > requested` during a shrink is a normal transient,
  not an error.
- **Shrinking is the drain protocol in §7, reused.** The Director lowers `requested` and does not
  pre-empt anything; the scheduler stops launching new batches and lets in-flight work land, then
  lowers `held`. Nothing in flight is ever corrupted, and the Director stays ignorant of what
  "in flight" means. See `reference/rationale.md` §5 for why revocation landed at this boundary
  rather than inside the pipeline.

The other half of the contract is what the scheduler advertises upward. It publishes
`candidates` — **tiers**, not one bid (`specs/manager-contract.md` §5). A scheduler offering only
"give me 4096 GB" cannot be told it has 512, and is invisible to the allocator's saturation
detection. Its `transition` field is `{ startSec, stopSec }`: the prep window in §6 and the drain
window in §7, in seconds. That is what makes a well-prepped target sticky — the Director will not
move RAM away from it unless the gain pays back the re-prep. There is no hysteresis constant
here, and none should be added.

---

## 9. Gotchas

1. **`ns.exec` returns 0 on failure.** A batch with 3 of 4 ops launched is worse than no
   batch — it actively de-preps the server. Check all four; kill the partial set.
2. **Identical args = exec refuses to launch a duplicate.** Pass a monotonic `batchId` as the
   last arg to every worker.
3. **Workers must be minimal.** One `ns.hack(ns.args[0], {additionalMsec: ns.args[1]})` and
   nothing else. Per-thread RAM: hack **1.70 GB**, grow **1.75 GB**, weaken **1.75 GB**. A
   stray `ns.getServer()` in a worker adds 2 GB × threads.
4. **Cores only help on `home`.** `ns.weakenAnalyze(1, cores)` and grow both benefit; pservs
   are always 1 core. Pass the right `cores` or you will oversize weakens on home and
   undersize them elsewhere.
5. **`hackChance < 1`.** A failed hack steals nothing and adds no security — grow overshoots
   (clamped, harmless) and W1 over-weakens (clamped, harmless). Structurally safe, but the
   income model must multiply by `hackChance`. Below ~0.9, prep isn't done or the target is
   too high.
6. **Save/reload and backgrounded tabs desync everything.** Tier 2 covers it; expect it to
   fire.
7. **`Date.now()` is free** (plain JS, no ns RAM cost). Useful for instrumentation in workers.
8. **Verify the Formulas API RAM cost** before budgeting the scheduler. `ns.getServer()` is
   2 GB; the scheduler is a single instance so this is fine, but confirm.
9. **Integer milliseconds throughout.** Float drift in `additionalMsec` is small but free to
   avoid.

---

## 10. Build order

**v0 — plumbing and measurement.** Naive loop-based `prep.js` plus a single-target
continuous weaken/grow/hack script. Zero timing math. Proves exec plumbing, arg passing,
RAM accounting.

Plus the one experiment everything else depends on: **measure launch jitter.** Pass each
worker a `Date.now()` stamp taken at exec time; have it record `Date.now()` on its first line
and report the delta. Run a few hundred times under realistic script load. Take the p99
spread — that number sets `g`, and `g` sets everything else.

**v1 — correctness in isolation.** Prep as a computed 3-op batch, plus a **non-overlapping**
batcher (`P = 4t + 3g + margin`, one batch at a time). Roughly 1/20th the income of a real
batcher, but nearly impossible to desync. Validates every piece of the timing math with no
interaction effects.

**v2 — overlap.** Add the fixed landing grid, the `S` phase solve, the `f` sweep, `maxInFlight`,
the pre-launch guard, and the two-tier repair/drain path.

**v3 — the layer above.** Multi-target, RAM allocation across hosts, target selection and
abandonment. This is where the ports/files coordination layer earns its keep.

The v1→v2 jump is where the complexity actually lives. Getting v1 correct first means that
when v2 misbehaves, you know it's the overlap and not the math.

---

## 11. Open / deferred

- Detection of a competing script hacking the same target (§7).
- Formulas API RAM cost (§9.8).
- Whether `GROW_PAD = 1.10` is right — should be measured once the pipeline runs.
- Lookahead launch queue, if measured jitter makes JIT too lossy (§7 currently JIT).
- Everything in v3: target selection, cross-host RAM brokering, the inter-layer protocol.
