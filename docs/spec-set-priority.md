# Work Package Spec — `set-priority.js`

Refer to `engineering-standards.md` and `data-contracts.md`. This is an in-game `ns` script run manually from the Bitburner terminal, not a daemon and not the local Node tool from `spec-pull-tool.md`. Explicitly deferred out of `spec-coordinator.md`'s scope ("a `set-priority.js` convenience editor script — useful, but a separate small package, not bundled into this one") — this spec is that separate package.

## Purpose

A command-line editor for the tunable fields in `/data/config.json`, so adjusting priorities (RAM share weights, objective weights, subsystem on/off, payback/territory/ascension thresholds) doesn't require opening the JSON file directly. `data-contracts.md` already documents several fields as "live-adjustable" (`hacking.ramSharePriority`, `hacking.numTargets`, `hacking.spacer`, etc.) — this tool is what makes that adjustability actually convenient rather than theoretical. Every daemon already reads `config.json` fresh each cycle, so this script only needs to read-modify-write the file; it doesn't need to signal any running daemon directly.

## Dependencies

- `/data/config.json` must already exist (created by `coordinator.js`'s `loadConfig` on its first run per `spec-coordinator.md`). If it doesn't exist yet, `set-priority.js` should say so clearly and exit rather than try to bootstrap defaults itself — that's `coordinator.js`'s job, not this script's, per the "implement exactly what's specified" principle.

## In Scope

### 1. Default invocation (no arguments) — read-only
- `run set-priority.js` with no args reads `config.json` and prints every editable field (see the whitelist table below) in a labeled, human-readable format, one line per field, current value shown — e.g. `objectiveWeights.money = 1.0`, `subsystems.gang.territoryWarfareWinThreshold = 0.68`. This is the "what can I even change, and what's it set to right now" mode, and it's the safe default — running the script with no args never modifies anything.

### 2. Setting fields — `key=value` arguments
- `run set-priority.js subsystems.hacking.ramSharePriority=2.0` sets one field. Multiple `key=value` pairs in a single invocation are supported (`run set-priority.js objectiveWeights.money=2.0 subsystems.gang.enabled=false`) and are applied as a single atomic read-modify-write — one `ns.read`, all changes applied in memory, one `ns.write` — so a multi-field change never leaves `config.json` in a torn intermediate state if you're changing several related settings together.
- The `key` is always the literal dot-path matching `config.json`'s actual JSON structure as documented in `data-contracts.md` (`subsystems.gang.enabled`, not a shorthand like `gang.enabled`) — this avoids inventing a second mental mapping that has to stay in sync with the real schema.
- Every field write is validated against the whitelist and type table below **before** anything is written to disk. If any single `key=value` pair in the invocation fails validation (unknown path, wrong type, out-of-range value), the entire invocation is rejected and `config.json` is left completely untouched — no partial application of a batch where some fields were valid and others weren't.
- After a successful write, print a confirmation line per field changed: `objectiveWeights.money: 1.0 -> 2.0`.

### 3. Editable field whitelist and validation

Only the fields below can be set through this script. Every other field in `config.json` (string enums, arrays) is intentionally excluded from v1 — see Out of Scope for why — and attempting to set one prints a clear "not editable via this tool, edit config.json directly" message rather than a generic error.

| Path | Type | Constraint |
|---|---|---|
| `objectiveWeights.money` | float | >= 0 |
| `objectiveWeights.rep` | float | >= 0 |
| `objectiveWeights.hackingXp` | float | >= 0 |
| `objectiveWeights.augReadiness` | float | >= 0 |
| `subsystems.hacking.enabled` | bool | — |
| `subsystems.hacking.ramSharePriority` | float | >= 0 |
| `subsystems.hacking.numTargets` | int | >= 1 |
| `subsystems.hacking.hackFraction` | float | 0 < x <= 1 |
| `subsystems.hacking.spacer` | int (ms) | > 0 |
| `subsystems.hacking.detailedLogging` | bool | — |
| `subsystems.hacknet.enabled` | bool | — |
| `subsystems.hacknet.paybackThresholdSec` | float | > 0 |
| `subsystems.corp.enabled` | bool | — |
| `subsystems.corp.structuralApprovalThreshold` | number | >= 0 |
| `subsystems.corp.testIncrementFraction` | float | 0 < x <= 1 |
| `subsystems.stock.enabled` | bool | — |
| `subsystems.gang.enabled` | bool | — |
| `subsystems.gang.territoryWarfareWinThreshold` | float | 0-1 |
| `subsystems.gang.ascensionMultiplierThreshold` | float | >= 1.0 |
| `subsystems.gang.wantedLevelThreshold` | float | > 0 |
| `subsystems.singularity.enabled` | bool | — |
| `subsystems.singularity.installBatchSize` | int | >= 1 |
| `subsystems.singularity.installMaxWaitCycles` | int | >= 1 |
| `subsystems.singularity.donateFavorThreshold` | float | >= 0 |
| `subsystems.bladeburner.enabled` | bool | — |
| `subsystems.bladeburner.chaosThreshold` | float | >= 0 |
| `subsystems.bladeburner.lowStaminaThreshold` | float | 0-1 |
| `subsystems.bladeburner.teamSize` | int | >= 1 |

Excluded on purpose, hand-edit these directly in `config.json`: `subsystems.corp.autonomyLevel` (string enum whose valid values aren't fully enumerated anywhere in the docs yet — safer to hand-edit than to validate against an incomplete list), `subsystems.gang.type` (string enum, same reasoning, and changing it has larger downstream implications per `spec-gang-manager.md`'s scope notes), `subsystems.singularity.augmentationPriorityList` (array — needs add/remove semantics this tool doesn't build in v1, see Out of Scope), `subsystems.bladeburner.neverAutoBlackOps` (array, and specifically a safety-critical one per `spec-bladeburner-manager.md` — editing the list that decides which actions are irreversible/BitNode-ending should require deliberately opening the JSON file, not a quick terminal one-liner that's easy to fat-finger).

### 4. Help/list mode
- `run set-priority.js --help` (or `-h`) prints the whitelist table above in the same labeled format as the default read-only mode, plus one line of usage syntax — so you don't have to come back to this doc to remember the exact dot-paths.

## Out of Scope

- Editing `subsystems.corp.autonomyLevel`, `subsystems.gang.type`, or `subsystems.singularity.augmentationPriorityList` — string-enum and array fields excluded per the table above. If this turns out to be annoying in practice, it's a small follow-up revision (add/remove verbs for the array case, an enumerated-and-validated set for the string case), not a reason to build it speculatively now.
- Any daemon-signaling or live-reload push — not needed, since every daemon already re-reads `config.json` each cycle per its own spec (`data-contracts.md` explicitly calls out several fields as "live-adjustable... on its next pass, not require a restart"). This script only needs to change the file.
- A config diff/history feature (e.g. "show me what changed in the last N edits") — `config.json` isn't logged the way `/data/logs/*.jsonl` is; if you want a history of tuning changes over time, that's a candidate for a future small addition to `logginglib.js` usage here, not something to build into this script now.
- Interactive/prompted mode — arguments only, no `readline`-style back-and-forth. Matches how every other script in this project is invoked.

## Verify Script — `verify-set-priority.js`

**Has a side effect and must say so clearly**, unlike most verify scripts — it exercises real field changes to `config.json`, though every change it makes is deliberately reverted by the end of the run so `config.json` is left exactly as it started.

```
CHECK: config.json exists -- print raw current whitelist field values (same as
       running set-priority.js with no args)
CHECK: set one known-safe field (subsystems.gang.wantedLevelThreshold) to a new
       test value -- confirm config.json on disk actually changed
CHECK: set two fields in one invocation (objectiveWeights.money=2.0,
       subsystems.hacknet.enabled=false) -- confirm both changed atomically
CHECK: attempt to set an unknown path (subsystems.gang.bogusField=1) -- confirm
       rejected with a clear message and config.json completely unchanged
CHECK: attempt to set a known path with an invalid value
       (subsystems.gang.territoryWarfareWinThreshold=1.5, out of the 0-1 range)
       -- confirm rejected and config.json unchanged
CHECK: attempt to set an excluded field (subsystems.corp.autonomyLevel=foo) --
       confirm rejected with the "edit config.json directly" message, not a
       generic error
CHECK: revert every field changed by this verify run back to its original value
       -- confirm config.json now matches the very first CHECK's printed state
```

**Expected output when correct:** every `CHECK:` line present, both the atomic multi-field write and the three rejection cases behave exactly as described, and the final revert step leaves `config.json` byte-for-byte equivalent (semantically — field values match, not necessarily key ordering) to how it started.

## Acceptance Criteria

1. `verify-set-priority.js` passes as described, and `config.json` is confirmed unchanged after the full run.
2. Running `set-priority.js` with no arguments never writes to `config.json` under any circumstance.
3. A multi-field invocation where one field is invalid rejects the entire batch — confirmed by checking that the valid field(s) in that same invocation were *not* partially applied.
4. Setting `subsystems.hacking.ramSharePriority` and observing `coordinator.js`'s next cycle (per `spec-coordinator.md`'s own acceptance criteria around live reconfiguration) confirms the change actually takes effect without restarting anything — this is really re-confirming `coordinator.js`'s existing behavior, but worth checking end-to-end once this tool exists as the normal way you'll be making that kind of change going forward.

## Confidence Notes

- **High confidence** on the overall shape (whitelist + type/range validation + atomic batch write) — this is a standard config-editor pattern, not a Bitburner-specific claim.
- **Medium confidence** on `ns.args` parsing conventions for `key=value`-style arguments — Bitburner passes terminal arguments as a plain array of strings/numbers; the `key=value` splitting and type coercion is ordinary string parsing, low risk, but worth confirming `ns.args` doesn't do anything unexpected with the `=` character or numeric-looking arguments before relying on it (e.g. whether `ns.args` auto-coerces `"2.0"` to a number `2` on its own, which would need to be handled consistently either way).
- **Explicitly a scope judgment call, not a fact**: excluding `autonomyLevel`/`gang.type`/`augmentationPriorityList` from v1 is a deliberate "don't validate against an enum we haven't fully enumerated" decision, not a technical limitation — revisit if hand-editing those three specific fields turns out to be annoying enough in practice to justify the extra validation work.
