# Rollout Checklist — Activating This System On Your Live Save

Distinct from the dev **build order** in `bitburner-automation-architecture.md` §8 (the order to *implement* work packages) — this is the order to *turn them on* against your real save once built, and what to check before enabling the next one. Each step assumes the previous step's acceptance criteria already passed via its own `verify-*.js`.

**Universal kill switch**: every subsystem has `config.subsystems.<name>.enabled`. Setting it to `false` makes the coordinator zero that subsystem's budget and the daemon idle without acting (per `data-contracts.md`) — this is the first thing to reach for if anything looks wrong, faster than killing the script outright, and it doesn't lose the daemon's in-memory state.

## Step 0 — Before anything else

- Confirm the directory layout from `data-contracts.md`'s new "Script Directory Layout" section exists on `home` (folders created, or at least confirmed `ns.exec`/`ns.scp` calls resolve correctly for one test script).
- Run `pull-data.js` once against a live Remote API connection with an empty `/data/` to confirm the tool itself works before you're depending on it to debug something else.

## Step 1 — `coordinator.js` alone

- Run `verify-coordinator.js`. Confirm `config.json` gets created with defaults if it didn't exist, both boolean sum-checks read `true`.
- Start `coordinator.js` standalone for a few real cycles. Confirm `/data/status/summary.json` exists and the daemon prints one summary line per cycle, not log spam.
- **Go/no-go**: budgets.json contains explicit entries for all six subsystems, `hacking` money is `null`, disabled subsystems read `0`/`0`.

## Step 2 — `hacking` (batcher + prep + workers)

- Run `verify-hacking.js`, including its Formulas.exe signature sanity-check against `ns.hackAnalyze`.
- Enable `hacking` only, everything else still `false` in config, so it gets the full RAM budget while you watch it settle.
- Watch for `drift_detected`/`drift_repaired` events in `/data/logs/hacking-events.jsonl` (pull them with `pull-data.js`) over at least a few dozen batch cycles before trusting it unattended.
- **Go/no-go**: no repeated drift on the same target (a target drifting once and self-repairing is fine and expected; a target drifting every cycle means the spacer or thread math needs attention before moving on).

## Step 3 — `hacknet-manager.js`

- Run `verify-hacknet.js` (side-effecting — read its own warning again before running).
- Enable `hacknet` alongside `hacking`. Confirm `ramSharePriority`-driven budget split between the two looks sane in `coordinator.js`'s summary line.
- **Go/no-go**: no purchase exceeds `paybackThresholdSec`, confirmed against `/data/status/hacknet-roi-history.json` after a run.

## Step 4 — `singularity-agent.js`

- Run `verify-singularity.js` (fully read-only, per its own spec).
- Enable `singularity`. This is the one where `bootstrap.js` matters — confirm it exists and lists every daemon before you let the agent queue its first real augmentation purchase, since a queued-but-never-installed aug is harmless but an install with a broken `bootstrap.js` means manually restarting everything.
- **Do not** let it reach a real `installAugmentations()` call yet on this first pass — watch `augmentationPriorityList` behavior and `/data/status/singularity-recommendations.json` for a while first, per its spec's explicit caution that the first real install should be deliberate and watched, not incidental.
- **Go/no-go**: recommendations file only contains augs *not* on your priority list; priority-list augs are being purchased/queued autonomously as expected.

## Step 5 — `gang-manager.js`

- Run `verify-gang.js`. Pay special attention to the raw task-name and ascension-result output — this is where the spec's medium-confidence items get confirmed for real.
- Enable `gang`. Since gang is your money engine, watch `/data/status/gang.json`'s `moneyPerSec` closely for the first several cycles against what you were getting manually before automating it — this is the one subsystem where a regression is easy to notice directly (it should not be earning less than your manual play was).
- **Go/no-go**: territory warfare only engages when the logged win-chance is at or above threshold; no unexpected member deaths in a session where warfare wasn't supposed to engage.

## Step 6 — `corp-manager.js`

- Run `verify-corp.js` (side-effecting — one real material purchase).
- Enable `corp`. Watch the first few `material_test` events in `/data/logs/corp-events.jsonl` and sanity-check the computed elasticity against what you'd expect from the division's known behavior, before letting it run for an extended unattended stretch.
- **Go/no-go**: `bottleneckStage` in `/data/status/corp.json` changes over time as expected (e.g. moves from `production_mult` to `employee_capacity` once material purchases stop moving the needle) rather than staying stuck on one value indefinitely, which would suggest the diagnosis chain isn't actually re-evaluating.

## Step 7 — Everything together, unattended

- All subsystems `enabled: true`. Let it run for a real unattended stretch (a full offline period is the real test — the whole point of this project).
- Pull data afterward with `pull-data.js` and review the event logs for anything that looks like repeated failure rather than isolated/self-healed events.

## If something goes wrong mid-run

1. Flip the offending subsystem's `enabled` to `false` in `config.json` — no restart needed, it idles on the next coordinator cycle.
2. Pull logs with `pull-data.js` before doing anything else, so the failure state is captured rather than overwritten by continued (even idle) operation.
3. Bring the relevant `.jsonl`/status output back to a chat session for diagnosis, same loop as every other correction made during this project's design phase.
