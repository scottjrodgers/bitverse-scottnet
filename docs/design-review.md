# Design Review — readiness for implementation

**Status:** review, not normative. A snapshot of the docs and code as of 2026-08-20.
**Reviewer:** Claude (Opus 5), reading the full `docs/` set, `scripts/`, and `src/`.
**Scope:** is this design ready to be built? What blocks it?

Findings are ordered by what they block, not by severity. Section 2 closes an open question;
sections 3–5 are things to fix or decide before writing the corp recipe engine.

---

## 1. Verdict

**The design is well ahead of the implementation, which is the right way round — but the gap is
wider than the docs say.**

`implementation-plan.md` §0 records the current phase as "Phase 0 (scaffolding)." In substance
Phase 0 has not started. `scripts/` contains exactly two files:

| File | Belongs to |
|---|---|
| `scripts/tools/ram-costs.js` | Phase 0, task 7 |
| `scripts/policy/corp/recipes.js` | Phase 4 |

Absent: `lib/`, `io/`, `daemon/`, `data/`, `test/`, `package.json`, `jsconfig.json`, and
**`NetscriptDefinitions.d.ts`**.

That last one is the load-bearing absence. `@ts-check` + JSDoc is the *entire* stated defense
against the bug class named in `implementation-plan.md` §1 — a mistyped `ns.corporation` property
returning `undefined` and producing a wrong number rather than an error. Without the definitions
file, `ram-costs.js`'s `import(".").NS` resolves to nothing and `// @ts-check` is inert. The fix
is already built: `bb.py defs` calls the Remote API's `getDefinitionFile`. One command and a
commit.

**Design maturity by area:**

| Area | State |
|---|---|
| `managers/corp.md`, `hwgw-batching-design.md` | Deep, sourced, internally consistent. Ready to build against once §3 is resolved. |
| `specs/manager-contract.md` | Normative but has internal inconsistencies (§3.6, §3.7 below). |
| `specs/recipe-dsl.md` | Normative and has structural holes (§3.1–3.4). Not yet buildable. |
| `managers/{director,infra,targeting,factions,augs}.md` | Honest stubs, correctly labeled. Not blocking. |
| Python sync tooling (`src/`) | Working, further along than the plan assumes, two real bugs. |

**Bottom line:** ready to start Phase 0 today. **Not** ready to write the recipe engine — the
snapshot schema does not exist, and the DSL cannot express hiring.

---

## 2. Closed: the boost optimizer reference case is Agriculture

This resolves `START-HERE.md` §5 question 7 and `implementation-plan.md` §9, and makes the
Phase 1 exit criterion a checkable unit test.

The closed form in `managers/corp.md` §7.5 was run against **Agriculture's** coefficients and the
material sizes, at `S = 5250`:

```
coefficients  c = (AI Cores 0.3, Hardware 0.2, Real Estate 0.72, Robots 0.3)
sizes         s = (AI Cores 0.1, Hardware 0.06, Real Estate 0.005, Robots 0.5)

x*s1 = ( S - 500 * ( (s1/c1)*(c2+c3+c4) - (s2+s3+s4) ) ) / ( (c1+c2+c3+c4)/c1 )
```

| Material | Closed form | Manual's reference vector |
|---|---|---|
| AI Cores | 10518.1 | 10518.09 |
| Hardware | 11742.3 | 11742.32 |
| Real Estate | 528369 | 528368.42 |
| Robots | 1703.6 | 1703.62 |

All four agree to 2dp. **The formula as written in the doc is correct**, and the industry behind
the reference case is Agriculture. Use this as the Phase 1 unit-test fixture verbatim.

### The finding that matters more: `S` is not the warehouse size

Back-solving `S` from the constants already committed in `scripts/policy/corp/recipes.js`:

| Recipe | Warehouse size | Implied `S` | Reserve |
|---|---|---|---|
| Round 1 (custom Smart Supply) | 900 | ≈ 756 | 16% |
| Round 1 (built-in Smart Supply) | 520 | ≈ 437 | 16% |
| Round 2, Agriculture | 5950 | ≈ 4522 | 24% |

Round 1's `Robots: 0` is the recursive negative-drop case firing, exactly as §7.5 describes —
re-solving over the remaining three materials reproduces AI Cores 1562, Hardware 1791 and
Real Estate 98476 (the recipe says 98470) from `S ≈ 756`. That is a second, independent
confirmation of the closed form, including the recursion.

**But the reserve fraction is not constant** — 16% in round 1, 24% in round 2. `S` is warehouse
size minus space held back for input and output materials, and how much to hold back depends on
production volume.

**Consequence for the DSL.** `refitIfSpaceDiffers` (`specs/recipe-dsl.md` §5) says that on a
degraded run the engine should "discard them and re-run the closed-form boost optimizer against
the actual available space." With no reserve policy stated, that fills the warehouse to 100% and
causes precisely the congestion the feature exists to prevent.

**Fix:** record the assumed reserve next to `expectSize` in each recipe, or derive it from
projected raw production. Either way it must be explicit before `refitIfSpaceDiffers` is
implemented.

---

## 3. Blocking design gaps

Resolve these before writing the recipe engine, not during.

### 3.1 The snapshot is never specified — *highest priority*

`specs/recipe-dsl.md` is marked normative and its central contract is:

```
plan(recipe, snapshot, budget) -> { actions, status, blockedOn, spend }
```

No document defines what is in `snapshot`. It is the shared input to the recipe engine, every
unit test in Phase 1, the conformance harness in Phase 2, and advisory mode. It blocks Phases 1,
2 and 4 simultaneously.

**Fix:** write `specs/corp-snapshot.md` and make it normative. It is the missing keystone.

### 3.2 Nothing hires employees

`specs/recipe-dsl.md` §2 lists ten step kinds. None of them is `hire`.

- `officeSize` grows office *capacity* (`upgradeOfficeSize`).
- `jobs` calls `setAutoJobAssignment`, which the doc itself notes "moves employees from
  Unassigned and **throws** if there are not enough."

Round 1 upgrades the office 3 → 4 and immediately assigns 4 to R&D. Round 2 goes to 8 and assigns
8. Nothing ever calls `hireEmployee`. **The first recipe that would ever run throws on step 3.**

**Fix:** add a `hire` step kind, or make `officeSize` responsible for filling to capacity. The
former is more in keeping with "every numeric field is a target."

### 3.3 `boost` is gated on a budget it does not consume

§5 of the DSL correctly establishes that boost materials are bought on credit — "the per-second
route can go into debt" — and that their real constraint is warehouse space, not funds.

But the §4 engine loop gates *every* step on `s.cost <= budget - spend`. Boost steps will be
spuriously truncated to `partial` and mark the whole recipe `degraded` whenever funds are low —
which is exactly the penalized-BitNode case the degradation machinery exists to serve.

**Fix:** add `costsBudget: false` to the step kind and skip the budget gate for it.

### 3.4 `jobs` satisfaction is time-dependent, but `plan` is pure

§5: the `jobs` step "should not be considered satisfied until a full cycle has elapsed after
issuing it," because `setAutoJobAssignment` only takes effect at the next cycle's START state.

Purity means that state has to live in the snapshot — an `issuedAt` timestamp or a cycle counter
the engine can compare against. Which loops back to §3.1.

### 3.5 Spec/data drift, already, with one data file

`scripts/policy/corp/recipes.js` puts `warehouses: true` on the `division` step. The DSL defines
no such field, and purchasing a warehouse (`purchaseWarehouse`) is a distinct API call from
upgrading its level (`upgradeWarehouse`), which is what the separate `warehouse` step does.

The specific fix is minor — decide whether `division` implies purchase, or add a step kind. The
signal is not: the very first data file written against the spec diverged from it. If the spec is
normative, the recipes need to validate against it.

### 3.6 `manager-contract.md` is internally inconsistent

§6a specifies the durable pause as `director.json → subsystems.<name>.enabled = false`. The
`subsystems` key does not appear in the §4 `director.json` schema. In a doc labeled normative,
that gets implemented two different ways.

Related: §6a says each manager "owns one fixed port," and `STATUS` replies "on the sender's
port." No port allocation table exists anywhere.

### 3.7 The watchdog is underspecified in ways that bite

`specs/manager-contract.md` §6:

- **Crash loop.** `health == "error"` triggers a restart, with no backoff and no cap. Combined
  with §8 ("refuse a higher schema by setting `health: error`"), a schema bump produces an
  infinite restart loop.
- **Grace window.** `now - lastRun > 3 * tickMs` gives the corp cycle daemon (100ms poll) a 300ms
  window. A single heavy tick, a `run()` of an action script, or a GC pause trips it. Either the
  daemon needs a `tickMs` that reflects its worst case rather than its poll interval, or the
  watchdog needs an absolute floor.
- **Launch metadata.** Nothing specifies how the watchdog *starts* a manager — script path, args,
  host, thread count, RAM lease. And nothing specifies who starts the watchdog.

---

## 4. Code defects

### 4.1 `pull_all` escapes its output directory

`src/bb_daemon.py:161` does `out_dir / entry["filename"]`. If Bitburner returns leading-slash
filenames (`/logs/corp.log`), pathlib treats the right operand as absolute:

```python
>>> Path('D:/out') / '/logs/corp.log'
WindowsPath('D:/logs/corp.log')      # escaped to the drive root
>>> Path('D:/out') / 'logs/corp.log'
WindowsPath('D:/out/logs/corp.log')  # intended
```

Same exposure in `src/bb_paths.py:34` (`to_local_path`). **Fix:** `filename.lstrip("/")` at both
sites. Worth noting that `bb_paths.py`'s module docstring is specifically about not repeating the
Go tool's path-handling bug.

### 4.2 `pull_all` defaults into the sync directory — round-trip contamination

`out_dir` defaults to `config.directory`, i.e. `scripts/`. Pulled `/logs/*` and `/state/*` land
inside the synced tree, and `.json` is in `include_extensions` — so the next `sync` pushes
runtime state back into the game, overwriting what the managers wrote.

**Consequence for the plan.** `implementation-plan.md` §5 lists `src/pull-data.py` as an unstarted
Phase 0 task ("nothing brings runtime state back"). That is out of date — the pull path *exists*.
What is missing is a **filtered** pull (`/logs/` and `/state/` only) into a directory outside the
sync tree, plus the fix in §4.1. That is two flags and a `lstrip`, not a new tool.

### 4.3 `scripts/tools/ram-costs.js` — minor

- `import(".").NS` will not resolve until the definitions file is committed (§1).
- `await ns.write(...)` — `ns.write` is synchronous. Harmless, but the `await` is noise.
- The "naive total if one script used ALL of them" line is a useful upper bound, but the number
  that actually drives the daemon/worker split is the cost of the *specific set* the daemon
  calls. Consider accepting a list of function names and totalling those, so the split can be
  costed directly rather than inferred from the table.

---

## 5. Design challenges

Things worth arguing about, not defects.

### 5.1 The 100ms poll may not see the edges it depends on

`managers/corp.md` §4 polls at ~100ms to detect state edges. Under bonus time a full cycle is 1s,
so each of the five states lasts ~200ms. `ns.sleep(100)` resolves on a game tick (200ms by
default), so the daemon gets roughly one sample per state at best — and by §8, a missed PURCHASE
edge is the *primary* cause of warehouse congestion.

If `CorporationInfo` exposes `nextState` (believed to, in recent versions — **verify, do not take
this on trust**), the daemon should be **edge-anticipating** rather than edge-detecting, and that
is a different loop shape than §4 sketches.

This is why `START-HERE.md` §5 question 2 is correctly the top blocker. It is answerable in
minutes from the definitions file, which is another reason to pull it first.

### 5.2 Advisory mode cannot validate what it is being asked to validate

`managers/corp.md` §9 recommends running a full round 1→4 in advisory mode and reading the log
before enabling execution.

Advisory mode executes nothing, so the corporation never grows, so every action list after the
first is computed against a snapshot that has already diverged from what a real run would see.

Advisory mode is a strong gate for **irreversible discrete actions** — accept offer, go public,
set dividend rate, create corporation. It is close to worthless as a rehearsal for **convergence
loops** — Smart Supply, Market-TA2, the per-cycle allocator. Narrow the claim; the conformance
harness (Phase 2) is the right instrument for the second category.

### 5.3 The restart-loop cost model is asserted, not derived

`implementation-plan.md` §2 states that a seed-funded restart costs $150b against a ~550b round-1
yield, which is what makes rounds 1–2 iterable — a load-bearing claim for the entire testing
strategy.

But in BN3 seed money is **free in cash**; it costs equity. If re-creation can take seed money
again, a restart is far cheaper than $150b and many more iterations are affordable. If it cannot,
the $150b needs a source. This directly sets how aggressively round 1 can be tuned. Pin it down
before Phase 4.

### 5.4 Corp's build-order placement is stated three ways

- `automation-architecture.md` §9 puts `corp` at step 11.
- The same section then adds a BN3 exception pulling it forward.
- `implementation-plan.md` makes it Phases 3–6, i.e. first.

A fresh session reading in the order `START-HERE.md` §6 prescribes hits the contradiction. Update
the architecture doc's table rather than leaving the exception as a footnote — this is exactly the
failure mode `START-HERE.md` §8 exists to prevent.

### 5.5 Sequencing conflict worth making explicit

`START-HERE.md` §2 says the existing corporation is "expendable — dispose before running the
round 1 recipe." `implementation-plan.md` Phase 2 says to run the conformance harness "against a
hand-made corp."

These are compatible — keep the expendable corp through Phases 2 and 3, dispose only at Phase 4
entry — but no doc connects them. Getting it backwards costs a corporation and a lot of cycles.
State the sequence once, in the Phase 2 entry criteria.

---

## 6. Documentation hygiene

- **32 cross-references point at `claude/...`**, which is not a directory in this repo (it is
  `docs/`). Trivial to fix, but every one is a broken link for the fresh-session reader these
  docs are explicitly written for. A single `sed` closes it.
- `implementation-plan.md` §5's `src/pull-data.py` task should be rewritten to reflect what
  `src/bb.py` already does (§4.2).
- `implementation-plan.md` §9 and `START-HERE.md` §5 question 7 can both be struck — see §2.

---

## 7. Recommended order of work

| # | Task | Unblocks | Size |
|---|---|---|---|
| 1 | `bb.py defs` → commit `NetscriptDefinitions.d.ts`, write `jsconfig.json` | `@ts-check`, and probably open questions 2 and 3 by reading types | minutes |
| 2 | Run `tools/ram-costs.js` | the daemon/worker split; already written | minutes |
| 3 | Fix §4.1, add a filtered `pull-state` to a directory outside `scripts/` | every phase from 2 onward | ~1 hour |
| 4 | Write `specs/corp-snapshot.md` | Phases 1, 2 and 4 | design session |
| 5 | Patch the DSL: add `hire`; add `costsBudget: false` to `boost`; add a reserve field for `refitIfSpaceDiffers` | the recipe engine | design session |
| 6 | Phase 1 math library + tests | — | as planned |

Steps 1–3 are roughly an hour of work. Steps 4–5 are the real gate: a recipe engine written today
would need rework after them.

The Phase 1 exit criterion is now concrete — the boost optimizer fixture in §2 can be written as a
unit test before any game interaction happens.

---

## 8. What this review did and did not verify

**Verified by computation:**

- The boost optimizer closed form, including the recursive negative-material drop, against the
  manual's reference vector and against all three committed recipe boost targets (§2).
- `WarehouseSize = level * 100 * (1 + 0.1 * smartStorageLevel)` reproduces all four stated sizes
  (900, 520, 5950, 700) exactly, as `specs/recipe-dsl.md` §5 claims.
- The HWGW `additionalMsec` offset algebra in `hwgw-batching-design.md` §2 — all four ops land on
  `T, T+g, T+2g, T+3g` from a single launch instant, for any `S >= 0`.
- The slack solve `S = (((-4t - target) % P) + P) % P` places the launch instant at the requested
  phase within the clean window `[3g, P]`.
- The cash-fraction race-safety argument in `automation-architecture.md` §7 — the reserve floor
  genuinely cannot be breached when fractions sum to ≤ 1. **Caveat not stated in the doc:** a
  manager that re-evaluates in a tight loop consumes far more than its nominal fraction over time,
  because each re-read sees fresh money. Safe for the floor; wrong for the "fair share" intuition.
- The pathlib behaviour in §4.1.

**Not verified — taken from the docs:**

- Every game mechanic sourced to `bitburner-src@79e5cd87`. No clone was available locally; the
  citations look careful and specific, but they are unchecked here.
- Corporation manual figures — round offers, job ratios, fund-split tables, milestones.
- Whether `CorporationInfo` exposes `nextState` / `prevState` (§5.1). **Confirm from the
  definitions file.**
- Whether the Remote API returns leading-slash filenames (§4.1). The fix is safe either way.
