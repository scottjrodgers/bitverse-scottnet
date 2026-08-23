# bitverse-scottnet

Bitburner automation: managers, corp pipeline, HWGW batching.

**Start at [`docs/START-HERE.md`](docs/START-HERE.md).** It carries the current BitNode and
objective, the settled decisions, the open questions, and the map of the rest of the doc set.

- `docs/specs/` — normative. An implementation must conform to these.
- `docs/reference/` — reference. Why the design is what it is, and verified game mechanics.
- `scripts/` — everything that syncs into the game (JS only).
- `src/` — the Python filesync tool. `python bb.py serve --watch`.
- `test/` — Node tests. `npm test`.
