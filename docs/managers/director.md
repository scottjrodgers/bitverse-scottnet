# Manager: `director`

**Status:** scoped, not designed.
**Build order:** step 4 (after `infra` and `targeting`, before `factions`/`augs`).
**Parent:** `claude/automation-architecture.md`

---

## Responsibility

Owns exactly three things, and nothing else:

1. **The phase** — which of `BOOTSTRAP / EARLY / KARMA / GANG / CORP / PRE_INSTALL / INSTALL`
   the run is in.
2. **The cash split** — fractions per manager, plus the reserve floor.
3. **RAM leases** — `(host, GB)` grants per manager.

Later, once sleeves exist: **body allocation** (player + each sleeve to an activity).

### Explicitly out of scope

Any domain logic at all. The Director never buys a server, never picks a target, never joins a
faction. If it is reasoning about *what* to buy rather than *how much any manager may spend*,
the logic is in the wrong place.

---

## Time constant

Seconds. Slow relative to everything except `hwgw`. Phase transitions and budget shifts do not
need sub-second reaction.

---

## Inputs

- Game state: money, hacking level, home RAM, server inventory, whether a gang/corp/bladeburner
  exists, augs owned, karma, SF levels
- `/state/<manager>.json` from every running manager — in particular their `wants` arrays
- Its own previous `/state/director.json` (for hysteresis)

## Output — `/state/director.json`

```jsonc
{
  "phase": "EARLY",
  "phaseSince": 1234567890,
  "reserveFloor": 5e6,
  "timeToInstallSec": 3600,          // estimate; see open questions
  "cash": { "infra": 0.30, "hacknet": 0.10, "augReserve": 0.60 },
  "ram": {
    "hwgw:n00dles": [ { "host": "pserv-0", "gb": 512 } ],
    "share":        [ { "host": "home",    "gb": 128 } ],
    "reserve":      [ { "host": "home",    "gb": 32  } ]
  },
  "bodies": { "player": "crime:homicide", "sleeve0": "crime:homicide" },
  "directives": { "haltPerishableSpending": false }
}
```

Fractions in `cash` must sum to ≤ 1. That constraint is what makes concurrent spending
race-safe (see architecture §7).

---

## Key decisions still to make

1. **Phase transition predicates.** Each needs a concrete, observable condition plus hysteresis
   so the run cannot oscillate between phases. `KARMA` in particular runs *parallel* to
   `EARLY`/`GANG` rather than being a distinct state — decide whether phases are a single enum
   or a small set of orthogonal flags.
2. **The fraction table per phase.** Hand-authored constants for v1. Where do they come from,
   and how are they tuned?
3. **Reserve floor policy.** Should grow as `PRE_INSTALL` approaches so that aug money is not
   spent on a pserv upgrade the hour before an install. Linear ramp? Step function? Derived from
   the `augs` manager's stated shortfall?
4. **Time-to-install estimation.** Every payback gate depends on this and it is circular —
   spending changes the estimate, which changes the spending. Needs damping.
5. **RAM lease granularity and revocation.** Does the Director ever pre-empt a running HWGW
   pipeline to reclaim RAM, or only reallocate when a pipeline exits? Pre-emption is more
   responsive; exit-only is far simpler and cannot corrupt an in-flight batch.
6. **Manager lifecycle.** Who launches managers, who detects a crashed one, who restarts it.
   Single-writer state files make recovery easy (stale `lastRun` is the signal) but the
   supervision mechanism is undecided.
7. **The `share()` vs. HWGW split.** The one genuine RAM tension. Needs the `share()` power
   formula first, and a rep-shortfall signal from `factions`.

---

## v1 scope

Policy-based, not ROI-based. A phase machine plus a hand-authored fraction table plus static
RAM leases recomputed on pipeline start/stop. Ignore `wants` entirely — but read and log them,
so the data is accumulating for v2.

## v2 direction

Marginal-ROI allocator. Rank all managers' `wants` by `expectedGain / cost`, gated by
`paybackSec < timeToInstallSec || permanent == true`, allocate greedily down the list. The
manager contract does not change — only the Director's decision function.

---

## Open questions

- Should phases be one enum or orthogonal flags? (`KARMA` overlaps everything.)
- What happens to in-flight state when `INSTALL` fires — is there a clean shutdown protocol, or
  do managers just die with the reset?
- Does the Director survive the install (it is on home, so its file does), and how does it
  re-bootstrap the manager fleet?
