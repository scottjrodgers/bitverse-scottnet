# Implementation Plan

**Scope:** getting from the current design docs to a fully implemented, tested automation system.
**Immediate focus:** corporations, because the current objective is **BN3 level 3** — which
unlocks `WarehouseAPI` and `OfficeAPI` for free in every other BitNode (otherwise $50b each in
corp funds).

**Companion docs:** `docs/automation-architecture.md`, `docs/managers/corp.md`,
`docs/specs/manager-contract.md`, `docs/specs/recipe-dsl.md`.

---

## 0. Current save state

Recorded so the plan's assumptions are checkable. Update this when it changes.

| Fact | Value | Consequence |
|---|---|---|
| BitNode | **BN3**, early, little progress | cold start is the correct assumption |
| Source-Files | **SF1.3, SF2.3, SF3.2, SF4.3, SF5.1, SF6.1, SF9.1** | see below |
| Existing corporation | one running; **expendable** | dispose of it before running the round 1 recipe (§2) |
| Objective | **SF3.3** | `WarehouseAPI`/`OfficeAPI` free in every other BitNode |

What each Source-File buys this plan:

- **SF3.2 + currently in BN3** — `WarehouseAPI` and `OfficeAPI` are auto-granted **this run**, because
  the grant condition is `bitNodeN === 3 || activeSourceFileLvl(3) === 3`. They are *not* granted in
  other nodes until SF3.3, which is the whole point of this run.
- **SF4.3** — Singularity at its lowest RAM cost. `factions`, `augs`, `karma` and `sleeves` all get
  much cheaper than their manager docs assume; treat their Singularity-RAM warnings as resolved.
- **SF5.1** — `ns.getBitNodeMultipliers()` is available, so BitNode penalties can be **read directly**
  rather than inferred (§6). Also appears to re-grant **Formulas.exe after every install**, which
  removes it from the per-cycle bootstrap tax. *Verify once.*
- **SF9.1** — Hacknet Servers and hashes available in every node. Two levers are live *now* rather
  than hypothetical: `Sell for Corporation Funds` (100 hashes → $1e9 corp funds) and
  `Exchange for Corporation Research` (200 hashes → 1000 RP to **all** divisions).
- **SF2.3** — gang available at karma ≤ −54,000; karma persists across installs.
- **SF1.3** — home RAM starts at **32 GB** on BitNode entry. Home RAM is genuinely tight right now,
  so the Phase 0 RAM measurement is load-bearing, not a formality.

---

## 1. Constraints and decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Toolchain | **External git repo, plain JS**, synced to the game folder | Already in place; keeps pure functions runnable in Node for unit tests |
| Type safety | **`// @ts-check` + JSDoc against `NetscriptDefinitions.d.ts`** | Catches the one bug class that matters most (see §2) with no build step and no new language |
| Sequencing | **Corp first**, hacking managed by hand for now | BN3 seed money makes the corp free in cash — it costs time, not money |
| Director | **Stub from day one**, real one later | Corp is written against the real contract immediately; nothing gets rewired |
| Simulator | **Do not build one** | See §3 |
| RAM strategy | **Two scripts** — hot daemon + cold worker | "The shortcut is acceptable"; measured, not guessed |
| Contracts | **Framework only, never a solver** | Hand-coding the solutions is the point |

### The one bug class worth designing against

The corp API is ~100 functions with nested object shapes. A mistyped property name returns
`undefined`, which propagates silently into a formula and produces a **wrong number rather than
an error**. That is exactly the failure that costs a corporation, and it is the one thing type
checking is best at catching. Hence `@ts-check`.

---

## 2. Testing strategy

Corp is unlike everything else in one specific way: **round 1 happens once per corporation.**
You cannot iterate by playing. So the plan is organised around knowing it works *before* firing
it.

Four levers, in build order:

1. **Pure-function extraction + Node unit tests.** All the math is pure. Highest value, lowest
   cost, and it requires nothing from the game.
2. **Advisory mode.** Policy returns an action list; advisory mode simply does not execute it.
   Free, because of the layering in §4.
3. **Conformance harness.** Every cycle, compute predictions from `lib/` and diff against
   observed game values; log divergence. Validates the formula library against reality and then
   stays on permanently as the health monitor.
4. **The corp restart loop.** This is the thing that makes rounds 1–2 tunable at all.

### The restart loop

If round 1's offer comes in short, **do not accept it**. Go public, sell all shares, sell the
CEO position, restart. In BN3 a seed-funded restart costs $150b; a successful round 1 yields
~550b. So several iterations are affordable, and "one irreversible shot" becomes a real
edit-run-measure loop.

*(A self-funded corp restarts for only $50b — relevant outside BN3.)*

---

## 3. Why not a simulator

Tempting, and explicitly rejected:

- It would **share formula code** with production, so a bug in `RawProduction` passes its own
  tests — the worst kind of green suite.
- It **drifts on every game update**, and the corp system is actively reworked.
- **Bonus time already makes real runs fast** — 400 cycles at 1s ≈ 7 minutes. Rounds 1–2 are
  ~130 cycles to the first offer, well inside a single accumulated bonus-time budget.

Revisit only if round-3+ tuning proves iteration-bound. The manual's headless mode (its §22–23)
is the escape hatch if it comes to that.

---

## 4. Repo layout

```
scripts/                       synced to the game via the Remote API (filesync)
  lib/       pure functions, ZERO ns dependency   -> unit tested in Node
  data/      generated constants, committed        -> industry factors, sizes, costs
  io/        thin ns wrappers                      -> the ONLY place ns.corporation appears
  policy/    recipes + allocators                  -> snapshot in, action list out
  daemon/    long-running scripts (managers, watchdog)
  tools/     one-off in-game scripts (RAM measurement, data generation)
  NetscriptDefinitions.d.ts
test/                          Node test runner; imports ../scripts/lib/...
src/                           Python utilities, NOT run in-game
docs/                          these documents
```

**`lib/` lives under `scripts/`, not beside `test/`.** The daemons import the formulas at
runtime, so the files must sync to the game. Node tests reach across the boundary with relative
imports. `jsconfig.json` sets `baseUrl: "./scripts"` so in-game-style imports
(`import {...} from "lib/corp/formulas.js"`) resolve in the editor too.

`src/` is reserved for Python tooling and holds no JavaScript.

### The decision that does most of the work

> **Policy functions take a state snapshot and return a list of intended actions. They never
> call `ns`.**

Three consequences fall out of that single choice:

- Policy is **unit-testable** with synthetic snapshots — including hostile ones (zero funds,
  penalized BitNode, congested warehouse).
- **Advisory mode is free** — don't execute the returned list.
- The **conformance harness has something concrete to compare against**.

`io/` executes action lists and is the only layer that can fail at runtime. Keep it dumb.

---

## 5. Phases

### Phase 0 — Scaffolding

| Task | Notes |
|---|---|
| Repo layout + sync-to-game | plain JS, per §4 |
| `@ts-check` + `NetscriptDefinitions.d.ts` | editor-level checking, no build |
| `lib/state.js` | read/write JSON state files; see `docs/specs/manager-contract.md` |
| `lib/log.js` | structured append-only logging, `ns.toast` for alerts |
| `daemon/watchdog.js` | restarts any manager whose `lastRun` goes stale |
| **Stub Director** | writes a static `director.json` — phase, cash fractions, RAM lease |
| `tools/ram-costs.js` | loop every corp function name, print `ns.getFunctionRamCost("corporation.<fn>")` |
| **`src/pull-data.py`** | **pull `/logs/` and `/state/` back OUT of the game.** See below. |

### The pull path is not optional

Sync is one-directional: the repo pushes into the game. Nothing brings runtime state back. Every
phase from 2 onward — the conformance harness, verify output, congestion diagnosis, tuning the
round 3+ allocator — depends on *reading what the game produced*, and copy-pasting terminal
output by hand does not scale past the first few iterations.

Build a small Node or Python CLI that connects to the Remote API (same host/port as the push
sync, its own config file) and mirrors `/logs/` and `/state/` into a local directory. Speak
JSON-RPC 2.0 directly — `getFileNames`, `getAllFiles`, `getFile` — rather than pulling in a
client library. Print files and byte counts per run so a fresh pull is distinguishable from a
stale one, and fail loud and non-zero on connection failure rather than retrying; it is manually
invoked.

Out of scope: watch mode, anything outside those two directories, any parsing, local retention.

**Where it runs matters.** This tool must live on the machine hosting the agent that reads its
output. If the game and the agent are on different machines, this is the piece that has to
bridge them — see `START-HERE.md` §8.

**Exit:** the watchdog restarts a hello-world manager after you kill it, and you have a table of
corp API RAM costs to derive the daemon/worker split from.

### Phase 1 — Corp math library (no game interaction)

| Task | Notes |
|---|---|
| `tools/gen-data.js` | dump industry factors, material sizes, research costs, upgrade base prices to `data/` |
| `lib/corp/formulas.js` | upgrade/warehouse/office cost, warehouse size, production multiplier, raw production, quality, RP gain, valuation, party cost |
| `lib/corp/optimizers.js` | boost-material closed form, with recursive handling of negative results |
| `lib/corp/marketta.js` | potential sales volume, markup multiplier, optimal selling price |
| `test/` | unit tests for all of the above |

**Exit:** tests green, and the boost optimizer reproduces the manual's reference case —
`S = 5250` → `[10518.09, 11742.32, 528368.42, 1703.62]` — in under a millisecond.
*(Confirm which industry's coefficients that reference uses; the surrounding proof uses
Agriculture's.)*

### Phase 2 — Observation before action

| Task | Notes |
|---|---|
| `io/corp/snapshot.js` | read entire corp state into a plain object |
| `daemon/corp-conformance.js` | each cycle: predict from `lib/`, diff against observed, log divergence |
| Run against a **hand-made** corp | create Agriculture manually through the UI |

**Exit:** predictions match observed within tolerance for 100+ consecutive cycles.

**This is the gate.** Nothing after this point is trustworthy without it — every later phase
consumes these formulas.

### Phase 3 — Cycle daemon and always-on services

| Task | Notes |
|---|---|
| State-edge detection | poll ~100ms; handle 1s cycles under bonus time |
| Tea/party service | closed-form party cost; trigger below 99.5 (109.5 post-research) |
| **Custom Smart Supply** | the highest-leverage single component — 62% larger round-1 offer |
| Congestion detector | `productionAmount == 0` for >5 cycles → dump inventory at price 0 |

**Exit:** a hand-made Agriculture division runs 500+ cycles unattended with no congestion and
energy/morale pinned at max.

### Phase 4 — Rounds 1 and 2 — **the BN3.3 milestone**

| Task | Notes |
|---|---|
| Recipe engine | `docs/specs/recipe-dsl.md` |
| Round 1 recipe | custom-Smart-Supply variant |
| Round 2 recipe | two phases, with the RP wait |
| Advisory mode wiring | log the action list, execute nothing |

**Exit:** cold start → round 2 offer inside the **14.145–14.871t** band, hands-off, reproduced
across at least two runs via the restart loop.

Run advisory mode end-to-end first and read every action against the recipe before enabling
execution.

### Phase 5 — Round 3+

| Task | Notes |
|---|---|
| Tobacco division + export routes | **register Tobacco before Chemical** — export order is FIFO |
| Product development loop | develop, discontinue at the 3-product cap |
| **Custom Market-TA2** | empirical `MarkupLimit` measurement, cached per product |
| Per-cycle allocator | the 1/23 and 1/19 fraction tables |
| Research policy | none in round 3; `Hi-Tech R&D Laboratory` first in round 4 |
| Office setups | per-round job ratios, including the pre-offer "profit" switch |
| Dummy divisions | Restaurant, 10e9, 6 cities + 6 warehouses, nothing else |

**Exit:** 1e90/s within ~500 cycles, hands-off.

### Phase 6 — Exit path and integration

| Task | Notes |
|---|---|
| Offer-acceptance predicates | product count + "profit" office setup + profit registered |
| IPO and dividend policy | only after round 4 |
| **Bribery** | valuation ≥ 100e12 → publish `bribeAvailable` for `factions`/`augs` |

**Exit:** corp money converts to faction reputation automatically.

### Phase 7+ — The rest of the fleet

Real Director → `infra` → `targeting` → HWGW v1 → `factions` + `augs` + install cycle →
`contracts` framework → `karma` + `sleeves` → `gang` → `hacknet` + `hashes` → `bladeburner` →
HWGW v2 → ROI-bidding Director.

Ordering per `docs/automation-architecture.md` §9, with corp already done.

---

## 6. BitNode degradation

Requirement: handle penalties **gracefully, not optimally**.

**Principle: no absolute threshold tuned on BN3 survives contact with a penalized node.**

- **Recipes are priority-ordered target lists**, not fixed shopping lists. "Converge toward these
  levels in this order; stop when funds run out." Round 1 in a penalized node buys fewer Smart
  Storage levels and produces a smaller offer — it still works, it just works smaller. The
  `degrade` field in the recipe DSL is the mechanism.
- **Round-advance decisions key off marginal signals**, not absolute figures. "Offer growth per
  cycle has fallen below X%" rather than "offer > 1e16". The manual's absolute milestones
  (1e16 / 1e20 / 1e90) become **logged health checks**, not gates.
- **SF5.1 is held**, so `ns.getBitNodeMultipliers()` is available and penalties can be read
  directly — particularly `CorporationValuation` and `CorporationSoftcap`. This is the primary
  path; the marginal-signal approach above is the fallback for a node where SF5 is unavailable.
- **`CorporationSoftcap < 0.15`** → corporations are disabled in that node. Detect and exit
  cleanly.
- **Outside BN3**: no seed money ($150b required), and without SF3.3 the Warehouse and Office
  API unlocks cost $50b each in corp funds. The Director's `cash.corp` accumulator matters there
  and is a no-op in BN3.

---

## 7. Contracts — framework, never a solver

Deliberately built so it cannot solve anything for you.

- **Finder** scans all servers for contracts.
- **Solver registry** keyed by contract type.
- **Unknown type → do not attempt.** Log loudly and auto-generate a stub file containing the
  contract type, its description, the input data, and an empty `solve(data)`. The system hands
  you the exercise; it does not do it.
- Every solved contract's input/output is **saved as a test case**. A new solver must pass the
  accumulated corpus for its type before it is allowed to submit live.
- **Never burn the last attempt** on a solver that has not passed its corpus.

---

## 8. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Formula implemented wrong | Silent bad decisions everywhere downstream | Phase 2 conformance gate before any automation acts |
| Missed corp state edge | Smart Supply skipped → congestion → production halts | 100ms polling, edge detection, congestion detector as backstop |
| Bonus time compresses cycles to 1s | Heavy inline work overruns the cycle | Daemon queues work and `run()`s the worker; never compute inline on an edge |
| Corp API RAM exceeds home RAM | Cannot run at all | Phase 0 measurement; two-script split; bootstrap option in §9 |
| Accepting an offer too early/late | Permanent share loss, weaker run | Advisory mode first; restart loop as recovery |
| Game update changes formulas | Everything drifts | Conformance harness detects it immediately and keeps running |
| Script death mid-round | Corp stalls silently | Watchdog + idempotent convergence — restart resumes, never restarts |

---

## 9. Open questions

- **Corp API RAM total.** Phase 0 task 7 answers it, and with home RAM at 32 GB this is a live
  risk rather than a formality. If home RAM turns out to be the blocker,
  the bootstrap is: run round 1, **do not** accept the offer, go public, sell all shares and the
  CEO position for roughly 600b–1t in *player* money, buy home RAM, then start the real corp.
- **Boost optimizer reference case** — confirm the industry behind the `S = 5250` vector.
- **Corp state API** — exact name, and whether it reports current or next state.
- **Dividend rate policy after round 4** — retained earnings compound; dividends buy augs now.
- **Does bribery obsolete most of `factions`?** Confirmed present in the installed version, so
  probably yes — revisit `docs/managers/factions.md` before building it.
