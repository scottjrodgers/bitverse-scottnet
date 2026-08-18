# Engineering Standards — Bitburner Automation Project

Applies to every work package implemented for this project, regardless of which subsystem. Reference this doc from every subsystem spec rather than restating it. Written for two audiences at once: an AI coding agent (Claude Code) implementing a work package with no other context, and a human (you, or a friend you show this to) reading the result afterward.

---

## 1. Guiding Principle

**Implement exactly what's specified. No speculative generality.**

If a work package doesn't call for a config option, don't add one "in case it's useful later." Don't build an abstraction layer to support a second implementation that doesn't exist yet. Don't add a feature flag for behavior nobody asked for. This project has a documented history (this very conversation) of over-broad guesses turning out wrong once tested against real data — the fix is smaller, more falsifiable units of work, not more defensive generality baked in up front. When genuinely unsure whether something is in scope, treat it as out of scope and flag it rather than build it.

Every work package spec will include an explicit **Out of Scope** list. Treat it as binding, not a suggestion.

---

## 2. Code Style

- Every script starts with a header comment: one-line purpose, `@param {NS} ns`, and a short list of what it reads from `/data/` and what it writes.
- Use the existing conventions already established in `batchlib.js`/`batcher.js`/`prep.js`: named exports from shared library files, plain functions (not classes) unless a work package spec explicitly calls for state that justifies one, `camelCase` naming, no unexplained magic numbers — pull constants to the top of the file or into `/data/config.json` if they're meant to be tunable.
- Comments explain **why**, not **what** — assume the reader can read JavaScript; they can't read the game-mechanic reasoning behind a formula or threshold without a comment pointing at it.
- Prefer flat, readable control flow over clever one-liners. This code needs to be legible to a friend you're showing it to, not just functionally correct.
- New shared logic goes in a library file (`batchlib.js` or a new `<domain>lib.js`) and gets imported, not copy-pasted between subsystem daemons.

## 3. Documentation Requirements

- Every subsystem gets a short `README-<subsystem>.md` (or a section in the master doc — work package spec will say which) covering: what it does, what it reads/writes in `/data/`, how to run it standalone, and what "working correctly" looks like.
- Non-obvious game-mechanic facts embedded in code (formulas, thresholds, RAM costs) get a comment citing where the number came from and a confidence note if it wasn't verified in-game — same discipline used throughout the architecture doc.
- The overall project should end up navigable by someone who wasn't part of building it: a table of contents / index doc listing every file, its purpose, and its dependencies is part of the final deliverable, not an afterthought.

## 4. Error Handling Philosophy

- Fail loud, not silent. If a subsystem can't do what it intended (RAM allocation failed, an API call errored, a config value is missing), it should `ns.tprint` a clearly-labeled warning, not swallow the problem.
- Self-heal where a work package spec explicitly designs for it (e.g., the hacking batcher's drift watchdog). Don't silently retry-forever without surfacing that something's off.
- Never let one subsystem's failure crash another. This is the whole reason for the daemon-per-subsystem architecture — a bug in `stock-trader.js` should never be able to take down `batcher.js`.

## 5. Verification Protocol

This is the most important section, so it gets its own treatment.

**Constraint:** Neither Claude Code nor I can execute Bitburner code. Every claim about whether a script actually works has to be verified by you running it in-game and reporting back what happened — the same loop that ran this entire conversation (the Agriculture production-multiplier formula was wrong by 4x until you gave me real numbers; the Robots purchase hint contradicted what the elasticity test actually showed). That loop needs to be a designed-in part of the workflow, not something we improvise per-subsystem.

**Rule: every implementation work package ships with a companion verification script.**

- Naming convention: `verify-<subsystem>.js`, sitting alongside the implementation file(s) it tests.
- **Non-destructive by default.** A verify script's job is to read state and report it clearly, not to take actions that cost money, risk gang-member death, or otherwise change game state — unless the work package spec explicitly says this verify script needs to exercise a real action (e.g., confirming a single HWGW batch actually lands in the right order). Any verify script with side effects must say so in its own header comment in capital letters, and the work package spec must call this out explicitly.
- **Output format:** structured and unambiguous, meant to be copy-pasted verbatim back into a Claude Code / chat session. Prefer either:
  - Labeled `ns.tprint()` lines (`"CHECK: security = 12.3 (expected: <= 5)"`), or
  - A single `ns.tprint(JSON.stringify({...}, null, 2))` block for anything structured.
  - Avoid raw unlabeled numbers — six unlabeled floats pasted back are much harder to act on than six labeled ones.
- **Every work package spec defines "expected output when correct"** alongside what the verify script prints, so a diff between actual and expected doesn't require re-reading the implementation.

**The feedback loop, concretely:**

1. Claude Code implements a work package (the main script + its `verify-*.js`).
2. You run the verify script in-game.
3. You paste the raw output back.
4. Claude Code (or I, if you bring it back here) compares actual output against the spec's expected output and either confirms it's correct or proposes a fix.
5. Repeat until actual matches expected, *then* move to the next work package.

Don't let a work package be marked done on "the code looks right" alone — it's done when a verify script's real output matches what the spec said it should.

**Retrofit note — resolved:** the original ad hoc `batcher.js` prototype (built before this spec-driven process started) didn't have a formal `verify-*.js`. That prototype is superseded — `spec-hacking.md` re-specs the whole hacking subsystem from scratch, including its own `verify-hacking.js` with defined expected output. No separate retrofit work package is needed; building `spec-hacking.md` as written already covers this.

## 6. Handling Uncertainty

When an implementing session (Claude Code or otherwise) isn't sure about a game-mechanic detail — an exact RAM cost, an API's exact return shape, whether a function behaves as documented — the correct move is to write a tiny diagnostic snippet that checks it live (e.g., `ns.tprint(ns.getScriptRam("x.js"))`) and ask you to run it and report back, rather than silently assume and build on top of the assumption. This mirrors exactly how research was done for the architecture doc itself (checked source code and docs rather than trusting memory) and should carry through to implementation.

---

## 7. Definition of Done (applies to every work package)

A work package is complete when, and only when:

1. The implementation matches its spec's in-scope list and respects its out-of-scope list.
2. A `verify-*.js` script exists, is non-destructive (or explicitly flagged if not), and its real in-game output has been confirmed to match the spec's expected output.
3. The file has a header comment and, if it's a new subsystem, a short README.
4. It reads/writes `/data/` exactly per the Data Contracts doc — no ad hoc fields invented on the fly.
