from __future__ import annotations

import asyncio
import time
from typing import Any

import structlog

logger = structlog.get_logger()


class ReplayEngine:
    def __init__(self) -> None:
        self._ticks: list[dict[str, Any]] = []
        self._index = 0
        self._speed = 1.0
        self._running = False
        self._on_tick = None
        self._on_complete = None

    def load_ticks(self, ticks: list[dict[str, Any]]) -> None:
        self._ticks = sorted(ticks, key=lambda t: t["timestamp"])
        self._index = 0
        logger.info("replay_loaded", count=len(self._ticks))

    def set_handler(self, on_tick=None, on_complete=None) -> None:
        self._on_tick = on_tick
        self._on_complete = on_complete

    async def play(self) -> None:
        self._running = True
        while self._running and self._index < len(self._ticks):
            tick = self._ticks[self._index]
            if self._on_tick:
                await self._on_tick(tick)
            self._index += 1

            if self._index < len(self._ticks):
                next_tick = self._ticks[self._index]
                delay = (next_tick["timestamp"] - tick["timestamp"]) / 1000.0 / self._speed
                if delay > 0:
                    await asyncio.sleep(min(delay, 1.0))

            await asyncio.sleep(0)

        if self._index >= len(self._ticks) and self._on_complete:
            await self._on_complete()

    def pause(self) -> None:
        self._running = False

    def resume(self) -> None:
        self._running = True

    def stop(self) -> None:
        self._running = False
        self._index = 0

    def set_speed(self, speed: float) -> None:
        self._speed = max(0.1, min(speed, 100.0))

    def step(self, n: int = 1) -> list[dict[str, Any]]:
        ticks = self._ticks[self._index : self._index + n]
        self._index += n
        return ticks

    @property
    def progress(self) -> float:
        return self._index / len(self._ticks) if self._ticks else 0

    @property
    def current_tick(self) -> dict[str, Any] | None:
        if self._ticks and self._index < len(self._ticks):
            return self._ticks[self._index]
        return None

    @property
    def tick_count(self) -> int:
        return len(self._ticks)

    @property
    def index(self) -> int:
        return self._index
