from __future__ import annotations

import asyncio
import structlog
from collections.abc import Awaitable, Callable
from typing import Any

from tick_engine import INTERVAL_SECONDS, TRADING_SESSIONS

logger = structlog.get_logger()

CountdownHandler = Callable[[dict[str, Any]], Awaitable[None]]


class TimeEngine:
    """Centralized clock driving candle countdowns and session tracking.

    Pushes a ``candle_time`` message every second to all registered handlers
    (typically the WS manager), containing remaining seconds for each active
    symbol/interval pair plus the current session.
    """

    def __init__(self) -> None:
        self._running = False
        self._task: asyncio.Task | None = None
        self._handlers: list[CountdownHandler] = []
        self._symbols: list[str] = []
        self._intervals: list[str] = []

    def set_symbols(self, symbols: list[str], intervals: list[str] | None = None) -> None:
        self._symbols = symbols
        if intervals:
            self._intervals = intervals

    def add_handler(self, handler: CountdownHandler) -> None:
        self._handlers.append(handler)

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._tick_loop())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    async def _tick_loop(self) -> None:
        logger.info("time_engine_started")
        while self._running:
            try:
                now_ms = self._now_ms()
                msg = self._build_message(now_ms)
                for h in self._handlers:
                    await h(msg)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("time_engine_tick_error", error=str(exc))
            await asyncio.sleep(1)
        logger.info("time_engine_stopped")

    def _now_ms(self) -> int:
        import time
        return int(time.time() * 1000)

    def _build_message(self, now_ms: int) -> dict[str, Any]:
        result: dict[str, Any] = {
            "type": "candle_time",
            "server_time": now_ms,
            "session": self._get_session(now_ms),
            "countdowns": {},
        }
        for sym in self._symbols:
            for iv in self._intervals:
                sec = INTERVAL_SECONDS.get(iv, 60)
                bucket = (now_ms // (sec * 1000)) * (sec * 1000)
                close_time = bucket + (sec * 1000)
                remaining = max(0, (close_time - now_ms) // 1000)
                key = f"{sym}:{iv}"
                result["countdowns"][key] = {
                    "symbol": sym,
                    "interval": iv,
                    "open_time": bucket,
                    "close_time": close_time,
                    "remaining_seconds": remaining,
                    "server_time": now_ms,
                }
        return result

    def _get_session(self, now_ms: int) -> str:
        hour = (now_ms // 3600000) % 24
        for name, (start, end) in TRADING_SESSIONS.items():
            if start <= hour < end or (start > end and (hour >= start or hour < end)):
                return name
        return "closed"

    def get_countdown(self, symbol: str, interval: str) -> dict | None:
        """Convenience method for REST API callers."""
        now_ms = self._now_ms()
        sec = INTERVAL_SECONDS.get(interval, 60)
        bucket = (now_ms // (sec * 1000)) * (sec * 1000)
        close_time = bucket + (sec * 1000)
        remaining = max(0, (close_time - now_ms) // 1000)
        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "open_time": bucket,
            "close_time": close_time,
            "remaining_seconds": remaining,
            "server_time": now_ms,
            "session": self._get_session(now_ms),
            "timezone": "UTC",
        }
