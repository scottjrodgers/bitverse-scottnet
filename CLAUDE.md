# CLAUDE.md

Guidance for Claude Code sessions in this repository.

## What this project is

Automation for the game **Bitburner**, written as cooperating in-game scripts in a JS dialect
(Netscript). Scott writes the code. **Claude is a design partner, not an implementer** — offer
architecture, trade-offs, gotchas, and pseudo-code; do not write wholesale implementations
unless asked. The coding is the point of playing.

Push back. Unbiased critical thinking is wanted over agreement — say when an idea is wrong.

## Read this first

**`docs/START-HERE.md`.** It carries the current BitNode and objective, the settled decisions,
the open questions, and the map of everything else. It is the *only* file in the repo that
states current game state; do not add a second copy anywhere.

Then, in order: `docs/specs/strategy.md`, `docs/specs/manager-contract.md`,
`docs/reference/rationale.md`, `docs/reference/mechanics.md`.

## The doc set

| Path | Status | Contents |
|---|---|---|
| `docs/START-HERE.md` | — | current state, decisions, open questions, map |
| `docs/specs/strategy.md` | **normative** | goals, candidates, marginal-time allocation, leases, `/state` vs `/memory` |
| `docs/specs/manager-contract.md` | **normative** | one controller: state envelope, health, lifecycle, watchdog, control port |
| `docs/specs/recipe-dsl.md` | **normative** | the corp round-recipe engine |
| `docs/reference/rationale.md` | reference | why the design is what it is; rejected alternatives; corrections |
| `docs/reference/mechanics.md` | reference | verified game facts with sources |
| `docs/managers/corp.md` | reference | corporation domain knowledge |
| `docs/hwgw-batching-design.md` | reference | the per-target hacking pipeline |

Two rules:

- **`specs/` is normative; `reference/` is not.** Where code and a spec disagree, the spec wins
  until it is deliberately changed. Nothing in `reference/` binds an implementation.
- **Precedence among specs, highest first:** `strategy.md`, `manager-contract.md`,
  `recipe-dsl.md`. Where two disagree, the higher wins and the lower is a bug to file — not a
  judgment call to make silently. One such contradiction is live and known: see START-HERE §5.2.

Documents retired in the August 2026 consolidation (`automation-architecture.md`,
`implementation-plan.md`, `bitnode-planning.md`, `design-review.md`, and five `managers/*.md`
stubs) are cited in past tense by `rationale.md` and are readable at
`git show e75bb01:docs/<name>.md`. **Do not recreate them.**

## Repository layout

```
docs/          the doc set above
scripts/       everything that syncs INTO the game -- JS only, no Python, no docs
src/           Python only. bb.py filesync daemon; bookgen/ builds a
               print-ready PDF of the docs (see below)
test/          Node tests: npm test
data/          measured game data (RAM costs, aug/faction tables)
prior_scripts/ previous attempts, kept for reference. Not synced, not maintained.
```

`config.toml` syncs `./scripts` to the game over the Remote API. Anything placed under
`scripts/` will be pushed; anything the game writes back can be pulled — but note that pull
currently defaults *into* `scripts/`, which the next sync overwrites (START-HERE §5.1).

## Conventions

- **Plain JS with `// @ts-check` and JSDoc.** No TypeScript, no build step.
  `scripts/NetscriptDefinitions.d.ts` is committed so type checking is live.
- **Target-state convergence, never imperative actions.** "Ensure warehouse level is 17", not
  "buy 17 upgrades." Restart safety then comes for free — and scripts here get killed constantly
  by RAM pressure, reloads, and augmentation installs.
- **Each script imports only the `ns` calls it issues.** RAM is computed by static analysis and
  it follows imports, so a shared "all the API calls live here" module costs its full RAM in
  every importer. This is a hard constraint at 32 GB of BitNode-entry home RAM, not a style
  preference. `docs/managers/corp.md` §1.5.
- **One writer per state file.** Everyone may read anything; that is what makes locking
  unnecessary. Every write is a whole document.
- **Files for durable state and standing directives; ports for transient commands.**
- **Verify game mechanics against source before asserting them.** The upstream repo is
  `bitburner-official/bitburner-src` (`dev` branch); the markdown API docs are under
  `markdown/`. Cite the file. `docs/reference/mechanics.md` §11 exists because several
  remembered API names turned out to be wrong for v3.0.
- **`.gitkeep` every directory.** Git carries only committed files and never empty directories;
  a prior scaffold was lost to exactly this.

## Printing the docs

`python3 src/bookgen/make_book.py --set argument` builds a letter-size, duplex PDF with a
wide outer margin for handwritten notes, a TOC with real page numbers, and running heads
carrying the current section. `--set math` adds the two derivation documents; `--set all`
takes everything. Needs `pip install weasyprint markdown`. Output is gitignored.

`$$...$$` math and ` ```mermaid ` / ` ```dot ` fences are pre-rendered to inline SVG, so
they can be used in any doc here. Requires `npm install` in `src/bookgen/`; without it the
build still succeeds and prints the source in a red block instead. Inline `$...$` is opt-in
(`--inline-math`) because these documents are full of prose like `$150b`.

The builder never modifies the source documents. Code lines too wide for the text column are
re-wrapped at a comma for print only. `src/bookgen/README.md` documents the whole thing,
including three mermaid failure modes that are silent rather than loud.

## Working on the docs

- Detail accumulating under a layer that has not been settled is this project's known failure
  mode — it happened once already, at fourteen design documents and two script files
  (`rationale.md` §1). Prefer settling the layer above to writing more of the layer below.
- When a decision changes, **add** the new reasoning to `rationale.md` rather than editing the
  old. Superseded reasoning is still evidence.
- Do not duplicate content between documents. If two files would state the same fact, one of
  them should point at the other. Every drift bug in this repo's history started as a
  well-intentioned copy.
