# Foundational Spec — `logginglib.js`

Refer to `engineering-standards.md` and `data-contracts.md`. This is a shared library like `coordinatorlib.js`, used by every subsystem going forward, not hacking-specific — specced separately for the same reason `coordinatorlib.js` was pulled out of `spec-coordinator.md`.

## Purpose

Operational logs distinct from `/data/status/<subsystem>.json`: status files are ephemeral, overwritten every cycle, meant for live monitoring. This library produces an append-only, time-ordered event history meant to be downloaded and handed back for analysis — the same external-feedback pattern the whole project already runs on (you report real numbers, the design gets corrected against them), formalized into something that doesn't require you to be watching in real time to capture.

## In Scope

- `logEvent(ns, subsystem, eventType, fields)` — appends one line to `/data/logs/<subsystem>-events.jsonl`. Each line is a single JSON object:
  ```json
  {"schemaVersion": 1, "ts": 1234567890123, "subsystem": "hacking", "eventType": "batch_dispatched", "target": "foodnstuff", "hackThreads": 42, "...": "..."}
  ```
  JSONL (one JSON object per line, not a single array) specifically because it's append-safe — no need to read, parse, and rewrite the whole file on every event, which matters once these files get large over a long unattended run.
- `rotateIfNeeded(ns, subsystem)` — called by `logEvent` before writing. If the current file's line count exceeds `MAX_LINES_PER_FILE` (named constant, suggested default 5000 — a guess, not a verified game constraint; flagged below), renames it to `<subsystem>-events-<timestamp>.jsonl` and starts a fresh active file. This is a defensive default against unbounded growth, not a response to a confirmed hard limit — I don't have verified information on whether Bitburner enforces a practical file-size ceiling, and rather than assert one, this should be treated as a cheap safety margin.
- Every subsystem daemon that wants operational logging imports this and calls `logEvent` at whatever points its own spec defines (see `spec-hacking.md` for the first concrete usage).

## Out of Scope

- Any analysis, aggregation, or querying of the logs — that happens after you download and share them, not in-game. This library only writes; it doesn't read its own output back.
- Automatic upload/export — Bitburner doesn't have a network-out mechanism for this. You'll pull the file contents out manually (see below).
- A universal schema for `fields` — each subsystem's spec defines its own event types and field shapes. This library only enforces the common envelope (`schemaVersion`, `ts`, `subsystem`, `eventType`).

## Getting Logs Out Of The Game

**Confidence: medium — worth confirming in-game rather than trusting this description.** The straightforward path is opening the log file in the in-game script editor (any `.txt`/`.js`/data file the game has written is viewable there) and copying its contents out, or using `ns.read(filename)` plus `ns.tprint()` to dump it to the terminal for copy-paste if the editor route doesn't work well for a large file. If Bitburner's version you're running has a more direct export/download affordance, use that instead — this is exactly the kind of detail that should be confirmed once rather than guessed at twice.

## Verify Script — `verify-logging.js`

Non-destructive. Calls `logEvent` a handful of times with dummy data, then reads the file back and confirms line count and JSON-parseability of every line.

```
CHECK: wrote 5 test events to /data/logs/test-events.jsonl
CHECK: file now contains <X> lines (expected: 5, or more if the file pre-existed)
CHECK: every line parses as valid JSON with the common envelope fields present? <bool>
CHECK: rotation triggers correctly -- write MAX_LINES_PER_FILE+1 dummy events, confirm
       a rotated file appears and the active file resets
```

**Expected output when correct:** all `CHECK:` lines true, no malformed lines, rotation confirmed to actually happen at the configured threshold.

## Acceptance Criteria

1. `verify-logging.js` passes as described above.
2. A real subsystem (hacking, once revised) produces a `.jsonl` file with events that parse cleanly and match the field shapes defined in that subsystem's own spec.
3. File growth doesn't silently continue forever without rotation once the line threshold is crossed.
