# Work Package Spec — `pull-data.js` (local Node tool, not a Bitburner `ns` script)

Refer to `engineering-standards.md` for code style and to `spec-logging.md` for the files this tool retrieves. This package is different in kind from every other spec in this project: it doesn't run inside Bitburner at all — it's a small Node.js CLI that runs on your local machine (the one running Claude Code) and talks to the game over the same Remote API connection your push-sync tool already uses.

**This is the one piece of the whole project Claude Code can actually run and test itself**, since it's ordinary Node code with no Bitburner runtime dependency. The Verification Protocol's "neither Claude Code nor I can execute Bitburner code" constraint doesn't apply here — it should be exercised against a live game connection during implementation, not just read-reviewed.

## Purpose

Closes the gap flagged in `spec-logging.md`: the only documented way to get `/data/logs/*.jsonl` and `/data/status/*.json` out of the game and back to you (and, through you, back to me) was manual in-game-editor copy-paste, explicitly marked medium confidence and untested. Since the entire external-feedback loop this project is built around (`engineering-standards.md` §5) depends on getting real output back reliably, this needs a real tool rather than a manual fallback.

## Dependencies

- A running Remote API connection — same setup already used for pushing scripts to the game (Options → Remote API in Bitburner, hostname/port, Connect). This tool is a second client on the same protocol, not a replacement for your existing push-sync tool.
- Node.js with the `ws` package (WebSocket client) — no other dependencies needed.

## In Scope

1. A CLI script, `pull-data.js`, run manually from your terminal (`node pull-data.js`, no daemon/watch mode needed for v1 — see Out of Scope):
   - Connects to the Remote API over WebSocket using the same host/port your push tool uses (read from a small local `pull-config.json` — hostname, port, local output directory — analogous to `bitburner-filesync`'s `filesync.json`, not reusing that file directly since it's a different tool's config).
   - Calls `getFileNames` (or `getAllFiles` directly) scoped to the `/data/` path on the `home` server.
   - For every filename returned under `/data/logs/` and `/data/status/`, calls `getFile` (or uses the content already returned by `getAllFiles`) and writes it to a matching local path under the configured output directory (e.g. `./bitburner-data/logs/hacking-events.jsonl`).
   - Prints a summary: files pulled, byte counts, and timestamp — so a single run's output is easy to tell apart from a stale previous pull.
2. Handle the JSON-RPC envelope directly per the official spec (`jsonrpc: "2.0"`, incrementing `id`, `method`, `params`) — this is a small, well-defined protocol (documented at `bitburner-official/bitburner-src`'s `remote_api.md`), not worth pulling in a full client library for.
3. Basic connection-failure handling: if the WebSocket connection fails or times out, print a clear error and exit non-zero rather than hang — this is a manually-invoked tool, not a daemon, so "fail loud and stop" is the right behavior, not retry logic.

## Out of Scope

- Watch mode / continuous background syncing. You run this by hand when you want a fresh pull (e.g., before bringing output back to a chat session) — no need for it to run continuously alongside the in-game daemons. Can be revisited later if manual invocation turns out to be annoying in practice.
- Pulling anything outside `/data/logs/` and `/data/status/` — this tool isn't a general-purpose two-way file sync (that's what your existing push tool, or a "mirroring"-capable community tool, is for). Scope is deliberately narrow: get the diagnostic/log output back, nothing else.
- Any parsing, filtering, or summarization of the pulled JSONL/JSON content — that happens after, either by you or by me once you share it. This tool only moves bytes.
- Log rotation/retention on the local side — files are overwritten on each pull to match current game state; if you want history preserved locally, that's a manual `git commit` or copy, not something this tool manages.

## Verify Script — none in the usual sense

Since this tool runs locally and Claude Code can execute it directly, "verification" here means Claude Code actually running `node pull-data.js` against a real (or mocked) Remote API connection during implementation and confirming real output, not producing a paired `verify-*.js` for you to run in-game. Two-stage check:

1. **Local, no game needed**: unit-test the JSON-RPC request/response framing against a minimal mock WebSocket server, confirming `getFile`/`getAllFiles`/`getFileNames` requests are well-formed and responses are parsed correctly.
2. **Real, with the game running**: with Bitburner open and Remote API connected, run `node pull-data.js` for real and confirm the local `./bitburner-data/` directory actually contains current copies of whatever `/data/logs/` and `/data/status/` hold in-game at that moment. This is the one case in the whole project where you don't need to be the one reporting output back — Claude Code should just do this itself and tell you it passed, the same way it would test any other local Node script.

## Acceptance Criteria

1. `pull-data.js` run against a live Remote API connection produces local files matching the current in-game contents of `/data/logs/` and `/data/status/`, confirmed by spot-checking one file's contents against what the in-game editor shows for the same path.
2. Running it twice in a row with no game-side changes produces identical output both times (idempotent).
3. Disconnecting the Remote API mid-run (or pointing at a wrong port) produces a clear error message and non-zero exit, not a silent hang.
4. A pulled `.jsonl` log file parses line-by-line as valid JSON, matching what `verify-logging.js` already confirms in-game.

## Confidence Notes

- **High confidence** on the Remote API's JSON-RPC method shapes (`getFile`, `getAllFiles`, `getFileNames`) — sourced directly from the official `bitburner-src` documentation, not memory.
- **Medium confidence** that a second simultaneous WebSocket client (this tool, alongside your existing push-sync tool) is supported cleanly by the game's Remote API server — I haven't confirmed whether Bitburner's Remote API allows multiple concurrent client connections or expects exactly one. Worth checking early: if simultaneous connections aren't supported, this tool needs to be run with the push tool briefly disconnected, which is a minor workflow change, not a redesign.
- **Low confidence, unverified**: whether `getAllFiles` scoped by `server` also needs path-prefix filtering client-side (i.e., whether it returns *every* file on `home`, requiring this tool to filter for `/data/` paths itself) or whether the API supports scoping the request more narrowly. Cheap to determine empirically on first real run — not worth guessing further here.
