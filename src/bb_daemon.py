"""
The long-lived daemon: hosts the websocket server that Bitburner connects
to, and a control-plane socket that the CLI (bb.py) talks to in order to
run commands against whatever connection is currently live.

Why a control plane at all: Bitburner connects OUT to us, once, when you
click "Connect" in Options -> Remote API. Only one server process can hold
that connection. So every ad-hoc action (push a file, list files, pull a
save) has to go through whichever process is holding it - it can't each
open its own server. `bb.py serve` is that one process; every other `bb.py`
subcommand is a thin client that sends one JSON line to the control-plane
socket and prints the reply.

The daemon never touches the local filesystem itself. Every command that
needs file content carries it in the request or the response instead - the
CLI process does its own reading and writing, on whatever machine it's
running on. That's what lets `serve` live on one machine (holding the game
connection persistently) while `bb.py push`/`sync`/`pull` run from another.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import socket

import websockets

from bb_config import Config
from bb_rpc import RpcClient, RpcError, RpcTimeout

log = logging.getLogger("bb_daemon")

_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


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
    def __init__(self, config: Config):
        self.config = config
        self.rpc: RpcClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

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

    # ---- Control-plane server (talks to the bb.py CLI, possibly remotely) ----

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
        server = await asyncio.start_server(
            self._handle_control_connection, self.config.control_bind, self.config.control_port
        )
        log.info(f"Control plane listening on {self.config.control_bind}:{self.config.control_port}")
        async with server:
            await server.serve_forever()

    def _check_token(self, request: dict) -> bool:
        if not self.config.control_token:
            return True
        return hmac.compare_digest(request.get("token", ""), self.config.control_token)

    async def _dispatch(self, request: dict) -> dict:
        if not self._check_token(request):
            return {"ok": False, "error": "bad or missing control token"}

        cmd = request.get("cmd")
        args = request.get("args", {}) or {}

        if cmd == "status":
            return {
                "ok": True,
                "result": {
                    "connected": self.rpc is not None,
                    "server": self.config.server,
                    "game_port": self.config.game_port,
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
            filename = args["filename"]
            await self.rpc.push_file(filename, args["content"], server)
            return {"pushed": filename}

        if cmd == "sync":
            pushed = []
            for entry in args["files"]:
                await self.rpc.push_file(entry["filename"], entry["content"], server)
                pushed.append(entry["filename"])
            return {"pushed": pushed}

        if cmd == "pull":
            filename = args["filename"]
            content = await self.rpc.get_file(filename, server)
            return {"filename": filename, "content": content}

        if cmd == "pull_all":
            files = await self.rpc.get_all_files(server)
            return {"files": files}

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
            return {"content": await self.rpc.get_definition_file()}

        if cmd == "servers":
            return await self.rpc.get_all_servers()

        if cmd == "save":
            save = await self.rpc.get_save_file()
            return {
                "content": save["save"],
                "binary": save.get("binary", False),
                "identifier": save.get("identifier"),
            }

        raise ValueError(f"Unknown command: {cmd}")

    async def run(self) -> None:
        self._loop = asyncio.get_running_loop()

        if self.config.control_bind not in _LOOPBACK_HOSTS and not self.config.control_token:
            raise RuntimeError(
                f"control_bind is '{self.config.control_bind}' (not loopback) but control_token is empty. "
                "Set control_token in config.toml before exposing the control plane beyond this machine."
            )

        await asyncio.gather(self._run_game_server(), self._run_control_server())
