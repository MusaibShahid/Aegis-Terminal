"""
Load testing scenarios for Aegis Terminal.

Usage
-----
Standalone (locust installed):
    locust -f locustfile.py --host=http://localhost:8000

Docker (recommended for production stack):
    docker compose -f docker-compose.loadtest.yml up

Then open http://localhost:8089 in your browser to control the test.

To run headless (no web UI):
    locust -f locustfile.py --host=http://localhost:8000 \\
        --headless -u 50 -r 5 --run-time 2m \\
        --html report.html --csv report
"""

from __future__ import annotations

import asyncio
import json
import random
import time
from typing import Any

import websockets

from locust import FastHttpUser, task, between, events
from locust.exception import StopUser


# ──────────────────────────────────────────────────────────────────────
# Configuration — tweak these to match your environment
# ──────────────────────────────────────────────────────────────────────

SYMBOLS = ["XAUUSDT", "BTCUSDT", "ETHUSDT", "SOLUSDT", "AAPL"]
INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"]
PAPER_SYMBOLS = ["BTCUSDT", "ETHUSDT"]


# ──────────────────────────────────────────────────────────────────────
# Custom load shape — ramp-up then steady
# ──────────────────────────────────────────────────────────────────────

class StagesShape:
    """Ramp from 0 → 50 users over 60 s, hold for 120 s, then stop."""
    def __init__(self) -> None:
        self._start: float | None = None

    def tick(self) -> tuple[int, float] | None:
        if self._start is None:
            self._start = time.time()
        run_time = time.time() - self._start
        if run_time < 60:
            return (int(5 + run_time * 0.75), 5)  # ramp to ~50
        if run_time < 180:
            return (50, 5)  # steady state
        return None


# ──────────────────────────────────────────────────────────────────────
# Base user — shared helpers
# ──────────────────────────────────────────────────────────────────────

class AegisUser(FastHttpUser):
    """Base user for the Aegis Terminal load test.

    Subclasses define which scenario they run. ``FastHttpUser`` reuses
    HTTP connections (keep-alive) which is closer to real browser /
    production nginx behaviour.
    """
    abstract = True
    wait_time = between(0.5, 2.0)
    network_timeout = 10.0
    connection_timeout = 5.0

    def __init__(self, environment):
        super().__init__(environment)
        self._paper_positions: list[int] = []

    # ── helpers ──────────────────────────────────────────────────────

    def _random_symbol(self) -> str:
        return random.choice(SYMBOLS)

    def _random_interval(self) -> str:
        return random.choice(INTERVALS)

    # ── REST task wrappers ──────────────────────────────────────────

    def _health(self):
        self.client.get("/api/health", name="GET /api/health")

    def _instruments(self):
        self.client.get("/api/instruments", name="GET /api/instruments")

    def _history(self):
        sym = self._random_symbol()
        interval = self._random_interval()
        limit = random.choice([100, 200, 500])
        with self.client.get(
            f"/api/history?symbol={sym}&interval={interval}&limit={limit}",
            name="GET /api/history",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                if data.get("source") == "mock":
                    resp.failure(f"got mock data for {sym}")
            else:
                resp.failure(f"status={resp.status_code}")

    def _paper_account(self):
        with self.client.get("/api/paper/account", name="GET /api/paper/account") as resp:
            if resp.status_code == 200:
                data = resp.json()
                if "error" in data:
                    resp.failure(data["error"])

    def _paper_positions(self):
        self.client.get("/api/paper/positions", name="GET /api/paper/positions")

    def _paper_order(self):
        """Create a paper market buy, then cancel any leftover orders."""
        sym = random.choice(PAPER_SYMBOLS)
        qty = round(random.uniform(0.01, 0.5), 2)
        with self.client.post(
            f"/api/paper/orders?symbol={sym}&side=buy&order_type=market&quantity={qty}",
            name="POST /api/paper/orders (buy)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                if "error" in data:
                    resp.failure(data["error"])
            elif resp.status_code == 400:
                # Expected for insufficient balance — not a load issue
                resp.success()
            else:
                resp.failure(f"status={resp.status_code}")

    def _paper_order_sell(self):
        """Sell to close / reduce a position."""
        sym = random.choice(PAPER_SYMBOLS)
        with self.client.get(
            f"/api/paper/positions",
            name="GET /api/paper/positions (check before sell)",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                return
            positions = resp.json().get("positions", [])
        pos = next((p for p in positions if p.get("symbol") == sym and p.get("side") == "long"), None)
        if not pos:
            return
        qty = round(pos.get("quantity", 0.1) * random.uniform(0.1, 0.5), 2)
        self.client.post(
            f"/api/paper/orders?symbol={sym}&side=sell&order_type=market&quantity={qty}",
            name="POST /api/paper/orders (sell)",
        )

    def _paper_history(self):
        self.client.get("/api/paper/history", name="GET /api/paper/history")

    def _paper_settings(self):
        self.client.get("/api/paper/settings", name="GET /api/paper/settings")

    def _live_status(self):
        self.client.get("/api/live/status", name="GET /api/live/status")

    def _live_account(self):
        self.client.get("/api/live/account", name="GET /api/live/account")

    def _live_positions(self):
        self.client.get("/api/live/positions", name="GET /api/live/positions")

    def _dependencies(self):
        self.client.get("/api/dependencies", name="GET /api/dependencies")

    def _bots(self):
        self.client.get("/api/bots", name="GET /api/bots")

    def _alerts(self):
        self.client.get("/api/alerts", name="GET /api/alerts")

    def _journals(self):
        self.client.get("/api/journal", name="GET /api/journal")

    def _replay_status(self):
        self.client.get("/api/replay/status", name="GET /api/replay/status")

    def _countdown(self):
        sym = self._random_symbol()
        self.client.get(
            f"/api/countdown/{sym}",
            name="GET /api/countdown/{symbol}",
        )


# ──────────────────────────────────────────────────────────────────────
# Persona users (each runs one scenario for realistic distribution)
# ──────────────────────────────────────────────────────────────────────


class ChartViewerUser(AegisUser):
    """Simulates a user browsing charts: history, instruments, health."""

    @task(5)
    def t_history(self):
        self._history()

    @task(2)
    def t_instruments(self):
        self._instruments()

    @task(1)
    def t_health(self):
        self._health()

    @task(1)
    def t_dependencies(self):
        self._dependencies()

    @task(1)
    def t_countdown(self):
        self._countdown()


class PaperTraderUser(AegisUser):
    """Simulates a paper trader: account, orders, positions, history."""

    @task(2)
    def t_account(self):
        self._paper_account()

    @task(3)
    def t_buy(self):
        self._paper_order()

    @task(2)
    def t_sell(self):
        self._paper_order_sell()

    @task(1)
    def t_positions(self):
        self._paper_positions()

    @task(1)
    def t_history(self):
        self._paper_history()

    @task(1)
    def t_settings(self):
        self._paper_settings()


class DashboardUser(AegisUser):
    """Simulates a dashboard monitoring all systems."""

    @task(2)
    def t_health(self):
        self._health()

    @task(2)
    def t_live_status(self):
        self._live_status()

    @task(1)
    def t_live_account(self):
        self._live_account()

    @task(1)
    def t_live_positions(self):
        self._live_positions()

    @task(2)
    def t_instruments(self):
        self._instruments()

    @task(2)
    def t_history(self):
        self._history()

    @task(1)
    def t_bots(self):
        self._bots()

    @task(1)
    def t_alerts(self):
        self._alerts()

    @task(1)
    def t_journals(self):
        self._journals()


class MixedUser(AegisUser):
    """Simulates a power user doing everything."""

    @task(3)
    def t_history(self):
        self._history()

    @task(2)
    def t_instruments(self):
        self._instruments()

    @task(1)
    def t_health(self):
        self._health()

    @task(1)
    def t_paper_account(self):
        self._paper_account()

    @task(1)
    def t_paper_order(self):
        self._paper_order()

    @task(1)
    def t_live_status(self):
        self._live_status()

    @task(1)
    def t_live_account(self):
        self._live_account()

    @task(1)
    def t_dependencies(self):
        self._dependencies()

    @task(1)
    def t_bots(self):
        self._bots()


# ══════════════════════════════════════════════════════════════════════
# WebSocket load testing
# ══════════════════════════════════════════════════════════════════════

class WebSocketClient:
    """Minimal async-friendly WebSocket wrapper for Locust.

    Locust's built-in HTTP session doesn't support WS natively, so we
    use ``websockets`` library and track connect/disconnect via events.
    """

    def __init__(self, host: str) -> None:
        self._host = host.replace("http://", "ws://").replace("https://", "wss://")
        self._ws = None

    async def connect(self, channel: str = "market") -> bool:
        try:
            self._ws = await websockets.connect(f"{self._host}/ws/{channel}")
            return True
        except Exception:
            return False

    async def send(self, data: dict) -> bool:
        if not self._ws:
            return False
        try:
            await self._ws.send(json.dumps(data))
            return True
        except Exception:
            return False

    async def recv(self, timeout: float = 2.0) -> dict | None:
        if not self._ws:
            return None
        try:
            msg = await asyncio.wait_for(self._ws.recv(), timeout=timeout)
            return json.loads(msg)
        except Exception:
            return None

    async def close(self) -> None:
        if self._ws:
            await self._ws.close()
            self._ws = None


class WebSocketUser(AegisUser):
    """Simulates a persistent WebSocket connection (chart subscriber).

    Creates a dedicated asyncio event loop on start to avoid gevent
    compatibility issues (Locust uses gevent internally).
    Connects on start, subscribes to symbols, and periodically sends
    pings while receiving messages.
    """
    wait_time = between(1.0, 3.0)

    def on_start(self):
        # Dedicated event loop — avoids ``asyncio.get_event_loop()``
        # issues inside gevent greenlets (Python 3.10+ deprecation).
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)

        self._ws = WebSocketClient(self.host)
        connected = self._loop.run_until_complete(self._ws.connect("market"))
        if not connected:
            self._loop.close()
            raise StopUser("WebSocket connection failed")

        # Subscribe to random symbols
        symbols = random.sample(SYMBOLS, min(2, len(SYMBOLS)))
        self._loop.run_until_complete(
            self._ws.send({
                "type": "subscribe",
                "symbols": symbols,
                "intervals": ["1m"],
            })
        )

    @task
    def t_send_ping(self):
        """Send a ping and verify pong response."""
        sent = self._loop.run_until_complete(self._ws.send({"type": "ping"}))
        if not sent:
            raise StopUser("WebSocket send failed — connection lost")
        resp = self._loop.run_until_complete(self._ws.recv(timeout=3.0))
        if resp and resp.get("type") == "pong":
            events.request.fire(
                request_type="WS",
                name="WS ping / pong",
                response_time=0,
                response_length=0,
                exception=None,
                context=None,
            )
        else:
            events.request.fire(
                request_type="WS",
                name="WS ping / pong",
                response_time=0,
                response_length=0,
                exception=Exception(f"unexpected response: {resp}"),
                context=None,
            )

    def on_stop(self):
        try:
            self._loop.run_until_complete(self._ws.close())
        finally:
            self._loop.close()


# ══════════════════════════════════════════════════════════════════════
# Event hooks for custom reporting
# ══════════════════════════════════════════════════════════════════════


@events.quitting.add_listener
def _(environment, **kw):
    """Print a summary line when the test finishes."""
    if environment.stats:
        stats = environment.stats
        total = stats.total
        fail_pct = (total.fail_ratio * 100) if total.num_requests > 0 else 0
        rps = total.current_rps or 0
        p95 = total.get_response_time_percentile(0.95) or 0
        print()
        print("═" * 60)
        print(f"  Total requests : {total.num_requests}")
        print(f"  Failed         : {total.num_failures} ({fail_pct:.1f}%)")
        print(f"  Avg RPS        : {rps:.0f}")
        print(f"  P95 latency    : {p95:.0f} ms")
        print(f"  Avg latency    : {total.avg_response_time:.0f} ms")
        print("═" * 60)
        print()
