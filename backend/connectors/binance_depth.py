from __future__ import annotations

import asyncio
import json
from typing import Any, Callable, Coroutine

import structlog
from httpx import AsyncClient

logger = structlog.get_logger()
Handler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]

from connectors.binance import SYMBOL_MAP, REVERSE_MAP


class BinanceDepthConnector:
    WS_COMBINED = "wss://stream.binance.com:9443/stream"

    def __init__(self) -> None:
        self._running = False
        self._on_depth: Handler | None = None

    def set_handler(self, on_depth: Handler | None) -> None:
        self._on_depth = on_depth

    async def start(self, symbols: list[str]) -> None:
        self._running = True
        while self._running:
            await self._run_ws(symbols)

    async def _run_ws(self, symbols: list[str]) -> None:
        import websockets

        streams = [f"{s.lower()}@depth20@100ms" for s in symbols]
        url = f"{self.WS_COMBINED}?streams={'/'.join(streams)}"

        try:
            async with websockets.connect(url, ping_interval=20) as ws:
                logger.info("depth_ws_connected", symbols=symbols)
                async for raw in ws:
                    msg = json.loads(raw)
                    await self._dispatch(msg)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning("depth_ws_reconnect", error=str(exc))
            await asyncio.sleep(3)

    async def _dispatch(self, msg: dict[str, Any]) -> None:
        data = msg.get("data", {})
        if not data or "bids" not in data:
            return

        stream = msg.get("stream", "")
        raw = stream.split("@")[0].upper() if "@" in stream else ""
        symbol = REVERSE_MAP.get(raw, raw)

        bids = [[float(b[0]), float(b[1])] for b in data.get("bids", []) if float(b[1]) > 0]
        asks = [[float(a[0]), float(a[1])] for a in data.get("asks", []) if float(a[1]) > 0]
        bids.sort(key=lambda x: -x[0])
        asks.sort(key=lambda x: x[0])

        parsed = {
            "type": "depth",
            "symbol": symbol,
            "bids": bids[:20],
            "asks": asks[:20],
            "timestamp": data.get("E", 0),
        }

        if self._on_depth:
            await self._on_depth(parsed)

    async def close(self) -> None:
        self._running = False
