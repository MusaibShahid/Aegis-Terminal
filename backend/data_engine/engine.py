from __future__ import annotations

from typing import Any

import structlog

from data_engine.event_bus import EventBus

logger = structlog.get_logger()


class DataEngine:
    def __init__(self, event_bus: EventBus) -> None:
        self._event_bus = event_bus
        self._active_feeds: dict[str, dict[str, Any]] = {}

    async def process_tick(self, symbol: str, price: float, volume: float, ts: float) -> None:
        logger.debug("tick_received", symbol=symbol, price=price)
        await self._event_bus.publish(f"{symbol}:tick", {
            "symbol": symbol,
            "price": price,
            "volume": volume,
            "timestamp": ts,
        })

    async def process_candle(self, symbol: str, interval: str, candle: dict[str, Any]) -> None:
        await self._event_bus.publish(f"{symbol}:{interval}", {
            "type": "candle",
            "symbol": symbol,
            "interval": interval,
            **candle,
        })

    async def process_quote(self, symbol: str, bid: float, ask: float, ts: float) -> None:
        await self._event_bus.publish(f"{symbol}:quote", {
            "type": "quote",
            "symbol": symbol,
            "bid": bid,
            "ask": ask,
            "timestamp": ts,
        })

    def start_feed(self, feed_id: str, config: dict[str, Any]) -> None:
        self._active_feeds[feed_id] = config
        logger.info("feed_started", feed_id=feed_id)

    def stop_feed(self, feed_id: str) -> None:
        self._active_feeds.pop(feed_id, None)
        logger.info("feed_stopped", feed_id=feed_id)
