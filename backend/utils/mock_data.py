from __future__ import annotations

import math
import random
import time
from typing import Any

INTERVAL_SECONDS = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
    "1w": 604800,
}

BASE_PRICES = {
    "BTCUSDT": 67500.0,
    "ETHUSDT": 3450.0,
    "XAUUSD": 2380.0,
    "XAGUSD": 29.5,
    "EURUSD": 1.0850,
    "SOLUSDT": 145.0,
}


def generate_candles(symbol: str, interval: str = "1m", limit: int = 500) -> list[dict[str, Any]]:
    interval_sec = INTERVAL_SECONDS.get(interval, 60)
    base = BASE_PRICES.get(symbol, 100.0)
    now = int(time.time() * 1000)
    now = (now // (interval_sec * 1000)) * (interval_sec * 1000)

    candles: list[dict[str, Any]] = []
    price = base
    volatility = base * 0.002

    for i in range(limit):
        t = now - (limit - 1 - i) * interval_sec * 1000
        change = random.gauss(0, volatility)
        trend = math.sin(i / 20) * volatility * 0.5
        step = change + trend

        o = price
        c = price + step
        h = max(o, c) + abs(random.gauss(0, volatility * 0.5))
        l = min(o, c) - abs(random.gauss(0, volatility * 0.5))
        v = random.uniform(base * 10, base * 100)

        candles.append({
            "time": t,
            "open": round(o, 2),
            "high": round(h, 2),
            "low": round(l, 2),
            "close": round(c, 2),
            "volume": round(v, 4),
        })
        price = c

    return candles


def candles_to_ticks(candles: list[dict]) -> list[dict]:
    ticks: list[dict] = []
    for c in candles:
        t = c["time"]
        o, h, l, cl = c["open"], c["high"], c["low"], c["close"]
        vol = max(c.get("volume", 0) / 4, 0.01)
        ticks.append({"timestamp": t, "price": o, "volume": vol, "side": "buy"})
        if h > o and h > cl:
            ticks.append({"timestamp": t + 1, "price": h, "volume": vol, "side": "buy"})
        if l < o and l < cl:
            ticks.append({"timestamp": t + 2, "price": l, "volume": vol, "side": "sell"})
        ticks.append({"timestamp": t + 3, "price": cl, "volume": vol, "side": "sell" if cl < o else "buy"})
    return sorted(ticks, key=lambda t: t["timestamp"])
