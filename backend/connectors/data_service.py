from __future__ import annotations

import structlog

from connectors.binance import BinanceConnector
from websocket.manager import manager

logger = structlog.get_logger()

# XAUUSDT (gold) is routed through MT5 — not available on Binance Spot
SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XAGUSDT", "BNBUSDT", "EURUSDT", "GBPUSDT"]
INTERVALS = ["1m", "5m", "1h"]


class DataService:
    def __init__(self) -> None:
        self.binance = BinanceConnector()
        self._on_candle_cb = None
        self._on_quote_cb = None

    def set_handlers(self, on_candle=None, on_quote=None) -> None:
        self._on_candle_cb = on_candle
        self._on_quote_cb = on_quote

    async def start(self) -> None:
        self.binance.set_handlers(on_candle=self._on_candle, on_quote=self._on_quote)
        await self.binance.start(SYMBOLS, INTERVALS)
        logger.info("data_service_started", symbols=SYMBOLS)

    async def _on_candle(self, candle: dict) -> None:
        sym = candle.get("symbol", "")
        iv = candle.get("interval", "")
        if self._on_candle_cb:
            await self._on_candle_cb(candle)
        elif sym and iv:
            await manager.broadcast("market", candle)

    async def _on_quote(self, quote: dict) -> None:
        sym = quote.get("symbol", "")
        if self._on_quote_cb:
            await self._on_quote_cb(quote)
        elif sym:
            await manager.broadcast("market", quote)

    async def close(self) -> None:
        await self.binance.close()
        logger.info("data_service_stopped")
