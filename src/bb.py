#!/usr/bin/env python3
"""
CLI front-end for the Bitburner filesync tool.

Run `bb.py serve` once and leave it running - that's the process holding
the websocket connection to the game. Every other subcommand is a thin
client that sends one command to that running daemon over a local
control-plane socket and prints the reply.

    python bb.py init                  # write a default config.toml
    python bb.py serve --watch         # start the daemon, auto-push on change
    python bb.py status                # is the game connected?
    python bb.py sync                  # push every matching file once
    python bb.py push scripts/hack.js  # push one file
    python bb.py pull hack.js          # pull one file down to disk
    python bb.py pull-all              # pull everything down to disk
    python bb.py list                  # filenames on the server
    python bb.py ram hack.js           # RAM cost
    python bb.py defs                  # fetch NetscriptDefinitions.d.ts
    python bb.py servers               # all known servers
    python bb.py save                  # fetch the current save file
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

from bb_config import load_config
from bb_daemon import Daemon

DEFAULT_CONFIG_PATH = Path("config.toml")


def _send_control_command(control_port: int, cmd: str, args: dict | None = None) -> dict:
    async def _run() -> dict:
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", control_port)
        except (ConnectionRefusedError, OSError):
            return {"ok": False, "error": "Daemon isn't running. Start it first with: python bb.py serve"}

        try:
            writer.write((json.dumps({"cmd": cmd, "args": args or {}}) + "\n").encode("utf-8"))
            await writer.drain()
            line = await reader.readline()
        finally:
            writer.close()

        if not line:
            return {"ok": False, "error": "Daemon closed the connection without a response"}
        return json.loads(line.decode("utf-8"))

    return asyncio.run(_run())


def _print_result(response: dict) -> None:
    if response.get("ok"):
        result = response.get("result")
        if isinstance(result, str):
            print(result)
        else:
            print(json.dumps(result, indent=2))
    else:
        print(f"Error: {response.get('error')}", file=sys.stderr)
        sys.exit(1)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Bitburner filesync")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH, help="Path to config.toml")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="Create a default config.toml if one doesn't exist")

    p_serve = sub.add_parser("serve", help="Start the daemon (leave this running)")
    p_serve.add_argument("--watch", action="store_true", help="Auto-push files as they change")

    sub.add_parser("status", help="Show connection status")

    p_push = sub.add_parser("push", help="Push one local file to the game")
    p_push.add_argument("path", help="Local file path")
    p_push.add_argument("--server")

    p_sync = sub.add_parser("sync", help="Push every matching file under the configured directory")
    p_sync.add_argument("--server")

    p_pull = sub.add_parser("pull", help="Pull one file from the game to disk")
    p_pull.add_argument("filename", help="Bitburner filename, e.g. hack.js")
    p_pull.add_argument("--out", help="Local path to write to (default: mirrors the sync directory)")
    p_pull.add_argument("--server")

    p_pull_all = sub.add_parser("pull-all", help="Pull every file from the game to disk")
    p_pull_all.add_argument("--out-dir", help="Directory to write into (default: the sync directory)")
    p_pull_all.add_argument("--server")

    p_list = sub.add_parser("list", help="List filenames on a server")
    p_list.add_argument("--server")

    p_meta = sub.add_parser("metadata", help="Show metadata for one file")
    p_meta.add_argument("filename")
    p_meta.add_argument("--server")

    p_all_meta = sub.add_parser("all-metadata", help="Show metadata for every file on a server")
    p_all_meta.add_argument("--server")

    p_rm = sub.add_parser("rm", help="Delete a file in-game")
    p_rm.add_argument("filename")
    p_rm.add_argument("--server")

    p_ram = sub.add_parser("ram", help="Calculate a script's RAM cost")
    p_ram.add_argument("filename")
    p_ram.add_argument("--server")

    p_defs = sub.add_parser("defs", help="Fetch NetscriptDefinitions.d.ts")
    p_defs.add_argument("--out", help="Where to write it (default: the sync directory)")

    sub.add_parser("servers", help="List all known servers")

    p_save = sub.add_parser("save", help="Fetch the current save file")
    p_save.add_argument("--out", help="Where to write it (default: ./bitburner_save.json)")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    config = load_config(args.config)

    if args.command == "init":
        print(f"Config ready at {args.config.resolve()}")
        return

    if args.command == "serve":
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s")
        daemon = Daemon(config, auto_watch=args.watch)
        try:
            asyncio.run(daemon.run())
        except KeyboardInterrupt:
            pass
        return

    # Everything past this point is a thin client to the running daemon.
    cmd_args: dict = {}
    server = getattr(args, "server", None)
    if server:
        cmd_args["server"] = server

    if args.command == "status":
        response = _send_control_command(config.control_port, "status")
    elif args.command == "push":
        cmd_args["path"] = args.path
        response = _send_control_command(config.control_port, "push", cmd_args)
    elif args.command == "sync":
        response = _send_control_command(config.control_port, "sync", cmd_args)
    elif args.command == "pull":
        cmd_args["filename"] = args.filename
        if args.out:
            cmd_args["out"] = args.out
        response = _send_control_command(config.control_port, "pull", cmd_args)
    elif args.command == "pull-all":
        if args.out_dir:
            cmd_args["out_dir"] = args.out_dir
        response = _send_control_command(config.control_port, "pull_all", cmd_args)
    elif args.command == "list":
        response = _send_control_command(config.control_port, "list", cmd_args)
    elif args.command == "metadata":
        cmd_args["filename"] = args.filename
        response = _send_control_command(config.control_port, "metadata", cmd_args)
    elif args.command == "all-metadata":
        response = _send_control_command(config.control_port, "all_metadata", cmd_args)
    elif args.command == "rm":
        cmd_args["filename"] = args.filename
        response = _send_control_command(config.control_port, "rm", cmd_args)
    elif args.command == "ram":
        cmd_args["filename"] = args.filename
        response = _send_control_command(config.control_port, "ram", cmd_args)
    elif args.command == "defs":
        if args.out:
            cmd_args["out"] = args.out
        response = _send_control_command(config.control_port, "defs", cmd_args)
    elif args.command == "servers":
        response = _send_control_command(config.control_port, "servers")
    elif args.command == "save":
        if args.out:
            cmd_args["out"] = args.out
        response = _send_control_command(config.control_port, "save", cmd_args)
    else:  # pragma: no cover - argparse enforces valid choices
        parser.error("Unknown command")
        return

    _print_result(response)


if __name__ == "__main__":
    main()
