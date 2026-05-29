from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import threading
from typing import Any, Callable, Coroutine

import structlog

logger = structlog.get_logger()

Handler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]

MT5_PYTHON = sys.executable
WORKER_SCRIPT = "mt5_worker.py"

TIMEFRAME_MAP = {
    "1m": 1, "5m": 5, "15m": 15, "30m": 30,
    "1h": 60, "4h": 240, "1d": 1440, "1w": 10080,
}


class MT5Bridge:
    """Spawns a Python subprocess running mt5_worker.py and reads
    JSON-line messages (quotes, candles, errors) from its stdout using reader threads.
    Sends commands (e.g. fetch_history) via stdin.

    Parameters
    ----------
    symbol_map : dict[str, str], optional
        Maps frontend symbols → MT5 symbols (e.g. ``{"XAUUSDT": "XAUUSD"}``).
        When fetching history for a frontend symbol, the bridge will
        reverse-map it before sending to the MT5 worker.
    """

    def __init__(self, symbol_map: dict[str, str] | None = None) -> None:
        self._symbol_map = symbol_map or {}
        self._proc: subprocess.Popen | None = None
        self._running = False
        self._on_quote: Handler | None = None
        self._on_candle: Handler | None = None
        self._pending_requests: dict[int, asyncio.Future] = {}
        self._req_counter = 0
        self._req_lock = asyncio.Lock()
        self._write_lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

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
            self._proc = subprocess.Popen(
                [MT5_PYTHON, script_path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError:
            logger.error("mt5_python_not_found", path=MT5_PYTHON)
            return False
        except Exception as e:
            logger.error("mt5_subprocess_start_failed", error=str(e))
            return False

        self._running = True
        self._loop = asyncio.get_running_loop()
        threading.Thread(target=self._sync_reader, daemon=True).start()
        threading.Thread(target=self._sync_stderr_reader, daemon=True).start()
        logger.info("mt5_bridge_started")
        return True

    def _sync_reader(self) -> None:
        assert self._proc is not None and self._proc.stdout is not None
        while self._running:
            try:
                line = self._proc.stdout.readline()
                if not line:
                    logger.warning("mt5_worker_stdout_closed")
                    break
                text = line.strip()
                if not text:
                    continue
                try:
                    msg = json.loads(text)
                except json.JSONDecodeError:
                    continue
                
                # Dispatch back to asyncio event loop
                if self._loop and self._loop.is_running():
                    asyncio.run_coroutine_threadsafe(self._dispatch(msg), self._loop)
            except Exception as exc:
                logger.warning("mt5_read_error", error=str(exc))
                break

        self._running = False
        logger.warning("mt5_reader_stopped")

    def _sync_stderr_reader(self) -> None:
        assert self._proc is not None and self._proc.stderr is not None
        while self._running:
            try:
                line = self._proc.stderr.readline()
                if not line:
                    break
                text = line.strip()
                if text:
                    logger.warning("mt5_stderr", text=text)
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

        # --- Trade-related responses ---
        if msg_type == "order_result":
            req_id = msg.get("id")
            async with self._req_lock:
                future = self._pending_requests.pop(req_id, None)
            if future and not future.done():
                if "error" in msg:
                    future.set_exception(RuntimeError(msg["error"]))
                else:
                    future.set_result(msg)
            return

        if msg_type == "positions_result":
            req_id = msg.get("id")
            async with self._req_lock:
                future = self._pending_requests.pop(req_id, None)
            if future and not future.done():
                if "error" in msg:
                    future.set_exception(RuntimeError(msg["error"]))
                else:
                    future.set_result(msg.get("positions", []))
            return

        if msg_type == "orders_result":
            req_id = msg.get("id")
            async with self._req_lock:
                future = self._pending_requests.pop(req_id, None)
            if future and not future.done():
                if "error" in msg:
                    future.set_exception(RuntimeError(msg["error"]))
                else:
                    future.set_result(msg.get("orders", []))
            return

        if msg_type == "margin_result":
            req_id = msg.get("id")
            async with self._req_lock:
                future = self._pending_requests.pop(req_id, None)
            if future and not future.done():
                if "error" in msg:
                    future.set_exception(RuntimeError(msg["error"]))
                else:
                    future.set_result(msg)
            return

    async def _send_command(self, cmd: dict) -> None:
        """Write a JSON command to the worker's stdin."""
        if not self._proc or not self._proc.stdin:
            raise RuntimeError("MT5 worker not running")
        line = json.dumps(cmd) + "\n"

        def _write():
            with self._write_lock:
                if self._running and self._proc and self._proc.stdin and self._proc.returncode is None:
                    self._proc.stdin.write(line)
                    self._proc.stdin.flush()
        await asyncio.to_thread(_write)

    # ------------------------------------------------------------------
    # Trade execution methods
    # ------------------------------------------------------------------

    async def send_order(self, request: dict) -> dict:
        """Send a trade order to MT5.

        Parameters mirror MT5's order_send():
        - action: mt5.TRADE_ACTION_DEAL (0) or TRADE_ACTION_PENDING (1)
        - symbol: str
        - volume: float
        - price: float
        - sl, tp: float
        - type: mt5.ORDER_TYPE_BUY (0), ORDER_TYPE_SELL (1), etc.
        - type_filling: mt5.ORDER_FILLING_IOC (1) or FOK (2)
        - magic: int
        - comment: str

        Returns a dict with retcode, deal, order, volume, price.
        """
        if not self._running or not self._proc:
            return {"error": "MT5 bridge not running"}

        # Reverse-map symbol if needed
        symbol = request.get("symbol", "").upper()
        mt5_symbol = self._symbol_map.get(symbol, symbol)
        req = dict(request)
        req["symbol"] = mt5_symbol
        req["command"] = "order_send"

        async with self._req_lock:
            self._req_counter += 1
            req_id = self._req_counter
            req["id"] = req_id
            loop = self._loop or asyncio.get_running_loop()
            future = loop.create_future()
            self._pending_requests[req_id] = future

        try:
            await self._send_command(req)
            result = await asyncio.wait_for(future, timeout=10.0)
            return result
        except asyncio.TimeoutError:
            async with self._req_lock:
                self._pending_requests.pop(req_id, None)
            return {"error": "order_timeout", "retcode": -1}
        except Exception as exc:
            async with self._req_lock:
                self._pending_requests.pop(req_id, None)
            return {"error": str(exc), "retcode": -1}

    async def close_position(self, position_ticket: int, symbol: str, volume: float, price: float, deviation: int = 10) -> dict:
        """Close an open MT5 position by sending an opposite market order."""
        # Determine the opposite order type
        position_info = await self.get_positions(symbol=symbol)
        pos_type = None
        for p in position_info:
            if p.get("ticket") == position_ticket:
                pos_type = p.get("type")
                break
        if pos_type is None:
            return {"error": "position_not_found", "retcode": -1}

        # Opposite type: 0=BUY → 1=SELL, 1=SELL → 0=BUY
        close_type = 1 if pos_type == 0 else 0

        return await self.send_order({
            "action": 0,  # TRADE_ACTION_DEAL
            "symbol": symbol,
            "volume": volume,
            "price": price,
            "type": close_type,
            "type_filling": 1,  # ORDER_FILLING_IOC
            "deviation": deviation,
            "magic": 12345,
            "comment": "aegis_close",
        })

    async def modify_order(self, order_ticket: int, symbol: str, price: float | None = None,
                           sl: float | None = None, tp: float | None = None) -> dict:
        """Modify an existing order or position's SL/TP."""
        # Reverse-map frontend symbol → MT5 symbol
        mt5_symbol = self._symbol_map.get(symbol.upper(), symbol.upper())
        req = {
            "command": "order_send",
            "action": 2,  # TRADE_ACTION_SLTP
            "symbol": mt5_symbol,
            "order": order_ticket,
        }
        if price is not None:
            req["price"] = price
        if sl is not None:
            req["sl"] = sl
        if tp is not None:
            req["tp"] = tp

        async with self._req_lock:
            self._req_counter += 1
            req_id = self._req_counter
            req["id"] = req_id
            loop = self._loop or asyncio.get_running_loop()
            future = loop.create_future()
            self._pending_requests[req_id] = future

        try:
            await self._send_command(req)
            result = await asyncio.wait_for(future, timeout=10.0)
            return result
        except asyncio.TimeoutError:
            async with self._req_lock:
                self._pending_requests.pop(req_id, None)
            return {"error": "modify_timeout", "retcode": -1}
        except Exception as exc:
            return {"error": str(exc), "retcode": -1}

    async def get_positions(self, symbol: str | None = None) -> list[dict]:
        """Get all open positions (optionally filtered by symbol)."""
        if not self._running or not self._proc:
            return []

        # Reverse-map symbol if needed
        mt5_symbol = None
        if symbol:
            mt5_symbol = self._symbol_map.get(symbol.upper(), symbol.upper())

        req = {"command": "positions_get"}
        if mt5_symbol:
            req["symbol"] = mt5_symbol

        async with self._req_lock:
            self._req_counter += 1
            req_id = self._req_counter
            req["id"] = req_id
            loop = self._loop or asyncio.get_running_loop()
            future = loop.create_future()
            self._pending_requests[req_id] = future

        try:
            await self._send_command(req)
            return await asyncio.wait_for(future, timeout=10.0)
        except asyncio.TimeoutError:
            async with self._req_lock:
                self._pending_requests.pop(req_id, None)
            return []
        except Exception:
            return []

    async def get_open_orders(self, symbol: str | None = None) -> list[dict]:
        """Get all pending orders (optionally filtered by symbol)."""
        if not self._running or not self._proc:
            return []

        mt5_symbol = None
        if symbol:
            mt5_symbol = self._symbol_map.get(symbol.upper(), symbol.upper())

        req = {"command": "orders_get"}
        if mt5_symbol:
            req["symbol"] = mt5_symbol

        async with self._req_lock:
            self._req_counter += 1
            req_id = self._req_counter
            req["id"] = req_id
            loop = self._loop or asyncio.get_running_loop()
            future = loop.create_future()
            self._pending_requests[req_id] = future

        try:
            await self._send_command(req)
            return await asyncio.wait_for(future, timeout=10.0)
        except asyncio.TimeoutError:
            async with self._req_lock:
                self._pending_requests.pop(req_id, None)
            return []
        except Exception:
            return []

    async def get_account_info(self) -> dict:
        """Get MT5 account info (balance, equity, margin, etc.)."""
        if not self._running or not self._proc:
            return {"error": "MT5 bridge not running"}

        req = {"command": "account_info"}

        async with self._req_lock:
            self._req_counter += 1
            req_id = self._req_counter
            req["id"] = req_id
            loop = self._loop or asyncio.get_running_loop()
            future = loop.create_future()
            self._pending_requests[req_id] = future

        try:
            await self._send_command(req)
            return await asyncio.wait_for(future, timeout=10.0)
        except asyncio.TimeoutError:
            async with self._req_lock:
                self._pending_requests.pop(req_id, None)
            return {"error": "timeout"}
        except Exception as exc:
            return {"error": str(exc)}

    async def calc_margin(self, action: int, symbol: str, volume: float, price: float) -> dict:
        """Calculate margin required for a trade."""
        if not self._running or not self._proc:
            return {"margin": 0.0, "error": "MT5 bridge not running"}

        mt5_symbol = self._symbol_map.get(symbol.upper(), symbol.upper())
        req = {
            "command": "calc_margin",
            "action": action,
            "symbol": mt5_symbol,
            "volume": volume,
            "price": price,
        }

        async with self._req_lock:
            self._req_counter += 1
            req_id = self._req_counter
            req["id"] = req_id
            loop = self._loop or asyncio.get_running_loop()
            future = loop.create_future()
            self._pending_requests[req_id] = future

        try:
            await self._send_command(req)
            return await asyncio.wait_for(future, timeout=10.0)
        except asyncio.TimeoutError:
            async with self._req_lock:
                self._pending_requests.pop(req_id, None)
            return {"margin": 0.0, "error": "timeout"}
        except Exception as exc:
            return {"margin": 0.0, "error": str(exc)}

    async def get_history(self, symbol: str, interval: str = "1m", count: int = 500) -> list[dict]:
        """Fetch historical candles from MT5 via stdin command to the running worker.

        The *symbol* is expected in **frontend format** (e.g. ``XAUUSDT``).
        It will be reverse-mapped via ``symbol_map`` to the MT5-native
        symbol (e.g. ``XAUUSD``) before being sent to the worker.
        """
        if not self._running or not self._proc:
            logger.warning("mt5_get_history_not_running", symbol=symbol)
            return []

        # Reverse-map frontend symbol → MT5 symbol (e.g. XAUUSDT → XAUUSD)
        mt5_symbol = self._symbol_map.get(symbol.upper(), symbol.upper())

        tf = TIMEFRAME_MAP.get(interval, 1)

        async with self._req_lock:
            self._req_counter += 1
            req_id = self._req_counter
            loop = self._loop or asyncio.get_running_loop()
            future = loop.create_future()
            self._pending_requests[req_id] = future

        try:
            await self._send_command({
                "command": "fetch_history",
                "id": req_id,
                "symbol": mt5_symbol,
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
        if not self._proc:
            return

        # Close stdin to signal the worker to exit on its own
        try:
            with self._write_lock:
                if self._proc.stdin:
                    self._proc.stdin.close()
        except Exception:
            pass

        # Close stdout/stderr to unblock reader threads
        for pipe_name in ("stdout", "stderr"):
            pipe = getattr(self._proc, pipe_name, None)
            if pipe:
                try:
                    pipe.close()
                except Exception:
                    pass

        # Give the worker a moment, then kill
        try:
            await asyncio.to_thread(self._proc.wait, timeout=3)
        except Exception:
            try:
                self._proc.kill()
                await asyncio.to_thread(self._proc.wait)
            except Exception:
                pass
        self._proc = None
        logger.info("mt5_bridge_stopped")

    @property
    def is_connected(self) -> bool:
        return self._running and self._proc is not None and self._proc.returncode is None
