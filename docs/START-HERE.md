# START HERE

Entry point for this project. If you are a fresh Claude session, a new machine, or yourself in
three weeks — read this first, then the doc map in §6.

---

## 1. What this is

Automation for the game **Bitburner**, written as cooperating in-game scripts. The player writes
the code; Claude is a design partner — architecture, trade-offs, gotchas, pseudo-code — not an
implementer. Design happens in conversation, gets written into `docs/`, and only then gets built.

**SF3.3 is done** — `WarehouseAPI` and `OfficeAPI` are now free in every BitNode.

**Current objective: reach BN10 with working corporation automation.** BN10 grants Duplicate
Sleeves, and buying the full Covenant set costs **$111 quadrillion** — which must be earned
*inside BN10*, because money does not survive a BitNode change. That corporation has to work on
first contact, which makes BN9 the rehearsal and BN10 the performance. See
`bitnode-planning.md`.

---

## 2. Current state

| | |
|---|---|
| BitNode | **BN9** ("Hacktocracy"), working toward SF9.2 |
| Source-Files | **SF1.3, SF2.3, SF3.3, SF4.3, SF5.1, SF6.1, SF9.1** |
| Existing corporation | **none** — the BN3 one was sold |
| Target | **BN10** for Duplicate Sleeves |
| Phase | **Phase 0** (scaffolding) — see `implementation-plan.md` §5 |
| Next concrete task | run `/tools/ram-costs.js` in-game and report the corp API RAM total |

**BN9 changes the build order.** Hacking income there is ~0.1% of normal
(`ServerMaxMoney 0.01` × `ScriptHackMoney 0.1`) and purchased servers cannot be bought at all
(`CloudServerLimit 0`). Hashes are the economy. Read `bitnode-planning.md` before re-sequencing
anything — priorities are BitNode-dependent, and the architecture doc's ordering assumes a
normal node.

`implementation-plan.md` §0 explains what each Source-File changes in these designs. Keep it
current — several design decisions key off that table.

---

## 3. Decisions already made

Settled. Do not re-litigate without a reason; do challenge if you have one.

| Decision | Rationale |
|---|---|
| External git repo, **plain JS** + `// @ts-check` + JSDoc | Catches the one bug class that matters: a mistyped `ns.corporation` property returns `undefined` and produces a *wrong number* rather than an error |
| **Corp first**, hacking managed by hand for now | BN3 seed money makes the corp free in cash — it costs time, not money |
| Everything JS under `scripts/`; `src/` is **Python only**; Node tests in `test/` | `lib/` must sync to the game because daemons import it at runtime |
| **Target-state convergence, never imperative actions** | "Ensure warehouse level is 17", not "buy 17 upgrades". Makes restart-safety free. Applies to corp recipes *and* HWGW prep |
| **Files for state and standing directives; ports for transient commands** | A manager paused by a file flag is still paused after a crash |
| A disabled manager **idles, does not exit** | Toggle subsystems live without killing processes; the watchdog won't fight you |
| **Cash as fractions, RAM as explicit leases** | Fractions summing to ≤1 are inherently race-safe; RAM is physical and over-commit fails loudly |
| Managers publish `wants` from day one even though v1 ignores them | Upgrading to an ROI-bidding Director then needs no manager rewrites |
| **Policy functions are pure** — snapshot in, action list out, never call `ns` | Unit-testable, and advisory mode becomes free |
| **Manager priority is BitNode-dependent** | `hacknet` is 9th in a normal node and 2nd in BN9; HWGW is unbuildable in BN9 and worth building for BN10. See `bitnode-planning.md` |
| **Commit early, and `.gitkeep` every directory** | Git carries only committed files and never empty directories. A prior scaffold was lost to exactly this |

---

## 4. Explicitly rejected

Considered and dropped. Reasons recorded so they don't get proposed again.

- **A corp simulator.** Would share formula code with production (a bug passes its own tests),
  drifts on every game update, and bonus time already makes real runs fast — 400 cycles at 1s
  ≈ 7 minutes. The escape hatch if round 3+ tuning becomes iteration-bound is the manual's
  headless mode, not a hand-rolled sim.
- **Migrating to TypeScript.** Moderate benefit, not huge; `@ts-check` + JSDoc captures most of it
  with no build step.
- **Funding hacknet early.** 100% perishable, slow ramp. Its real value is the *permanent* hash
  spends (Bladeburner rank/SP, corp research), which only matter once those systems exist.
- **`AutoBrew` / `AutoPartyManager`.** A tea/party script is trivial and strictly dominates; RP is
  the scarce resource.
- **Market-TA1.** Only ever a prerequisite for TA2, and a custom TA2 script beats buying either.

---

## 5. Open questions

Live, unresolved. Several block work.

0. **Everything in `design-review.md`** — an external review found real defects: the recipe DSL
   cannot hire employees, `snapshot` is never specified, `boost` is gated on a budget it does not
   consume, and the boost reserve fraction is not constant (16% round 1, 24% round 2), which
   breaks `refitIfSpaceDiffers`. Work through §7 of that review before writing the recipe engine.
1. **Corp API RAM total** — blocks the daemon/worker split. Phase 0 task.
2. **Corp state API** — exact name, and whether it reports current or next state. The whole cycle
   daemon design depends on detecting state edges reliably.
3. **Formulas.exe persistence** — SF5 appears to re-grant it after every install. Verify once.
4. **Dividend rate policy after round 4** — retained earnings compound; dividends buy augs now.
5. **Does bribery obsolete most of `factions`?** Bribery is confirmed present. At valuation
   ≥ 100e12 money buys reputation at 1e9/rep, which is the perishable bottleneck on augs.
6. **`ns.share()` power formula** — needed before the HWGW-vs-share RAM split can be reasoned
   about numerically.
7. **Boost optimizer reference case** — confirm which industry's coefficients produce the
   manual's `S = 5250` vector.

---

## 6. Doc map

Read in this order if you are new:

| Doc | What it is |
|---|---|
| `implementation-plan.md` | **Read second.** Save state, decisions, testing strategy, repo layout, phases with exit criteria |
| `automation-architecture.md` | The system: three resources, perishable/permanent ledger, layer model, phase machine, build order |
| `specs/manager-contract.md` | **Normative.** State files, health semantics, allowances, control channel, lifecycle |
| `specs/recipe-dsl.md` | **Normative.** The corp round-recipe engine |
| `managers/corp.md` | The deep one. Cycle sync, Smart Supply, Market-TA2, round recipes, allocator |
| `hwgw-batching-design.md` | The per-target attack pipeline |
| `design-review.md` | Readiness review of the above. Closes open question 7; lists what blocks the recipe engine |
| `managers/{director,infra,targeting,factions,augs}.md` | Scoped stubs — responsibility, state schema, open decisions |
| `bitnode-planning.md` | **Which managers are worth building, per BitNode.** BN9 vs BN10, the sleeve cost math, corp viability by node |
| `design-review.md` | External review, 2026-08-20. Not normative; its §7 is the near-term work list |

Not yet scoped: `contracts`, `karma`, `sleeves`, `gang`, `hacknet`, `hashes`, `bladeburner`.

### Source material

The corp design is built from an external **Corporation manual** (last updated 2026-07-03,
author's code at `https://github.com/catloversg/bitburner-scripts`), kept in this repo at
`docs/manuals/Corporation-manual.pdf`. `managers/corp.md` quotes it heavily; go back to the
source for anything it does not cover — sections 20 (Advanced strategies) and 21 (Other
BitNodes) were still marked WIP as of that revision.

Game mechanics beyond the manual were verified against `bitburner-official/bitburner-src` @
`dev`, commit `79e5cd87`, v3.0.2-dev.

---

## 7. Working agreements

- **Design partner, not implementer.** Offer alternatives, trade-offs, gotchas. Pseudo-code is
  welcome; wholesale implementations are not. The coding is the fun part.
- **Push back.** Unbiased critical thinking is wanted over agreement. Say when an idea is wrong.
- **Build incrementally** — something simple that works, enhanceable into a sophisticated version.
- **Coding contracts are hand-written by the player.** The `contracts` manager is a *framework*
  that finds contracts, dispatches to a solver registry, and — for unknown types — generates a
  stub with an empty `solve(data)` and refuses to attempt it. It hands over the exercise; it does
  not do it.
- **Verify game mechanics against source**, don't trust memory. Cite the file.

---

## 8. Continuity

Two channels carry this project between machines and sessions:

- **This git repo** — code, docs, configs. The portable substrate.
- **The attached claude.ai project** — the same docs plus the Corporation manual PDF. Follows the
  account, not the machine, so any chat session on any computer can read it.

What does **not** transfer is the conversation history — the reasoning behind each decision.
That is what §3 and §4 exist to preserve. Keep them updated as decisions are made and options
are ruled out; they are the handoff.
