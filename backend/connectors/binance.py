from __future__ import annotations

import asyncio
import json
from typing import Any, Callable, Coroutine

import structlog
from httpx import AsyncClient

from config import settings

logger = structlog.get_logger()
Handler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]

INTERVAL_MAP = {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w",
}

# Map non-Binance symbol names to Binance trading pairs
SYMBOL_MAP: dict[str, str] = {
    "XAUUSD": "XAUUSDT",
    "XAGUSD": "XAGUSDT",
    "EURUSD": "EURUSDT",
    "GBPUSD": "GBPUSDT",
    "USDJPY": "USDJPY",
    "AUDUSD": "AUDUSDT",
    "USDCAD": "USDCAD",
    "NZDUSD": "NZDUSDT",
}

# Reverse: Binance pair → our symbol
REVERSE_MAP: dict[str, str] = {v: k for k, v in SYMBOL_MAP.items()}


def to_binance_symbol(symbol: str) -> str:
    return SYMBOL_MAP.get(symbol.upper(), symbol.upper())


def from_binance_symbol(binance_symbol: str) -> str:
    return REVERSE_MAP.get(binance_symbol.upper(), binance_symbol.upper())


class BinanceConnector:
    REST_URL = "https://api.binance.com"
    WS_COMBINED = "wss://stream.binance.com:9443/stream"

    def __init__(self) -> None:
        self._http = AsyncClient()
        self._running = False
        self._tasks: list[asyncio.Task] = []
        self._on_candle: Handler | None = None
        self._on_quote: Handler | None = None

    def set_handlers(self, on_candle: Handler | None = None, on_quote: Handler | None = None) -> None:
        self._on_candle = on_candle
        self._on_quote = on_quote

    async def get_klines(self, symbol: str, interval: str = "1m", limit: int = 500) -> list[dict]:
        binance_symbol = to_binance_symbol(symbol)
        try:
            resp = await self._http.get(
                f"{self.REST_URL}/api/v3/klines",
                params={"symbol": binance_symbol, "interval": interval, "limit": min(limit, 1000)},
            )
            resp.raise_for_status()
            candles = self._normalize_klines(resp.json())
            # Stamp each candle with the original requested symbol
            for c in candles:
                c["symbol"] = symbol.upper()
            return candles
        except Exception as exc:
            logger.warning("binance_klines_fallback", symbol=symbol, binance_symbol=binance_symbol, error=str(exc))
            raise

    def _normalize_klines(self, raw: list) -> list[dict]:
        return [
            {
                "time": k[0],
                "open": float(k[1]),
                "high": float(k[2]),
                "low": float(k[3]),
                "close": float(k[4]),
                "volume": float(k[5]),
            }
            for k in raw
        ]

    async def start(self, symbols: list[str], intervals: list[str] | None = None) -> None:
        if intervals is None:
            intervals = ["1m"]
        self._running = True
        # Store the original symbols the caller requested
        self._original_symbols = {s.upper() for s in symbols}
        # Map to Binance pairs for streaming (e.g. XAUUSD → XAUUSDT)
        self._mapped_symbols = [to_binance_symbol(s) for s in symbols]
        task = asyncio.create_task(self._run_ws(self._mapped_symbols, intervals))
        self._tasks.append(task)

    async def _run_ws(self, binance_symbols: list[str], intervals: list[str]) -> None:
        import websockets

        streams = []
        for s in binance_symbols:
            sl = s.lower()
            for iv in intervals:
                streams.append(f"{sl}@kline_{iv}")
            streams.append(f"{sl}@bookTicker")

        url = f"{self.WS_COMBINED}?streams={'/'.join(streams)}"

        while self._running:
            try:
                async with websockets.connect(url, ping_interval=20) as ws:
                    logger.info("binance_ws_connected", streams=len(streams))
                    async for raw in ws:
                        msg = json.loads(raw)
                        await self._dispatch(msg)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("binance_ws_reconnect", error=str(exc))
                await asyncio.sleep(3)

    def _resolve_symbol(self, binance_symbol: str) -> str:
        """Resolve a Binance pair back to our canonical symbol.
        Only reverse-map if the caller originally requested the mapped name."""
        mapped = from_binance_symbol(binance_symbol)
        if mapped in getattr(self, "_original_symbols", set()):
            return mapped
        return binance_symbol

    async def _dispatch(self, msg: dict[str, Any]) -> None:
        stream: str | None = msg.get("stream")
        data: dict | None = msg.get("data")
        if not stream or not data:
            return

        if stream.endswith("@bookTicker"):
            raw_symbol = data.get("s", "")
            parsed = {
                "type": "quote",
                "symbol": self._resolve_symbol(raw_symbol),
                "bid": float(data.get("b", 0)),
                "ask": float(data.get("a", 0)),
                "timestamp": data.get("E", 0),
            }
            if self._on_quote:
                await self._on_quote(parsed)

        elif "@kline_" in stream:
            k = data.get("k", {})
            raw_symbol = data.get("s", "")
            parsed = {
                "type": "candle",
                "symbol": self._resolve_symbol(raw_symbol),
                "interval": k.get("i"),
                "time": k.get("t", 0),
                "open": float(k.get("o", 0)),
                "high": float(k.get("h", 0)),
                "low": float(k.get("l", 0)),
                "close": float(k.get("c", 0)),
                "volume": float(k.get("v", 0)),
            }
            if self._on_candle:
                await self._on_candle(parsed)

    async def close(self) -> None:
        self._running = False
        for t in self._tasks:
            t.cancel()
        await self._http.aclose()
        logger.info("binance_connector_closed")
