from __future__ import annotations

import json
import time
from typing import Any

import structlog
from fastapi import WebSocket

logger = structlog.get_logger()


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._meta: dict[WebSocket, dict[str, Any]] = {}
        self.replay_engine = None

    async def connect(self, ws: WebSocket, channel: str) -> None:
        await ws.accept()
        self._connections.setdefault(channel, set()).add(ws)
        self._meta[ws] = {"channel": channel, "connected_at": time.time()}
        logger.info("ws_connected", channel=channel)

    async def disconnect(self, ws: WebSocket) -> None:
        meta = self._meta.pop(ws, {})
        channel = meta.get("channel")
        if channel and channel in self._connections:
            self._connections[channel].discard(ws)
            if not self._connections[channel]:
                del self._connections[channel]
        logger.info("ws_disconnected", channel=channel)

    async def broadcast(self, channel: str, data: dict[str, Any]) -> None:
        payload = json.dumps(data)
        for ws in list(self._connections.get(channel, set())):
            try:
                await ws.send_text(payload)
            except Exception:
                await self.disconnect(ws)

    async def send_to(self, ws: WebSocket, data: dict[str, Any]) -> None:
        try:
            await ws.send_text(json.dumps(data))
        except Exception:
            await self.disconnect(ws)

    @property
    def active_channels(self) -> list[str]:
        return list(self._connections.keys())

    @property
    def connection_count(self) -> int:
        return len(self._meta)


manager = ConnectionManager()
