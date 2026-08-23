# Spec: Manager Contract

**Status:** normative. Pin this before writing any manager.
**Parent:** `specs/strategy.md` — the strategy layer above this one. It owns
`/state/director.json`; where the two documents disagree about that file, strategy.md wins.
**Why it is the way it is:** `reference/rationale.md`.

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
/memory/<manager>.json        <- that manager writes; survives an install
```

`/state/` is wiped wholesale on an augmentation install and `/memory/` is not. A manager that
writes a calibration, a measured constant, or a solved contract into `/state/` loses it every
cycle. See `specs/strategy.md` §8.2 for the test.

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
  "held": { },                 // resource id -> amount actually in use; strategy.md §7.2
  "candidates": [],            // see §5
  "launch": {                  // how the watchdog restarts this manager; see §6
    "script": "/daemon/corp.js",
    "host": "home",
    "threads": 1,
    "args": []
  },
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
  "subsystems": {                  // durable per-manager enable flags; see §6a
    "corp": { "enabled": true },
    "hwgw": { "enabled": false }
  },
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

## 5. The `candidates` schema

Published by every manager from day one. A manager advertises **tiers** of what it could do with
more resource, each priced in the resource it needs, and the Director allocates against them.

**`specs/strategy.md` §6.1 defines this schema and owns it.** Reproduced here only far enough to
write a manager against.

```jsonc
// production candidate — a standing tier, satisfied by a lease
{
  "id": "hwgw:phantasy:t2",       // stable across ticks for the same tier
  "kind": "production",
  "tier": 2,
  "produces": { "path": "player.money", "ratePerSec": 4.2e6 },
  "requires": { "ram": 4096 },
  "transition": { "startSec": 240, "stopSec": 90 },
  "confidence": "measured"        // "measured" | "modelled" | "guessed"
}

// purchase candidate — one-shot, satisfied by an approval
{
  "id": "pserv-upgrade:512->1024",
  "kind": "purchase",
  "cost": { "money": 1.1e8 },
  "produces": { "path": "player.money", "ratePerSec": 90000 },
  "permanent": false              // survives an augmentation install?
}
```

Three things a manager author needs that the schema does not state:

- **`produces.path` is the entire coupling between a candidate and a goal.** A candidate whose
  path matches no enabled goal is discarded before it is scored. Advertise the path the
  Director's world view actually carries, not a synonym for it.
- **Advertise tiers, not one take-it-or-leave-it bid.** A manager offering only "give me 4096 GB"
  cannot be told it has 512. Saturation is detected by successive tiers scoring toward zero, so
  a single-tier manager is invisible to that mechanism and will be over- or under-fed.
- **`transition` is the only anti-thrash mechanism.** A manager that is expensive to disturb
  advertises a large `startSec`/`stopSec` and is reallocated away from less often. There is no
  hysteresis constant to tune — see `specs/strategy.md` §7.3.

`permanent` matters because the Director's payback gate is
`paybackSec < horizon || permanent == true` — the perishable/permanent rule from
`reference/mechanics.md` §1, generalised in `specs/strategy.md` §6.5.

`held`, in the envelope (§3), is the other half of a lease: the Director writes `granted` and
`requested` in `director.json`, the manager writes what it is actually using. `held > requested`
during a drain is normal, not an error.

> **Superseded.** Earlier drafts defined a single `wants` array carrying `resource`, `cost`,
> `paybackSec`, `permanent` and `priority`. It used one shape for one-shot purchases and
> standing leases, which are different problems — a Director holding only that array cannot
> express "reduce this consumer to 512 GB." See `reference/rationale.md` §4.

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

`daemon/watchdog.js` reads every `/state/*.json`, decides whether each manager is alive, and
restarts the ones that are not. It never inspects `detail` and never makes a domain decision.
It has one job, and four ways of getting it wrong.

**Liveness.** A manager is dead when either holds:

- `now - lastRun > staleAfterMs`  (stuck or dead)
- `health == "error"`

```
staleAfterMs = max(3 * tickMs, STALE_FLOOR_MS)          // STALE_FLOOR_MS = 10_000
```

The absolute floor exists because `3 * tickMs` alone is unusably tight for a fast loop. The corp
daemon wakes on `ns.corporation.nextUpdate()`, whose real period is 200 ms to 2 s
(`reference/mechanics.md` §9), which puts `3 * tickMs` well under a second — a figure a React
re-render, an autosave, or a backgrounded tab will exceed routinely. **Restarting a healthy
manager is strictly worse than noticing a dead one ten seconds late**, because a restart
discards in-flight convergence and re-pays the manager's start-up cost.

**Launch grace.** A manager that has just been started has not written its state file yet, so it
is indistinguishable from one that is dead. The watchdog records `launchedAt` when it execs, and
judges nothing until

```
now - launchedAt > max(staleAfterMs, LAUNCH_GRACE_MS)   // LAUNCH_GRACE_MS = 15_000
```

Without this the watchdog restarts every manager it starts, immediately and forever. The same
grace applies to a manager started by hand, from its envelope's `startedAt`.

**Restart metadata.** The watchdog knows a manager's name; it does not know how to run it. Each
manager therefore publishes `launch` in its envelope (§3), and a restart is:

1. `ns.kill(pid)` **first.** Two live copies both writing `/state/<manager>.json` breaks rule 2
   of §1, and a wedged process still holds its RAM.
2. `ns.exec(launch.script, launch.host, launch.threads, ...launch.args)`.
3. Record `launchedAt`, bump the restart counters.

A manager with no `launch` block cannot be restarted. The watchdog logs that at `error` and
leaves it alone rather than guessing a script path.

**Crash-loop backoff.** A manager that throws during start-up satisfies `health == "error"`
forever, and an unconditional watchdog will restart it several times a second while appearing to
work. Restarts are therefore spaced and bounded:

```
delayMs = min(BACKOFF_BASE_MS * 2 ** consecutive, BACKOFF_MAX_MS)   // 5_000, 300_000

consecutive += 1 on every restart
consecutive  = 0 once the manager has reported health != "error" for
               GOOD_PASSES consecutive watchdog passes              // default 3
```

After `MAX_CONSECUTIVE` restarts (default 5) the watchdog **stops restarting that manager**, sets
`gaveUp` for it, logs at `error` and toasts. A manager that cannot start needs a human; a
watchdog hammering it converts a loud failure into a quiet one. Clearing `gaveUp` is deliberate —
start the manager by hand, or `RELOAD` the watchdog on its port.

Note that `consecutive` counts restarts, not errors. A manager that reports `error`, is
restarted, runs healthily for an hour and then errors again has `consecutive == 1`, not 2. The
counter is measuring "cannot start," not "is unreliable."

**The watchdog's own state.** `/state/watchdog.json`, watchdog-written, one record per manager:
`launchedAt`, `restarts`, `consecutive`, `lastRestartAt`, `gaveUp`. This is observation rather
than knowledge, so it lives in `/state/` and is wiped on install with everything else there.
That is correct: after an install nothing has been started yet and no manager is in a crash
loop.

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
