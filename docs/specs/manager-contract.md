# Spec: Manager Contract

**Status:** normative. Pin this before writing any manager.
**Parent:** `claude/automation-architecture.md` §6–7.

Every manager in the fleet obeys this contract. It exists so that managers can be written,
tested, restarted and replaced independently, and so that no two managers can spend the same
dollar or the same gigabyte.

---

## 1. The three rules

1. **A manager never reads global money or free RAM to decide what to spend.** It reads its
   allowance from `/state/director.json`.
2. **Each file has exactly one writer.** Everyone may read anything. This makes locking
   unnecessary.
3. **Every write is a whole document.** No partial updates, no read-modify-write races.

---

## 2. File layout

```
/state/director.json          <- Director writes
/state/<manager>.json         <- that manager writes
/state/hwgw.<target>.json     <- that target's scheduler writes
/logs/<manager>.log           <- append-only, that manager writes
```

`ns.read` and `ns.write` cost **0 GB**, so state files are free relative to ports and are durable
across script restarts.

### Files vs. ports — the split

| Kind | Medium | Why |
|---|---|---|
| **State** — what a manager currently is | file | durable; survives crash, reload, install |
| **Standing directives** — `enabled`, `advisoryMode`, budgets | file | must still hold after a restart |
| **Transient commands** — `STATUS`, `RELOAD`, `SHUTDOWN` | **port** | one-shot and imperative; loss is recoverable by resending |
| **High-frequency telemetry** | port | loss is acceptable |

The distinction that matters: a manager paused by a *file* flag is still paused after it
crashes and restarts. A manager paused by a *port message* is not. So anything that must
survive a restart is a file, and ports carry only imperatives.

---

## 3. Manager state envelope

Every `/state/<manager>.json` carries this envelope. Manager-specific data goes in `detail`.

```jsonc
{
  "schema": 1,
  "manager": "corp",
  "pid": 1234,
  "startedAt": 1755561600000,
  "lastRun": 1755561783000,
  "tickMs": 1000,              // expected loop period; the watchdog uses this
  "health": "ok",              // "ok" | "degraded" | "blocked" | "error"
  "message": null,             // human-readable reason when health != "ok"
  "spentThisRun": 0,           // cash spent since startedAt, for observability
  "wants": [],                 // see §5
  "detail": { }                // manager-specific; schema owned by that manager's doc
}
```

**Health semantics:**

| Value | Meaning | Watchdog action |
|---|---|---|
| `ok` | operating normally | none |
| `degraded` | working, but sub-optimally (e.g. partial recipe step, congestion recovering) | none |
| `blocked` | cannot progress without something external (funds, an unlock, a decision) | none — log it |
| `error` | unexpected exception; state may be inconsistent | restart |

`blocked` is **not** an error. A manager waiting for funds is behaving correctly.

---

## 4. Director state

```jsonc
{
  "schema": 1,
  "lastRun": 1755561783000,
  "bitNode": 3,
  "phase": "EARLY",
  "phaseSince": 1755558000000,
  "reserveFloor": 5000000,
  "timeToInstallSec": null,        // null until the augs manager can estimate it
  "cash": {                        // fractions; MUST sum to <= 1
    "infra": 0.30,
    "corp": 0.00,
    "augReserve": 0.70
  },
  "ram": {
    "corp":          [ { "host": "home", "gb": 64 } ],
    "hwgw:n00dles":  [ { "host": "pserv-0", "gb": 512 } ],
    "reserve":       [ { "host": "home", "gb": 32 } ]
  },
  "bodies": { "player": "crime:homicide", "sleeve0": "faction:NiteSec" },
  "directives": {
    "haltPerishableSpending": false,
    "advisoryMode": false          // global kill-switch: plan but never execute
  }
}
```

### Cash allocation semantics

A manager computes its budget **at the moment it wants to spend**:

```
budget = cash[me] * max(0, playerMoney - reserveFloor)
```

Never cached, never pre-allocated. Three properties follow:

- **Never stale** — money arrives continuously, the fraction re-evaluates continuously.
- **No messaging** — no request/approve round trip.
- **Race-safe** — if the fractions sum to ≤ 1, simultaneous spenders cannot collectively breach
  the floor, because each takes at most its own share of the same headroom.

### RAM allocation semantics

RAM is physical and over-commit fails loudly, so it is granted as explicit `(host, gb)` leases
rather than fractions. A manager `exec`s **only** into its own leases and tracks its own usage
against them.

Managers must still handle `ns.exec` returning `0`. Leases can be wrong.

### `advisoryMode`

When true, every manager plans normally, writes its intended action list into `detail`, logs it —
and executes nothing. This is the primary safety mechanism for irreversible actions and the
main way new managers are validated.

---

## 5. The `wants` schema

Published by every manager from day one, **even though the v1 Director ignores it**. It costs
nothing, gives immediate observability, and is exactly the input a future ROI-bidding Director
consumes — so upgrading the Director requires no manager changes.

```jsonc
{
  "id": "pserv-upgrade-512",         // stable across ticks for the same want
  "resource": "cash",                // "cash" | "ram"
  "cost": 110000000,                 // dollars, or GB when resource == "ram"
  "expectedGainPerSec": 90000,       // dollars/sec, or null if not monetisable
  "paybackSec": 1222,                // null when permanent or non-monetisable
  "permanent": false,                // survives an augmentation install?
  "priority": 0.8                    // manager's own 0..1 ranking among its wants
}
```

`resource` distinguishes cash wants from RAM wants — they flow through different mechanisms
(fractions vs leases) but appear in the same array.

`permanent` matters because the Director's payback gate is
`paybackSec < timeToInstallSec || permanent == true`. See the perishable/permanent ledger in
`claude/automation-architecture.md` §2.

---

## 6. Manager lifecycle

Every manager, every tick:

1. Read `/state/director.json`. If missing or stale, use safe defaults and set `health` to
   `degraded`.
2. Read the game state it needs.
3. Plan — a **pure** function from snapshot to action list.
4. If `advisoryMode`, log the action list and skip step 5.
5. Execute, inside its allowance, each action wrapped so that one failure does not kill the loop.
6. Write its own state file — **always**, including on failure paths.

### Restart safety

A manager may be killed at any moment — RAM pressure, an exception, a game reload, an
augmentation install. Therefore:

> **Every action is expressed as convergence toward a target state, never as a discrete
> imperative.** "Ensure warehouse level is 17", not "buy 17 warehouse upgrades."

Restart safety is then free rather than bolted on. The same principle governs the HWGW prep loop
and the corp recipe engine.

### Watchdog

`daemon/watchdog.js` reads every `/state/*.json` and restarts a manager when either holds:

- `now - lastRun > 3 * tickMs`  (the manager is stuck or dead)
- `health == "error"`

The watchdog never inspects `detail` and never makes domain decisions. It has one job.

---

## 6a. Control channel

Each manager owns one fixed port and reads it at the top of every tick. This exists so a human
(or the Director) can poke a running manager from the terminal without editing JSON.

```jsonc
{ "ts": 1755561783000, "id": "a1", "from": "terminal", "to": "corp",
  "type": "STATUS", "data": null, "reply": false }
```

| Command | Effect |
|---|---|
| `STATUS` | reply on the sender's port with the current state envelope |
| `RELOAD` | re-read `director.json` and any static data immediately |
| `PAUSE` / `RESUME` | transient; the durable equivalent is the `enabled` flag below |
| `SHUTDOWN` | exit cleanly after finishing the current tick |

### Pausing: idle, never exit

The durable pause is `director.json` → `subsystems.<name>.enabled = false`. A disabled manager
**keeps running its loop and keeps writing its state file, but takes no actions** and reports
`health: "blocked"` with a message saying it is disabled.

It does **not** exit. That means you can toggle a subsystem off and back on live without killing
and relaunching processes, and the watchdog does not fight you by restarting something you
deliberately stopped. This is the first thing to reach for when something looks wrong — faster
and safer than killing the script.

*(This pattern is carried over from the `BaseDaemon` in `prior_scripts/sn/lib/base_daemon.js`,
which had the right shape: `startUp` / `loopBody` / `shutDown`, a per-daemon port, a message
queue, and PAUSE/RESUME/SHUTDOWN/STATUS. Two defects in that implementation should not be
carried forward: `Symbol.toPrimative` is a typo for `Symbol.toPrimitive`, so that method never
fires; and the STATUS reply calls `sendMessage` with four positional arguments in the wrong
order. Also prefer `ns.getPortHandle()` and `handle.empty()` over polling `ns.peek()` against
the legacy `"NULL PORT DATA"` sentinel.)*

## 7. Logging

```
/logs/<manager>.log     append-only, one JSON object per line
```

```jsonc
{ "t": 1755561783000, "lvl": "info", "ev": "recipe.step", "step": "warehouse", "detail": {...} }
```

Levels: `debug`, `info`, `warn`, `error`. Anything at `warn` or above also fires `ns.toast`.

Every **irreversible** action logs at `warn` with the full predicate values that triggered it,
before it executes.

---

## 8. Versioning

`schema` is an integer on every file. Readers must tolerate a **lower** schema by falling back to
defaults, and must refuse a **higher** one by setting `health: "error"` rather than
misinterpreting fields. Bump it whenever a field's meaning changes; adding an optional field does
not require a bump.
