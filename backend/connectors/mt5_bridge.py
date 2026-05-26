from __future__ import annotations

import asyncio
import json
from typing import Any, Callable, Coroutine

import structlog

logger = structlog.get_logger()

Handler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]

MT5_PYTHON = r"C:\Python310-32\python.exe"
WORKER_SCRIPT = "mt5_worker.py"

TIMEFRAME_MAP = {
    "1m": 1, "5m": 5, "15m": 15, "30m": 30,
    "1h": 60, "4h": 240, "1d": 1440, "1w": 10080,
}


class MT5Bridge:
    """Spawns a 32-bit Python subprocess running mt5_worker.py and reads
    JSON-line messages (quotes, candles, errors) from its stdout.
    Sends commands (e.g. fetch_history) via stdin."""

    def __init__(self) -> None:
        self._proc: asyncio.subprocess.Process | None = None
        self._running = False
        self._on_quote: Handler | None = None
        self._on_candle: Handler | None = None
        self._pending_requests: dict[int, asyncio.Future] = {}
        self._req_counter = 0
        self._req_lock = asyncio.Lock()

    def set_handlers(self, on_quote: Handler | None = None, on_candle: Handler | None = None) -> None:
        self._on_quote = on_quote
        self._on_candle = on_candle

    async def start(self) -> bool:
        import os
        import pathlib

        script_path = str(pathlib.Path(__file__).parent.parent / WORKER_SCRIPT)
        if not os.path.isfile(script_path):
            logger.error("mt5_worker_not_found", path=script_path)
            return False

        try:
            self._proc = await asyncio.create_subprocess_exec(
                MT5_PYTHON,
                script_path,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            logger.error("mt5_32bit_python_not_found", path=MT5_PYTHON)
            return False

        self._running = True
        asyncio.create_task(self._reader())
        asyncio.create_task(self._stderr_reader())
        logger.info("mt5_bridge_started")
        return True

    async def _reader(self) -> None:
        assert self._proc is not None and self._proc.stdout is not None
        while self._running:
            try:
                line = await self._proc.stdout.readline()
                if not line:
                    logger.warning("mt5_worker_stdout_closed")
                    break
                text = line.decode("utf-8", errors="replace").strip()
                if not text:
                    continue
                msg = json.loads(text)
                await self._dispatch(msg)
            except asyncio.CancelledError:
                break
            except json.JSONDecodeError:
                continue
            except Exception as exc:
                logger.warning("mt5_read_error", error=str(exc))

        self._running = False
        logger.warning("mt5_reader_stopped")

    async def _stderr_reader(self) -> None:
        assert self._proc is not None and self._proc.stderr is not None
        while self._running:
            try:
                line = await self._proc.stderr.readline()
                if not line:
                    break
                text = line.decode("utf-8", errors="replace").strip()
                if text:
                    logger.warning("mt5_stderr", text=text)
            except asyncio.CancelledError:
                break
            except Exception:
                break

    async def _dispatch(self, msg: dict[str, Any]) -> None:
        msg_type = msg.get("type")
        if msg_type == "connected":
            logger.info("mt5_worker_connected", account=msg.get("account"), server=msg.get("server"))
            return
        if msg_type == "disconnected":
            logger.warning("mt5_worker_disconnected")
            return
        if msg_type == "error":
            logger.error("mt5_worker_error", message=msg.get("message"))
            return
        if msg_type == "quote":
            if self._on_quote:
                await self._on_quote(msg)
            return
        if msg_type == "candle":
            if self._on_candle:
                await self._on_candle(msg)
            return
        if msg_type == "history_result":
            req_id = msg.get("id")
            async with self._req_lock:
                future = self._pending_requests.pop(req_id, None)
            if future and not future.done():
                if "error" in msg:
                    future.set_exception(RuntimeError(msg["error"]))
                else:
                    future.set_result(msg.get("candles", []))
            return

    async def _send_command(self, cmd: dict) -> None:
        """Write a JSON command to the worker's stdin."""
        if not self._proc or not self._proc.stdin:
            raise RuntimeError("MT5 worker not running")
        line = json.dumps(cmd) + "\n"
        self._proc.stdin.write(line.encode("utf-8"))
        await self._proc.stdin.drain()

    async def get_history(self, symbol: str, interval: str = "1m", count: int = 500) -> list[dict]:
        """Fetch historical candles from MT5 via stdin command to the running worker."""
        if not self._running or not self._proc:
            logger.warning("mt5_get_history_not_running", symbol=symbol)
            return []

        tf = TIMEFRAME_MAP.get(interval, 1)

        async with self._req_lock:
            self._req_counter += 1
            req_id = self._req_counter
            future = asyncio.get_event_loop().create_future()
            self._pending_requests[req_id] = future

        try:
            await self._send_command({
                "command": "fetch_history",
                "id": req_id,
                "symbol": symbol,
                "timeframe": tf,
                "count": min(count, 1000),
            })
            result = await asyncio.wait_for(future, timeout=15.0)
            return result
        except asyncio.TimeoutError:
            logger.warning("mt5_history_timeout", symbol=symbol, interval=interval)
            async with self._req_lock:
                self._pending_requests.pop(req_id, None)
            return []
        except Exception as exc:
            logger.warning("mt5_history_exception", symbol=symbol, interval=interval, error=str(exc))
            return []

    async def stop(self) -> None:
        self._running = False
        if self._proc:
            try:
                self._proc.kill()
                await self._proc.wait()
            except Exception:
                pass
            self._proc = None
        logger.info("mt5_bridge_stopped")

    @property
    def is_connected(self) -> bool:
        return self._running and self._proc is not None and self._proc.returncode is None
