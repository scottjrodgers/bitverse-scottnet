# Hacking Pipeline Design



*Key, enabling insight: hack(), grow(), and weaken() all take an optional parameter of additional milliseconds.  This allows us to launch all four jobs in a HWGW batch at the same time, and have them land at a predictable time.  This is because the durations are calculated based on the server environment at the time of the call.  The additional milliseconds parameter will be added to the calculated duration.  So the system won't be determining the durations of each call at different times in the cycle.*

## The Three Key Mechanics for Hacking:

The three core hacking operations: `hack`, `grow`, and `weaken` have three common mechanics.

Each of these operations take several seconds.  The exact duration depends on some constants associated with the target server and the current security level for the target server.  A lower security level makes it take less time, and keeping that at or near the server's minimum security is a good strategy.

- The first key mechanic is this: **the duration of the operation is calculated based on the state of the target server at *the time the operation is triggered***. 

Of the operations, `hack` is the fastest and `weaken` is the slowest.  The second key mechanic is that:

- **Their durations are directly related**
  - Hack's duration is computed based on the constants and security level.  We'll call this hack duration, $\mathbf{t}$
  - Weaken's duration is exactly $(\mathbf{4 \cdot t})$
  - and Grow's duration is exactly $(\mathbf{3.2 \cdot t})$

Then, based on the conditions on the server each of these operations carry out an action.  The `hack` command steals a portion of the servers money and adds it to the player's balance.  As a result, the money on the server is reduced by the same amount, and, since this was a hack, the server's security level is raised in response.  Weaken is sequenced after the *hack* and *grow* steps because they both raise the security level up from the minimum.  The `weaken` command simply lowers the security on the server, ideally back to the minimum level we want to maintain while executing the hacking pipeline.  The _hack_ operation lowered the money available on the server when it was executed, and since hack steals a percent of the available money, we want to keep that as high as possible, ideally the maximum allowed for the server.  The `grow` command helps us do that. It raises the amount of money registered on the server by an amount we can calculate, and also raises the security level in the process.

- The third key mechanic is this: **the amount hacked, grown, or weakened by the corresponding operations is calculated based on the state of the target machine _at the end of the built-in wait time_**.  

This means that the effect of the operation is based on what the target machine looks like as it completes, while the wait time depends on the state of the target machine when it starts.  And this is enough context for us to be able to clearly state our objective.

## Objectives: 

Three core requirements:

**R1: Produce an automated scheduler that maintains a high rate of income / second, while staying efficient in RAM usage.**

**R2: Target server security level is at its minimum when *hack* is called, and when *grow* is called.**

**R3: Target server available money is at its maximum when hack is called.**



## Approach

I'll be building up the approach bit-by-bit, showing partial solutions and the issues they raise or create.  Then we'll address those until we have a robust solution.

### Recap of the Process

The batch pipeline attacking a single server consists of a repeating sequence with the pattern: hack, weaken, grow, weaken.  This process is intended to operate starting with a target server's security level being at its minimum and its money supply at the maximum level.

1. The `hack` action steals some portion of the money on the server, and as a result, it raises the server's security level.

2. The first `weaken` action then returns the target's security level back to the minimum.

3. Next, a `grow` action is performed, which raises server's money supply back to the maximum, but also raises the security level in the process.

4. The second `weaken` action then returns the target's security level back to the minimum once again, allowing the next batch to start in the intended state.

### Example 1:

Let's assume that hackTime is 4.  Then weaken would take 16, and grow would take 12.8, rounded to 13.  We'll set $g$ to 2, and $P$ to 9 to leave a bit of extra room between batches.  The first hack would complete at $t=15$

```text
Time=>                        1 1 1 1 1 1 1 1 1 1 2 2 2 2 2 2 2 2 2 2 3 3 3 3 3 3 3 3 3 3 4 4 4 
            1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 
                                        |                 |                 |                   
Batch 1: H:                     ========X                 |                 |                   
        W1: ================================X             |                 |                   
         G:           ==========================X         |                 |                   
        W2:         ================================X     |                 |                   
Batch 2: H:                             |         ========X                 |                   
        W1:                   ================================X             |                   
         G:                             ==========================X         |                   
        W2:                           ================================X     |                   
Batch 3: H:                             |                 |         ========X                   
        W1:                             |       ================================X               
         G:                             |                 ==========================X           
        W2:                             |               ================================X       
```

Notice at $t=20$, when batch 2's *hack* operation starts, that batch 1 will have just finished a _grow_ operation and not yet finished the corresponding weaken command.  At $t=20$, the systems security will be above the minimum level that we're counting on for our efficiency and timing correctness.

### Example 2:

Let's try it again and just add a bit more time to the period.  We'll set $P=10$.

```text
Time=>                        1 1 1 1 1 1 1 1 1 1 2 2 2 2 2 2 2 2 2 2 3 3 3 3 3 3 3 3 3 3 4 4 4 
            1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 
                                        |                   |                   |               
Batch 1: H:                     ========X                   |                   |               
        W1: ================================X               |                   |               
         G:           ==========================X           |                   |               
        W2:         ================================X       |                   |               
Batch 2: H:                             |           ========X                   |               
        W1:                     ================================X               |               
         G:                             | ==========================X           |               
        W2:                             ================================X       |               
Batch 3: H:                             |                   |           ========X               
        W1:                             |           ================================X           
         G:                             |                   | ==========================X       
        W2:                             |                   ================================X      
```

This time the first issue shows up even sooner.  At $t=16$, batch 2's _grow_ operation needs to start and batch 1 will have just finished a _hack_ operation and not yet completed the corresponding _weaken_ operation.  Again the security will be at a higher level than we're counting on.  Fortunately there is a fairly simple fix.

## The Mechanic that this Solution Rests Upon

Deep in the documentation, for the `BasicHGWOptions` interface, the setting `additionalMsec` is explained as "the number of additional milliseconds that will be spent waiting between the start of the function and when it completes.  Defaults to zero."  This is different than a script sleeping to the appropriate time and then calling the operation, ***it allows us to increase the internal wait time for the operation.*** We can add additional time to each operation so they can all start at the exact same time, which insures that their timings will be based on the same system state.  Furthermore, we can add a bit extra to let us choose exactly when it triggers.  The ideal time would be a timeframe where previous batches have left the system with minimum security and maximum available money. 

Let's try it again, but scaling it down by 2x. 

### Example 3:

Let's assume that hackTime is 2.  Then weaken would take 8, and grow would take 6.4, rounded to 6.  We'll set $g$ to 1, and $P$ to 5 to leave a bit of extra room between batches for future batches to launch.  

```text
Time=>                        1 1 1 1 1 1 1 1 1 1 2 2 2 2 2 2 2 2 2 2 3 3 3 3 3 3 3 3 3 3 4 4 4 
            1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 
            . |       . |       . |       . |       . |       . |       . |       . |       . |
Batch 1: H: +-----------------====X       . |       . |       . |       . |       . |       . |
        W1: +-------================X     . |       . |       . |       . |       . |       . |
         G: +-------------============X   . |       . |       . |       . |       . |       . |
        W2: +-----------================X . |       . |       . |       . |       . |       . |
Batch 2: H: . |       +-----------------====X       . |       . |       . |       . |       . |
        W1: . |       +-------================X     . |       . |       . |       . |       . |
         G: . |       +-------------============X   . |       . |       . |       . |       . |
        W2: . |       +-----------================X . |       . |       . |       . |       . |
Batch 3: H: . |       . |       +-----------------====X       . |       . |       . |       . |
        W1: . |       . |       +-------================X     . |       . |       . |       . |
         G: . |       . |       +-------------============X   . |       . |       . |       . |
        W2: . |       . |       +-----------================X . |       . |       . |       . |
Batch 4: H: . |       . |       . |       +-----------------====X       . |       . |       . |
        W1: . |       . |       . |       +-------================X     . |       . |       . |
         G: . |       . |       . |       +-------------============X   . |       . |       . |
        W2: . |       . |       . |       +-----------================X . |       . |       . |
Batch 5: H: . |       . |       . |       . |       +-----------------====X       . |       . | 
        W1: . |       . |       . |       . |       +-------================X     . |       . | 
         G: . |       . |       . |       . |       +-------------============X   . |       . | 
        W2: . |       . |       . |       . |       +-----------================X . |       . | 
Batch 6: H: . |       . |       . |       . |       . |       +-----------------====X       . | 
        W1: . |       . |       . |       . |       . |       +-------================X     . |
         G: . |       . |       . |       . |       . |       +------------============X    . |
        W2: . |       . |       . |       . |       . |       +----------================X  . |    
```

Now, everything lines up nicely.  All operations in a single batch launch simultaneously so they're certain to be consistent within the batch.  And, we've timed it so that there is extra time after the 2nd weaken of one batch and the hack from the next batch.  That extra wide period will have the server with maximum available memory becaue of the grow and minimum security because of the last weaken.  We time the launching of the future batch to occur in the middle of that time gap.



## Implementation Details

Next we'll take a look at the particulars to implement this batch scheduler.  And I'll start with a list of questions we'll need to answer or address.

1. What should I use for `gap` and `period`?  How does one choose or calculate the right values?
2. How do I calculate the `additionalMsec` for each of the four operations in a batch?
3. What is the maximum amount of RAM used by the overlapping batches?  How do we make the best use of a certain amount of memory?
4. How do we estimate the earnings for a set of batches on a specific server for a given amount of RAM?
5. How do we deal with increasing hack skill level, which reduces the hack time?
6. How do we deal with the security level of the server being raised outside of this sequence of batches?
7. How to we get the server to the ideal starting conditions for this batch sequencer -- minimum security and maximum available money?



### Q1. What should I use for `gap` and `period`?  How does one choose or calculate the right values?

We want `gap` to be nice and small, but it can't be too small.  We want gap to be large enough that the chance of a task completing at a different time than is intended is negligible.  Two options for choosing gap:

1. Pick a reasonable gap arbitrarily, and somewhat conservatively.  For example 250 ms or 500 ms would be conservative, I believe.
2. Calculate how small a gap we can get away with.  The following describes how to calculate a minimum gap.

I'm going to start with a gap >= two standard deviations of timing error.  Maybe more than 2 sigma would be necessary.  Also, it needs to be larger than the in-game timer resolution with I think is something like 10 ms.

It should be determined by taking measurements of the margin of error of executing tasks.  For this we need two scripts.

#### Script 1 - the task: timing.js

```javascript
export async function main(ns){
  const id = ns.args[0];
  const server = ns.args[1];
  const t1 = ns.args[2];
  const delay = ns.args[3];
  const t2 = Date.now();
  const lag = t2 - t1;
  await ns.sleep(delay);
  const t3 = Date.now();
  const delta = t3 - t2;
  const err = delta - delay;
  ns.write("timing_log.txt", `${id},home,${t1},${t2},${lag},${t3},${delay},${delta},${err}`, "a");
}
```

#### Script 2 - the driver: timing-driver.js

```javascript
export async function main(ns){
  ns.write("timing_log.txt", `id,server,time1,time2,lag,time3,delay,delta,err`, "w");
  const n_tries=1000;
  for(let i=0; i<n_tries, i++){
    const t1 = Date.now();
    ns.exec("timing.js", "home", 1, 100+i, "home", t1, 1000 + (i % 100) * 10);
  }
}
```

Then the "err" column is our dataset for calculating the sigma.

When I ran this, without much load, the error was either 0 or 1.  So it likely won't be much of a problem.  Still probably shouldn't run a gap much less than 100 ms.

#### Choosing Period

The `period` should be at least 5 x `gap`.  It can be larger, and sometimes it helps to have it larger.

### Q2. How do I calculate the `additionalMsec` for each of the four operations in a batch?

This is the core timing question needed for implementation.  The timing of the sequence is defined by two parameters, $P$ (period) and $g$ (gap).  $P$ represents the period between subsequent batch landing times, meaning when the actions finally execute.

For batch $i$, we calculate $T_i$ which is when the first operation in the batch completes or "lands", and $L_i$ which is when the batch needs to launch.

Calculate the target completion time for the hack in each back based on $T_0$ and muliples of the period.


$$
T_i = T_0 + i \cdot P
$$

The launch time is calculated backward from this, lined up to start halfway between when the final _weaken_ of one batch completes and the _hack_ of the next batch completes, to ensure we have the system context in the ideal zone.
$$
L_i = T_i + \left(\frac{3g + P}{2}\right) - j \cdot P
$$

The value $j$ represents how many periods back this batch much be launched so that it starts early enough and still starts in the appropriate window.   We want $j$ to be as small as possible to minimize the number of batches consuming RAM at the same time.
$$
j=floor \left( \frac{\frac{1}{2}P + \frac{1}{2}g + 4t}{P} \right) + 1
$$

Then for the individual steps

### Q3. What is the maximum amount of RAM used by the overlapping batches?  How do we make the best use of a certain amount of memory?

### Q4. How do we estimate the earnings for a set of batches on a specific server for a given amount of RAM?

### Q5. How do we deal with increasing hack skill level, which reduces the hack time?

### Q6. How do we deal with the security level of the server being raised outside of this sequence of batches?

### Q7. How to we get the server to the ideal starting conditions for this batch sequencer -- minimum security and maximum available money?



## The actual calling of worker tasks

The signature for `ns.exec()` is:

```javascript
ns. exec(script: string, 
         host: string, 
         threadOrOptions?: number | RunOptions, 
         ...args: ScriptArg[]): number;
```

| Argument                 | Notes                                                        |
| ------------------------ | ------------------------------------------------------------ |
| script                   | The name of the script to execute.  It must be the full path.  Remember that if we're running on a host other than "home", the worker scripts need to be copied to other host servers with `ns.scp(...)` |
| host                     | The name of the server on which this command should execute.  It should be selected from the RAM allocations provided by the director. |
| threadOrOptions          | For us, we'll just provide the number of threads to use.  We don't need the rest of the RunOptions data structure. |
| target (Args[0])         | The name of the server targeted by this operation.           |
| additionalMsec (Args[1]) | The number of additional milliseconds to be added to the duration of the call.  This allows us to launch all four operartions in a batch back to back and have them finish (land) when we want them to. |
| batchID (Args[2])        | A batch ID number to group the four operations in a batch    |



## Appendix

| Symbol     | Definition                                                   |
| ---------- | :----------------------------------------------------------- |
| $T_0, T_i$ | The `landing time` of the first call in batch, $i$.  All batches are calculated offset from the original $T_0$. |
| $L_i$      | The `launch time` for batch $i$.  This is calculated backwards from the desired landing time.  It is also timed so that each launch occurs between the last weaken of one batch and the hack of the next batch. |
| $P$        | The `period` of the batch sequence.  It is the time between $T_{i+1}$ and $T_i$.   $P$ should be at least $5 \cdot g$ |
| $g$        | The `gap` between two actions in the HWGW batch.             |
| $t$        | The `duration` of the `hack` action.  This is determined by the target server and server security level at the time of the call.  The duration of a `weaken` action is $4 \cdot t$, and the duration of a `grow` action is $3.2 \cdot t$. |

### Hack, Grow, and Weaken

<Add function declarations Here>

`async hack(host?: string, opts: BasicHGWOptions) -> Promise<number>`





## Claude's HWGW Batching — Design Notes (Part 1)

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
`candidates` — **tiers**, not one bid (`specs/strategy.md` §6.1). A scheduler offering only
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
