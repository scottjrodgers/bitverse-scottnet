# Work Package Spec — Hacking Subsystem

Refer to `engineering-standards.md`, `data-contracts.md`, and `spec-logging.md`. Depends on `coordinator.js` (reads `budgets.hacking.ramBytes`), `coordinatorlib.js` (reuses a RAM-budget-capping helper — see below), and `logginglib.js` (operational event logging — see Logging section below). Assumes Formulas.exe is owned (confirmed, granted permanently by a Source-File) — the batch math section below uses it directly rather than the approximation functions. Written as a complete, standalone spec — do not assume any prior hacking-related code exists; this document is sufficient on its own to implement the subsystem.

## Purpose

The core money/XP engine: continuously runs precisely-timed Hack→Weaken→Grow→Weaken batches, pipelined (many batches in flight concurrently per target, not one at a time), against multiple targets simultaneously. This is the highest-value income source available and the one most sensitive to correct implementation — a timing or thread-count bug doesn't just underperform, it can actively degrade a target's state (security climbs, money craters) and stay degraded indefinitely if nothing catches it.

## Why Batching, Not a Simpler Loop

Three approaches exist, in increasing order of complexity and payoff: a single self-contained script per thread that checks server state and decides hack/grow/weaken on the fly (simple, RAM-inefficient, wastes most of its cycle time on repair rather than extraction); separate always-looping hack/grow/weaken scripts split across threads at a fixed ratio (simpler than batching, reasonably RAM-efficient, a legitimate middle ground); and precisely-timed HWGW batches pipelined so hacks land every few hundred milliseconds instead of once per full cycle (hardest to implement correctly, but gives the highest income per unit of RAM). This spec is for the third approach — the payoff is worth the complexity, but it's also why the drift-handling and atomic-dispatch requirements below aren't optional extras, they're what makes batching viable at all over long unattended runs.

## Files

- `worker-hack.js`, `worker-grow.js`, `worker-weaken.js` — minimal, RAM-cheap scripts, each doing nothing but `sleep(delay)` then calling the corresponding `ns` action on a target. Args: `[target, delayMs]`.
- `hackinglib.js` — shared library (see Algorithm below for exact function contracts): network scanning/rooting, target ranking, batch math, RAM-donor discovery, atomic multi-action dispatch, drift detection.
- `prep.js` — brings a single target to minimum security / maximum money. Batches assume this starting state; skipping it produces miscalibrated first batches.
- `batcher.js` — the daemon: reads config and its RAM budget, selects targets, preps them, then loops dispatching staggered batches.

## In Scope

### Network & RAM discovery
- `scanAll(ns)` — recursive BFS/DFS from `home` via `ns.scan()`, returns every reachable hostname except `home`.
- `rootAll(ns, servers)` — for each unrooted server, opens every port for which the corresponding cracker program (`BruteSSH.exe`, `FTPCrack.exe`, `relaySMTP.exe`, `HTTPWorm.exe`, `SQLInject.exe`) exists on `home`, then `ns.nuke()`s if the open-port count meets the requirement and hacking level is sufficient. Returns the list of servers with root access (previously rooted + newly rooted this call).
- `getRamDonors(ns, rootedServers)` — returns `{host, total, free}` for `home`, every purchased server, and every rooted server with `maxRam > 0`, sorted descending by `free`.
- **Budget capping (new — depends on `coordinatorlib.js`):** before use, the raw donor list from `getRamDonors` must be capped to `budgets.hacking.ramBytes` total. Implement as a `coordinatorlib.js` export, `capToBudget(ramMap, budgetBytes)`, reusable by any subsystem that spawns worker scripts across multiple servers — not hacking-specific logic, belongs in the shared budget library, not `hackinglib.js`. Algorithm: iterate the sorted donor list, accumulate `free` until the running total would exceed `budgetBytes`, truncate the server that crosses the line to exactly the remaining allowance, drop every server after it from this cycle's donor list.

### Target selection
- `getTargets(ns, rootedServers)` — filters to servers with `maxMoney > 0` and `requiredHackingLevel <= player's current hacking level`.
- `rankTargets(ns, targets)` — score `= maxMoney / weakenTime`, descending. This is a simple $/sec-at-full-steal proxy, not a RAM-efficiency-adjusted score — flagged explicitly as a candidate future refinement, **out of scope for v1** (see below).
- Read `config.subsystems.hacking.numTargets` for how many top-ranked targets to run simultaneously. Re-read this live each time target selection runs (see Out of Scope for how often that is).

### Batch math (the part most worth getting right)

**Confirmed: Formulas.exe is owned, permanently, via a Source-File. Use it — this is not scope creep, it's the more correct implementation given it's available**, and it fixes a real limitation of the approximation functions, not just a precision nicety: `hackAnalyze`/`growthAnalyze`/`weakenAnalyze` implicitly operate on the target's *current live state*, which means `calcBatch()` only produces correct numbers if the server happens to actually be at prepped baseline at the exact moment it's called. Formulas.exe's `ns.formulas.hacking.*` functions instead take an explicit `Server` object, which means thread counts can be computed against a *hypothetical* prepped state — clone the real server object (`ns.getServer(target)`), force `hackDifficulty = minDifficulty` and `moneyAvailable = moneyMax` on the clone, and compute against that — regardless of what the live server's security/money actually are at call time. That removes one source of miscalibration outright rather than just tightening it.

`calcBatch(ns, target, hackFraction, spacer)`:
- Build the hypothetical prepped server object as above.
- `hackThreads` — via `ns.formulas.hacking.hackPercent(preppedServer, player)` (exact fraction stolen per thread against the prepped state), sized to steal `hackFraction` of max money, capped at ≥95% per batch as before (that safety margin is about protecting against a bad `hackFraction` config value, not approximation error, so it stays regardless of which math backend is used).
- `growThreads` — via `ns.formulas.hacking.growPercent(preppedServer, threads, player, cores)` (note: this one is typically solved for threads given a target multiplier rather than the reverse, so may need a small search/iteration rather than a single direct call — confirm the exact signature in-game, see confidence note below).
- `weaken1Threads`, `weaken2Threads` — security-per-thread from weaken is not affected by server state the same way hack/grow are, so `ns.weakenAnalyze(1)` remains fine to use here; no Formulas.exe equivalent is needed for this part.

**What Formulas.exe does *not* fix:** actual execution timing (`hackTime`/`growTime`/`weakenTime`) is still determined by the server's *real* security at the moment each worker script actually calls its action, after its sleep — not by the hypothetical prepped state used for thread-count math. The drift watchdog, atomic dispatch, and spacer buffer are all still load-bearing; Formulas.exe removes miscalibration risk from the thread-count side, not the live-timing side. Worth being precise about this so the design doesn't get read as "Formulas.exe means drift-handling is no longer needed" — it isn't related.
- **Timing** — derived from first principles, not a remembered formula (worth restating the derivation here so whoever implements this understands *why*, not just copies four numbers): completion order must be Hack → Weaken1 → Grow → Weaken2, each `spacer` ms apart. Using `base = weakenTime` (the longest of the three action durations) as a reference point that guarantees every computed delay is non-negative:
  ```
  delays.hack     = weakenTime - hackTime
  delays.weaken1  = spacer
  delays.grow     = weakenTime - growTime + 2*spacer
  delays.weaken2  = 3*spacer
  ```
  Each worker script sleeps for its assigned delay, then calls its action — `hackTime`/`growTime`/`weakenTime` are read fresh via `ns.getHackTime`/`getGrowTime`/`getWeakenTime` at the moment `calcBatch` is called for that specific batch dispatch, not cached from an earlier read.

### Dispatch cadence & pipelining (previously underspecified — now explicit)

This is the actual throughput lever, and it was described too loosely in the first pass of this spec ("loops dispatching staggered batches") — worth being precise, since it's the entire reason batching beats a simpler loop. Per-batch thread counts are calculated (previous section), not maximized; what *should* scale up to consume available RAM is how many of these correctly-sized batches run concurrently per target.

Rule: track `nextAllowedDispatch[target]`, initialized to `0`. On each pass through the main loop, for every active target where `now >= nextAllowedDispatch[target]` and the atomic-dispatch check (below) succeeds, launch a batch and set `nextAllowedDispatch[target] = now + 4*spacer`. `4*spacer` is the minimum safe gap between successive batch *dispatches* against the same target — it's derived from the same completion-order spacing used inside a single batch (four actions, `spacer` apart each), ensuring one batch's four actions don't land in a window that overlaps the next batch's four actions.

This means the number of batches simultaneously in flight against one target is naturally `~weakenTime / (4*spacer)` — for a target with a 60-second weaken time and a 200ms spacer, that's roughly 75 concurrent batches, RAM permitting. The main loop should keep attempting dispatch every pass (bounded by its own tick rate, not by `4*spacer` directly — the loop can run faster than that and simply find nothing eligible to dispatch on ticks where every target's `nextAllowedDispatch` hasn't arrived yet) until the RAM budget for this cycle is exhausted, at which point remaining eligible targets simply wait for the next tick when some RAM has freed up. **This is the explicit fix for the gap flagged earlier**: the daemon should be continuously trying to saturate its RAM budget across all active targets, not dispatching once per target per loop and moving on.

### Prep
- `prep.js`: loop — if security > min + 0.5, weaken (using enough threads to close the gap, via `getRamDonors` capped to budget); else if money < 99% of max, grow; else done. Sleep for the relevant action's duration between iterations, not a fixed short interval — no point polling faster than the action can possibly complete.

### Atomic dispatch (prevents the main failure mode)
A batch is four separate `ns.exec()` calls (hack, weaken1, grow, weaken2), each of which needs to find RAM somewhere. If three succeed and the fourth can't find room, the target is left in a state batch math didn't account for, and every subsequent batch against it compounds the error. Required pattern:
- `planThreads(threads, scriptRam, ramMapScratch)` — planning only, no `ns.exec`. Mutates a scratch copy of the RAM map as if the threads were placed, returns the placement list or `null` if it doesn't fully fit.
- `commitPlacements(ns, script, placements, argsBuilder)` — actually executes a previously-successful plan.
- Dispatch sequence per batch: clone the (budget-capped) RAM map, plan all four actions against the same evolving scratch clone, and only call `commitPlacements` for any of them if **all four** planned successfully. If any one doesn't fit, launch nothing for that target this cycle — don't half-fire.

### Drift watchdog (prevents silent long-run decay)
- `isDrifted(ns, target, secTolerance, moneyToleranceFraction)` — `true` if current security exceeds `minSecurity + secTolerance`, or current money is below `maxMoney * moneyToleranceFraction`. Suggested defaults: `secTolerance = 5`, `moneyToleranceFraction = 0.75` — generous enough not to fire on routine in-batch fluctuation, tight enough to catch real divergence.
- Checked before every dispatch decision per target. If drifted, pause new batches to that target, run `prep.js` against it in the background (non-blocking — other targets keep dispatching normally), resume once prep completes.

### Status reporting
Write `/data/status/hacking.json` each cycle per the common schema (`schemaVersion`, `updatedAt`, `healthy`, `lastError`, `moneyPerSec`) plus `activeTargets` (array of hostnames), `driftEvents` (count since daemon start), `batchesInFlight` (rough estimate — count of dispatches since last completion horizon, doesn't need to be exact).

### Logging (via `logginglib.js` — see `spec-logging.md`)

Two tiers, deliberately kept separate because they have different RAM-cost implications:

**Daemon-level (always on, no extra RAM cost per worker)** — logged from `batcher.js` itself, which already pays its own fixed RAM cost regardless: `logEvent(ns, "hacking", "batch_dispatched", {target, hackThreads, growThreads, weaken1Threads, weaken2Threads, hackFraction, spacer, predictedMoneyStolen})` on every successful dispatch; `"batch_skipped_ram"` when atomic dispatch fails to place all four actions; `"drift_detected"` / `"drift_repaired"` from the watchdog; `"prep_started"` / `"prep_completed"` per target. Additionally, once per some slower interval (e.g. every 30-60 seconds, not every dispatch), log a `"target_snapshot"` event with the target's actual current security/money — this is what lets a downloaded log answer "was this target actually staying near baseline over the whole run," without needing per-action worker reporting.

**Worker-level (opt-in via `config.subsystems.hacking.detailedLogging`, off by default)** — when enabled, `worker-hack.js`/`worker-grow.js`/`worker-weaken.js` also call `logEvent` after their action completes, reporting the actual result (`ns.hack()`/`ns.grow()`/`ns.weaken()` all return a value — actual money stolen, actual growth multiplier applied, actual security reduced) alongside what `calcBatch()` predicted for that specific dispatch (passed through as extra worker args). This is the data that would let a future analysis pass compare Formulas.exe's predictions against real outcomes — genuinely valuable for tuning, but it adds `logginglib.js`'s RAM cost to every worker instance, which multiplies by however many concurrent batches are in flight. Leave it off for normal operation; turn it on for a bounded diagnostic session when you actually want to download and share that level of detail.

Every logged event's `fields` should be self-explanatory without needing to read the code — the whole point is that these logs are meant to be handed back for analysis by someone (me, or a future Claude Code session) without additional context.

## Out of Scope (do not build these here)

- RAM-efficiency-adjusted target scoring (score weighted by $/GB, not just $/sec) — the simple `maxMoney / weakenTime` proxy is sufficient for v1; don't add a more sophisticated formula unless asked.
- Re-scanning/re-rooting the network every single dispatch tick — this was a known inefficiency in earlier prototyping. Scan/root on a slower cadence (e.g., once every 10-20 dispatch cycles, or on a fixed timer like every 30 seconds) and cache the result in between, since new servers don't appear that often.
- Any coordination with `stock-trader.js`, `gang-manager.js`, etc. beyond reading its own RAM budget from `coordinator.js` — hacking doesn't need to know anything about other subsystems.

## Verify Script — `verify-hacking.js`

Non-destructive by default, but exercises real batch dispatch against exactly one target so timing behavior can be confirmed against real game state (not just planning logic in isolation). Should be run, then left to observe for several batch cycles before trusting the result.

```
CHECK: ns.fileExists("Formulas.exe", "home") = <bool> (expected: true)
CHECK: raw output of ns.formulas.hacking.hackPercent(preppedServer, player) = <X>
       -- compare against ns.hackAnalyze(target) as a sanity cross-check, should be close
CHECK: budgets.hacking.ramBytes read from /data/budgets.json = <X> GB
CHECK: top-ranked target selected = <hostname>, score = <X>
CHECK: target is prepped? security <X>/<min>, money <X>%/max  -- runs prep.js first if not
CHECK: calcBatch() output for this target -- print hackThreads, growThreads,
       weaken1Threads, weaken2Threads, delays.{hack,weaken1,grow,weaken2}, batchDuration
CHECK: dispatching one batch now... all 4 actions planned successfully? <bool>
[waits until batchDuration + spacer has elapsed]
CHECK: post-batch security = <X> (expected: back near minimum)
CHECK: post-batch money = <X>% of max (expected: back near 100%)
CHECK: isDrifted() after this one batch = <bool> (expected: false)
```

**Expected output when correct:** all four thread counts are positive integers, all four delays are non-negative numbers, the "planned successfully" check reads `true`, and after waiting out the batch duration, security and money are both back near their prepped baseline — the direct, observable signature of correct timing. If security saw-tooths wildly or money doesn't recover, the timing or thread math has a real bug, not a tuning issue — this is meant to catch that before running multi-target and multi-batch pipelining on top of it.

## Acceptance Criteria

1. `verify-hacking.js`'s single-batch test shows security and money back near baseline after one batch completes.
2. `batcher.js` run with `numTargets: 1` for several consecutive batch cycles (not just one) shows stable security/money oscillating near baseline in `/data/status/hacking.json`'s implied state, not diverging over time.
3. Deliberately reducing `budgets.hacking.ramBytes` mid-run (edit `budgets.json` by hand, or via `coordinator.js` if that's already running) results in `batcher.js` reducing its concurrent batch count accordingly rather than erroring or ignoring the new ceiling.
4. Manually corrupting one target's state (e.g., running a stray `ns.hack()` against it from the terminal to desync it) triggers a logged drift event and a re-prep within a reasonable number of cycles, without other targets' batching being interrupted.
5. Only after 1-3 are confirmed stable should `numTargets` be increased beyond 1 — this mirrors the same "verify single-target before trusting multi-target" caution from earlier prototyping, now made a formal acceptance gate rather than a suggestion.

## Confidence Notes

- **High confidence** on the timing derivation — it's algebra derived from the stated completion-order constraint, not a remembered source, and was cross-checked against the game's own documentation on batch timing (hack finishes first, weakens must complete after the action that raised security, 20-200ms spacer range, anything under 20ms unreliable due to JS timer limitations).
- **High confidence** on the atomic-dispatch and drift-watchdog necessity — these address a real, previously-identified failure mode (partial batches silently corrupting target state), not speculative robustness.
- **Medium confidence** on the suggested `secTolerance`/`moneyToleranceFraction` defaults and the scan/root caching interval — reasonable starting points, expect to tune empirically once real behavior is observed, the same way `spacer` itself should be tuned down from a safe default only after confirming stability.
- **Medium confidence on exact `ns.formulas.hacking.*` function signatures** — I'm confident the namespace and general capability exist (exact analytical hacking-percent/grow-percent/time functions taking `Server`/`Player` objects), less confident on exact parameter order and whether `growPercent` solves directly for threads-given-multiplier or needs to be searched/iterated. `verify-hacking.js` should print the raw signatures/return shapes of each Formulas.exe call it makes before the main daemon relies on them, same uncertainty-handling rule as everywhere else in this project — don't let a wrong assumption about parameter order silently produce wrong thread counts.
