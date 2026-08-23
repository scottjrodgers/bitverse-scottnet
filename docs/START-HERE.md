# START HERE

Entry point for this project. If you are a fresh Claude session, a new machine, or yourself in
three weeks — read this, then §6.

---

## 1. What this is

Automation for the game **Bitburner**, written as cooperating in-game scripts. The player writes
the code; Claude is a design partner — architecture, trade-offs, gotchas, pseudo-code — not an
implementer. Design happens in conversation, gets written into `docs/`, and only then gets built.

The doc set was consolidated in **August 2026** after it reached fourteen design documents and
two script files. `reference/rationale.md` §1 records what went wrong and why the fix was to
settle the top layer rather than write more of the bottom. Read that before adding a document.

---

## 2. Current state

**This section is the only place in the repository that states current BitNode, Source-Files or
objective.** Every other document deliberately omits them. Three documents each keeping a
private, stale copy was a real failure here, not a hypothetical one.

| | |
|---|---|
| BitNode | **BN9** ("Hacktocracy"), working toward SF9.2 |
| Source-Files | **SF1.3, SF2.3, SF3.3, SF4.3, SF5.1, SF6.1, SF9.1** |
| Existing corporation | **none** — the BN3 one was sold |
| Target | **BN10** for Duplicate Sleeves |
| Built so far | nothing runnable. `scripts/` holds `tools/ram-costs.js` and `policy/corp/recipes.js` |
| Next concrete task | **specify the corp snapshot** — see §5.0 |

**BN9 changes what is worth building.** Hacking income is ~0.1% of normal
(`ServerMaxMoney 0.01` × `ScriptHackMoney 0.1`) and purchased servers cannot be bought at all
(`CloudServerLimit 0`). Hashes are the economy. `reference/mechanics.md` §2 has the multipliers
for both BN9 and BN10.

**Why BN10.** It grants Duplicate Sleeves, and the full Covenant set costs **$111 quadrillion**
which must be earned *inside* BN10, because money does not survive a BitNode change
(`reference/mechanics.md` §10). The corporation has to work on first contact — which is what
makes BN9 the rehearsal and BN10 the performance. That framing was challenged and only partly
survived; `reference/rationale.md` §12 has the argument on both sides.

---

## 3. Decisions already made

Settled. Do not re-litigate without a reason; do challenge if you have one. Reasoning is in
`reference/rationale.md` — the section number is the link.

| Decision | Why | Where |
|---|---|---|
| **Goals, not phases.** An ordered, human-writable goal file; a "phase" is a named preset bundle of goals, a label rather than a mechanism | The plan turned out to be contingent twice and was patched with exceptions twice. You cannot add a phase to an enum at runtime | rationale §2 |
| **Marginal time is the currency.** Seconds of completion time removed per unit of resource | Real units, comparable across goals, checkable by a human. Weighted goal scores are hand-tuned constants wearing a formula | rationale §3 |
| **Purchases and leases are separate**, scored in the same currency | One-shot and standing are different problems; one array for both cannot express "reduce this consumer to 512 GB" | rationale §4 |
| **Revocation at the lease boundary**, never pre-emption | The Director lowers a number; the consumer drains at its own pace. Exit-only at the batch level, revocable at the lease level, both at once | rationale §5 |
| **The allocator is a library, not a Director feature** | A corporation runs the same algorithm over its own separate pool. Nothing in it may name `director.json` or player money | rationale §6 |
| **`/state/` is observations, `/memory/` is knowledge** | An install is a partial world reset, not a restart. The split is a type distinction, so it stays maintainable | rationale §8 |
| **The decision record publishes rejected candidates, not only chosen ones** | Counterfactuals are where the analysis lives and are unrecoverable afterwards. The CLI is the read side of this, free if designed for early | rationale §9 |
| **Target-state convergence, never imperative actions** | "Ensure warehouse level is 17", not "buy 17 upgrades". Restart-safety becomes free. Applies to corp recipes *and* HWGW prep | manager-contract §6 |
| **Files for state and standing directives; ports for transient commands** | A manager paused by a file flag is still paused after a crash | manager-contract §2 |
| **A disabled manager idles, it does not exit** | Toggle subsystems live without killing processes; the watchdog won't fight you | manager-contract §6a |
| **Each script imports only the `ns` calls it issues** | RAM is static analysis and it follows imports. One "all corp calls live here" module costs 960 GB in every importer and nothing runs | corp §1.5 |
| **Plain JS + `// @ts-check` + JSDoc**, no TypeScript build step | Catches the bug class that matters: a mistyped `ns.corporation` property returns `undefined` and produces a *wrong number* rather than an error | rationale §11 |
| **Everything JS under `scripts/`; `src/` is Python only; Node tests in `test/`** | `scripts/` is what syncs to the game; daemons import `lib/` at runtime | — |
| **Commit early, `.gitkeep` every directory** | Git carries only committed files and never empty directories. A prior scaffold was lost to exactly this | — |
| **Home cores are never purchased** | Every server stays at 1 core, which keeps thread-count arithmetic core-independent | rationale §11 |

**What was rejected, and why, is `reference/rationale.md` §10 and §11.** It is not duplicated
here — that duplication is how the last doc set drifted.

---

## 4. How the documents relate

Two rules, and they are the whole filing system:

- **`specs/` is normative. `reference/` is reference.** A normative document binds an
  implementation; where code and a spec disagree, the spec wins until deliberately changed.
  Nothing in `reference/` binds anything.
- **Precedence, highest first:** `specs/strategy.md`, then `specs/manager-contract.md`, then
  `specs/recipe-dsl.md`. Where two normative documents disagree, the higher one wins and the
  lower one is a bug to be filed.

One known live instance of that: `manager-contract.md` §4 still describes the pre-consolidation
`director.json` (`phase`, `reserveFloor`, cash fractions). `strategy.md` §7 is authoritative for
that file. See §5.2.

---

## 5. Open questions

Live and unresolved. The first two block work.

0. **The corp snapshot is never specified.** `plan(recipe, snapshot, budget)` in
   `specs/recipe-dsl.md` §1 is pure, and `snapshot` is undefined. This is the keystone: it
   blocks the recipe engine, its unit tests, the conformance harness, and advisory mode
   simultaneously. It also needs an `issuedAt`, because `jobs` satisfaction is time-dependent
   while `plan` is pure. **This is the next thing to do.**
1. **`pull` and `pull-all` land inside `scripts/`**, which is the directory that syncs *to* the
   game — so the next sync overwrites whatever the managers wrote. Pull must default somewhere
   else.
2. **`manager-contract.md` §4 has not caught up with `strategy.md` §7.** A precedence line says
   which wins; the schema itself is still the old one. Also still missing: a port allocation
   table (`§6a` assigns each manager "one fixed port" and never says which).
3. **`scripts/policy/corp/recipes.js` diverges from its own spec** — a `warehouses: true` field
   the DSL does not define, and no `hire` steps now that the DSL has them.
4. **The restart-loop cost model is asserted, not derived**, and the numbers in it were BN3's.
5. **Formulas.exe persistence** — SF5 appears to re-grant it after every install. Verify once;
   `hwgw-batching-design.md` assumes it permanently.
6. **`ns.share()` power formula** — needed before the HWGW-vs-share RAM split can be reasoned
   about numerically.
7. **Corp's marginal-time estimate may not exist.** "How much sooner do I reach $150b with
   another 100 GB" has no honest answer. Survivable only because a corporation is autonomous
   after its creation cost — but if a second subsystem is equally opaque, the currency needs a
   fallback tier. rationale §3.

`specs/strategy.md` §14 and `managers/corp.md` §12 carry their own, narrower lists.

---

## 6. Doc map

**Read these five, in this order.**

| # | Doc | Status | What it is |
|---|---|---|---|
| 1 | `START-HERE.md` | — | this file: current state, settled decisions, open questions, the map |
| 2 | `specs/strategy.md` | **normative** | the top layer. Goals, candidates, marginal-time allocation, leases and revocation, `/state` vs `/memory`, the decision record |
| 3 | `specs/manager-contract.md` | **normative** | how one controller behaves. State envelope, health, candidates, lifecycle, watchdog, control port |
| 4 | `reference/rationale.md` | reference | **why** all of the above. Arguments, rejected alternatives, corrections, and the disposition of the retired design review |
| 5 | `reference/mechanics.md` | reference | verified game facts with sources. BitNode multipliers, install ledger, RAM costs, API drift. The numbers everything else rests on |

**Then, when you need them.**

| Doc | Status | What it is |
|---|---|---|
| `specs/recipe-dsl.md` | **normative** | the corp round-recipe engine: step kinds, degradation, the pure `plan` function |
| `managers/corp.md` | reference | corporation domain. Cycle sync, Smart Supply, Market-TA2, round playbooks, the round 3+ allocator, formulas |
| `hwgw-batching-design.md` | reference | the per-target hacking pipeline. Timing model, batch sizing, prep, drain, RAM leases |
| `manuals/Corporation-manual.pdf` | source | external, last updated 2026-07-03 |

Nothing else is scoped, and that is deliberate: `contracts`, `karma`, `gang`, `hacknet`,
`hashes`, `bladeburner` and `sleeves` were all designed in the previous doc set and none was
built. **Write a controller when a goal needs it, not because the architecture has a slot for
it** (rationale §14).

**Retired documents.** `automation-architecture.md`, `implementation-plan.md`,
`bitnode-planning.md`, `design-review.md` and the five `managers/*.md` stubs were deleted in the
consolidation. `rationale.md` cites them in past tense; to read one:
`git show e75bb01:docs/automation-architecture.md`.

### Source material

The corp design is built from an external **Corporation manual** (2026-07-03, author's code at
`https://github.com/catloversg/bitburner-scripts`), kept at `docs/manuals/Corporation-manual.pdf`.
`managers/corp.md` quotes it heavily; go back to the source for anything it does not cover —
sections 20 (Advanced strategies) and 21 (Other BitNodes) were still WIP at that revision.

Game mechanics were verified against `bitburner-official/bitburner-src` @ `dev`, commit
`79e5cd87`, v3.0.2-dev.

---

## 7. Working agreements

- **Design partner, not implementer.** Offer alternatives, trade-offs, gotchas. Pseudo-code is
  welcome; wholesale implementations are not. The coding is the fun part.
- **Push back.** Unbiased critical thinking is wanted over agreement. Say when an idea is wrong.
- **Build incrementally** — something simple that works, enhanceable into a sophisticated
  version.
- **Verify game mechanics against source**, don't trust memory. Cite the file. `reference/
  mechanics.md` §11 exists because several remembered API names were wrong.
- **Coding contracts are hand-written by the player.** The `contracts` controller is a
  *framework*: it finds contracts, dispatches to a solver registry, and for unknown types
  generates a stub with an empty `solve(data)` and refuses to attempt it. It hands over the
  exercise; it does not do it.
- **Watch for detail accumulating under an unsettled layer.** That is the failure this doc set
  already hit once (rationale §1). Detail is the cheap thing to produce with an AI, which makes
  it the thing to watch.

---

## 8. Continuity

Two channels carry this project between machines and sessions:

- **This git repo** — code, docs, configs. The portable substrate.
- **The attached claude.ai project** — the same docs plus the Corporation manual PDF. Follows
  the account, not the machine, so any chat session on any computer can read it.

What does **not** transfer is the conversation history — the reasoning behind each decision.
`reference/rationale.md` is where that goes, and keeping it current is the handoff. §3 above is
the index into it.
