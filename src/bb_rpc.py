"""
JSON-RPC client for the Bitburner Remote API.

This is a pure protocol layer: it knows how to build request envelopes,
correlate responses by id, and time out. It has no idea whether the
underlying transport is a websocket, a pipe, or anything else - it just
needs an async `send(text)` callable, and you feed it raw incoming text
via `feed()`.

API spec: https://github.com/bitburner-official/bitburner-src/blob/dev/src/Documentation/doc/en/programming/remote_api.md
"""

from __future__ import annotations

import asyncio
import itertools
import json
from typing import Any, Awaitable, Callable, Optional


class RpcError(Exception):
    """The game returned a JSON-RPC error object for a request."""

    def __init__(self, method: str, error: Any):
        self.method = method
        self.error = error
        super().__init__(f"{method} failed: {error}")


class RpcTimeout(Exception):
    """No response arrived within the configured timeout."""

    def __init__(self, method: str, timeout: float):
        super().__init__(f"{method} timed out after {timeout}s")


SendFn = Callable[[str], Awaitable[None]]


class RpcClient:
    """
    One instance per live game connection. Construct it with a `send`
    coroutine bound to that connection, feed it incoming messages, and
    call the method wrappers below to make requests.
    """

    def __init__(self, send: SendFn, default_timeout: float = 15.0):
        self._send = send
        self._default_timeout = default_timeout
        self._id_counter = itertools.count(1)
        # request id -> (future, method name)
        self._pending: dict[int, tuple[asyncio.Future, str]] = {}

    async def feed(self, raw: str) -> None:
        """Feed one raw text message received from the transport."""
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            return  # ignore malformed frames rather than crashing the connection

        msg_id = message.get("id")
        pending = self._pending.pop(msg_id, None)
        if pending is None:
            return
        future, method = pending
        if future.done():
            return

        error = message.get("error")
        if error is not None:
            future.set_exception(RpcError(method, error))
        else:
            future.set_result(message.get("result"))

    async def call(self, method: str, params: Optional[dict] = None, timeout: Optional[float] = None) -> Any:
        request_id = next(self._id_counter)
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[request_id] = (future, method)

        payload: dict[str, Any] = {"jsonrpc": "2.0", "id": request_id, "method": method}
        if params is not None:
            payload["params"] = params

        await self._send(json.dumps(payload))

        effective_timeout = timeout or self._default_timeout
        try:
            return await asyncio.wait_for(future, effective_timeout)
        except asyncio.TimeoutError:
            self._pending.pop(request_id, None)
            raise RpcTimeout(method, effective_timeout)

    # ---- One wrapper per Remote API method ----

    async def push_file(self, filename: str, content: str, server: str = "home") -> str:
        return await self.call("pushFile", {"filename": filename, "content": content, "server": server})

    async def get_file(self, filename: str, server: str = "home") -> str:
        return await self.call("getFile", {"filename": filename, "server": server})

    async def get_file_metadata(self, filename: str, server: str = "home") -> dict:
        return await self.call("getFileMetadata", {"filename": filename, "server": server})

    async def delete_file(self, filename: str, server: str = "home") -> str:
        return await self.call("deleteFile", {"filename": filename, "server": server})

    async def get_file_names(self, server: str = "home") -> list[str]:
        return await self.call("getFileNames", {"server": server})

    async def get_all_files(self, server: str = "home") -> list[dict]:
        return await self.call("getAllFiles", {"server": server})

    async def get_all_file_metadata(self, server: str = "home") -> list[dict]:
        return await self.call("getAllFileMetadata", {"server": server})

    async def calculate_ram(self, filename: str, server: str = "home") -> float:
        return await self.call("calculateRam", {"filename": filename, "server": server})

    async def get_definition_file(self) -> str:
        return await self.call("getDefinitionFile")

    async def get_save_file(self) -> dict:
        return await self.call("getSaveFile")

    async def get_all_servers(self) -> list[dict]:
        return await self.call("getAllServers")
