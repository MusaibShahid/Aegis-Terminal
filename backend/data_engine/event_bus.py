from __future__ import annotations

import asyncio
from typing import Any, Callable, Coroutine

import structlog

logger = structlog.get_logger()

Handler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, list[Handler]] = {}
        self._tasks: set[asyncio.Task] = set()

    def subscribe(self, channel: str, handler: Handler) -> None:
        self._subscribers.setdefault(channel, []).append(handler)

    def unsubscribe(self, channel: str, handler: Handler) -> None:
        handlers = self._subscribers.get(channel, [])
        if handler in handlers:
            handlers.remove(handler)

    async def publish(self, channel: str, data: dict[str, Any]) -> None:
        for handler in self._subscribers.get(channel, []):
            task = asyncio.create_task(self._safe_dispatch(handler, data))
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)

    async def _safe_dispatch(self, handler: Handler, data: dict[str, Any]) -> None:
        try:
            await handler(data)
        except Exception as exc:
            logger.error("handler_error", handler=handler.__name__, error=str(exc))

    async def shutdown(self) -> None:
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
            self._tasks.clear()
