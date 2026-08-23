"""
The long-lived daemon: hosts the websocket server that Bitburner connects
to, and a small local control-plane socket that the CLI (bb.py) talks to
in order to run commands against whatever connection is currently live.

Why a control plane at all: Bitburner connects OUT to us, once, when you
click "Connect" in Options -> Remote API. Only one server process can hold
that connection. So every ad-hoc action (push a file, list files, pull a
save) has to go through whichever process is holding it - it can't each
open its own server. `bb.py serve` is that one process; every other `bb.py`
subcommand is a thin client that sends one JSON line to the control-plane
socket and prints the reply.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import socket
from pathlib import Path

import websockets

from bb_config import Config
from bb_paths import to_bitburner_filename, to_local_path
from bb_rpc import RpcClient, RpcError, RpcTimeout
from bb_watch import BBWatcher, iter_syncable_files

log = logging.getLogger("bb_daemon")


def _lan_ip() -> str:
    """Best-effort guess at this machine's LAN IP (doesn't actually send traffic)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


class Daemon:
    def __init__(self, config: Config, auto_watch: bool = False):
        self.config = config
        self.auto_watch = auto_watch
        self.rpc: RpcClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._observer = None

    # ---- Game-facing websocket server ----

    async def _handle_game_connection(self, websocket, *_compat_args) -> None:
        # `*_compat_args` absorbs the `path` positional arg older versions
        # of the `websockets` library pass to connection handlers.
        if self.rpc is not None:
            log.info("New Bitburner connection, replacing the previous one")

        self.rpc = RpcClient(send=websocket.send)
        log.info("Bitburner connected")
        try:
            async for message in websocket:
                await self.rpc.feed(message)
        finally:
            log.info("Bitburner disconnected")
            self.rpc = None

    async def _run_game_server(self) -> None:
        async with websockets.serve(self._handle_game_connection, "0.0.0.0", self.config.game_port):
            log.info(
                f"Waiting for Bitburner: in-game go to Options -> Remote API, "
                f"set host '{_lan_ip()}' and port {self.config.game_port}, then Connect "
                f"(use 'localhost' instead if Bitburner runs on this same machine)"
            )
            await asyncio.Future()  # run forever

    # ---- Local control-plane server (talks to the bb.py CLI) ----

    async def _handle_control_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            line = await reader.readline()
            if not line:
                return
            request = json.loads(line.decode("utf-8"))
            response = await self._dispatch(request)
        except Exception as exc:  # never let a bad request take the daemon down
            response = {"ok": False, "error": str(exc)}

        try:
            writer.write((json.dumps(response) + "\n").encode("utf-8"))
            await writer.drain()
        finally:
            writer.close()

    async def _run_control_server(self) -> None:
        server = await asyncio.start_server(self._handle_control_connection, "127.0.0.1", self.config.control_port)
        log.info(f"Control plane listening on 127.0.0.1:{self.config.control_port}")
        async with server:
            await server.serve_forever()

    async def _dispatch(self, request: dict) -> dict:
        cmd = request.get("cmd")
        args = request.get("args", {}) or {}

        if cmd == "status":
            return {
                "ok": True,
                "result": {
                    "connected": self.rpc is not None,
                    "server": self.config.server,
                    "directory": str(self.config.directory),
                    "game_port": self.config.game_port,
                    "watching": self._observer is not None,
                },
            }

        if self.rpc is None:
            return {
                "ok": False,
                "error": (
                    "Bitburner is not connected. In-game: Options -> Remote API -> "
                    f"host 'localhost', port {self.config.game_port} -> Connect."
                ),
            }

        try:
            result = await self._run_command(cmd, args)
            return {"ok": True, "result": result}
        except RpcError as exc:
            return {"ok": False, "error": f"{exc.method} error: {exc.error}"}
        except RpcTimeout as exc:
            return {"ok": False, "error": str(exc)}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    async def _run_command(self, cmd: str, args: dict):
        assert self.rpc is not None
        server = args.get("server", self.config.server)

        if cmd == "push":
            local_path = Path(args["path"]).resolve()
            if not local_path.is_file():
                raise FileNotFoundError(f"No such file: {local_path}")
            filename = to_bitburner_filename(local_path, self.config.directory)
            content = local_path.read_text(encoding="utf-8")
            await self.rpc.push_file(filename, content, server)
            return {"pushed": filename}

        if cmd == "sync":
            pushed = []
            for local_path in iter_syncable_files(
                self.config.directory, self.config.include_extensions, self.config.exclude_patterns
            ):
                filename = to_bitburner_filename(local_path, self.config.directory)
                content = local_path.read_text(encoding="utf-8")
                await self.rpc.push_file(filename, content, server)
                pushed.append(filename)
            return {"pushed": pushed}

        if cmd == "pull":
            filename = args["filename"]
            content = await self.rpc.get_file(filename, server)
            out = Path(args["out"]).resolve() if args.get("out") else to_local_path(filename, self.config.directory)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(content, encoding="utf-8")
            return {"pulled": filename, "path": str(out)}

        if cmd == "pull_all":
            files = await self.rpc.get_all_files(server)
            out_dir = Path(args["out_dir"]).resolve() if args.get("out_dir") else self.config.directory
            written = []
            for entry in files:
                # lstrip("/"): a leading slash would make this absolute and
                # escape out_dir entirely. See bb_paths.to_local_path().
                out = out_dir / entry["filename"].lstrip("/")
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_text(entry["content"], encoding="utf-8")
                written.append(str(out))
            return {"pulled": written}

        if cmd == "list":
            return await self.rpc.get_file_names(server)

        if cmd == "metadata":
            return await self.rpc.get_file_metadata(args["filename"], server)

        if cmd == "all_metadata":
            return await self.rpc.get_all_file_metadata(server)

        if cmd == "rm":
            return await self.rpc.delete_file(args["filename"], server)

        if cmd == "ram":
            return await self.rpc.calculate_ram(args["filename"], server)

        if cmd == "defs":
            defs = await self.rpc.get_definition_file()
            out = Path(args.get("out") or (self.config.directory / "NetscriptDefinitions.d.ts")).resolve()
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(defs, encoding="utf-8")
            return {"path": str(out)}

        if cmd == "servers":
            return await self.rpc.get_all_servers()

        if cmd == "save":
            save = await self.rpc.get_save_file()
            out = Path(args.get("out") or "bitburner_save.json").resolve()
            out.parent.mkdir(parents=True, exist_ok=True)
            if save.get("binary"):
                out.write_bytes(base64.b64decode(save["save"]))
            else:
                out.write_text(save["save"], encoding="utf-8")
            return {"identifier": save.get("identifier"), "path": str(out)}

        raise ValueError(f"Unknown command: {cmd}")

    # ---- filesystem watcher glue ----

    def _on_fs_event(self, local_path: Path, deleted: bool) -> None:
        if self.rpc is None or self._loop is None:
            return  # nothing connected to push to

        try:
            filename = to_bitburner_filename(local_path, self.config.directory)
        except ValueError:
            return

        async def _run():
            assert self.rpc is not None
            if deleted:
                await self.rpc.delete_file(filename, self.config.server)
                log.info(f"deleted {filename}")
            else:
                content = local_path.read_text(encoding="utf-8")
                await self.rpc.push_file(filename, content, self.config.server)
                log.info(f"pushed {filename}")

        asyncio.run_coroutine_threadsafe(_run(), self._loop)

    async def run(self) -> None:
        self._loop = asyncio.get_running_loop()

        if self.auto_watch:
            self._observer = BBWatcher.start(
                root=self.config.directory,
                include_extensions=self.config.include_extensions,
                exclude_patterns=self.config.exclude_patterns,
                on_change=self._on_fs_event,
            )
            log.info(f"Watching {self.config.directory} for changes")

        try:
            await asyncio.gather(self._run_game_server(), self._run_control_server())
        finally:
            if self._observer:
                self._observer.stop()
                self._observer.join()
