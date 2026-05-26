"""Proper candle-to-candle aggregation engine.

Accumulates 1m candles (pre-built from MT5/Binance) into higher timeframes
using full OHLC values — not simulated ticks from close prices.
"""

from __future__ import annotations

import structlog

logger = structlog.get_logger()

INTERVAL_SECONDS: dict[str, int] = {
    "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "2h": 7200, "4h": 14400, "1d": 86400, "1w": 604800,
}

HIGHER_INTERVALS = ["3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"]


def validate_candle(candle: dict) -> list[str]:
    """Validate OHLC consistency. Returns list of violations (empty = valid)."""
    errors: list[str] = []
    o, h, l, c = candle.get("open"), candle.get("high"), candle.get("low"), candle.get("close")
    v = candle.get("volume", 0)
    t = candle.get("time", 0)
    iv = candle.get("interval", "")

    if any(x is None for x in (o, h, l, c)):
        errors.append("Missing OHLC field")
    else:
        if h < max(o, c):
            errors.append(f"High ({h}) < max(Open,Close) ({max(o, c)})")
        if l > min(o, c):
            errors.append(f"Low ({l}) > min(Open,Close) ({min(o, c)})")
        if not (l <= o <= h):
            errors.append(f"Open ({o}) outside High-Low range [{l}, {h}]")
        if not (l <= c <= h):
            errors.append(f"Close ({c}) outside High-Low range [{l}, {h}]")

    if v < 0:
        errors.append(f"Negative volume ({v})")

    sec = INTERVAL_SECONDS.get(iv, 60)
    if t % (sec * 1000) != 0:
        errors.append(f"Timestamp {t} not aligned to {iv} boundary ({sec}s)")

    return errors


def align_timestamp(ts: int, interval_sec: int) -> int:
    """Align a millisecond timestamp to the start of its interval bucket in UTC."""
    return (ts // (interval_sec * 1000)) * (interval_sec * 1000)


class CandleAggregator:
    """Aggregates incoming 1m candles into higher timeframe candles.

    Maintains per-(symbol, interval) partial candles that get updated
    as each new 1m candle arrives.
    """

    def __init__(self) -> None:
        self._agg: dict[str, dict] = {}
        self._dirty: set[str] = set()

    def ingest(self, candle: dict) -> dict[str, dict]:
        """Ingest a 1m candle and produce completed higher-TF candles.

        Returns dict of completed candles keyed by e.g. "5m_completed".
        Call get_and_clear_dirty() after broadcast to get changed partial keys.
        """
        symbol = candle.get("symbol", "")
        src_interval = candle.get("interval", "1m")
        ts = candle.get("time", 0)

        if src_interval != "1m":
            return {}

        completed: dict[str, dict] = {}

        for target_interval in HIGHER_INTERVALS:
            target_sec = INTERVAL_SECONDS[target_interval]
            key = f"{symbol}:{target_interval}"
            bucket = align_timestamp(ts, target_sec)

            existing = self._agg.get(key)

            if existing and existing["time"] == bucket:
                old_high, old_low, old_close = existing["high"], existing["low"], existing["close"]
                existing["high"] = max(existing["high"], candle["high"])
                existing["low"] = min(existing["low"], candle["low"])
                existing["close"] = candle["close"]
                existing["volume"] += candle["volume"]
                existing["tick_count"] += 1
                existing["close_time"] = bucket + target_sec * 1000
                if (existing["high"] != old_high or existing["low"] != old_low
                        or existing["close"] != old_close):
                    self._dirty.add(key)
            else:
                if existing and existing["time"] < bucket:
                    existing["is_final"] = True
                    completed[f"{target_interval}_completed"] = dict(existing)

                self._agg[key] = {
                    "symbol": symbol, "interval": target_interval,
                    "time": bucket, "open_time": bucket,
                    "close_time": bucket + target_sec * 1000,
                    "open": candle["open"], "high": candle["high"],
                    "low": candle["low"], "close": candle["close"],
                    "volume": candle["volume"], "tick_count": 1,
                    "timezone": "UTC", "is_final": False,
                    "session": candle.get("session", "unknown"),
                }
                self._dirty.add(key)

        return completed

    def get_and_clear_dirty(self) -> set[str]:
        """Return set of dirty (symbol:interval) keys and clear the set."""
        dirty = self._dirty.copy()
        self._dirty.clear()
        return dirty

    def get_candle(self, symbol: str, interval: str) -> dict | None:
        key = f"{symbol}:{interval}"
        c = self._agg.get(key)
        if c:
            c["remaining_seconds"] = max(0, (c["close_time"] - self._now_ms()) // 1000)
        return c

    def get_all_candles(self, symbol: str) -> dict[str, dict]:
        """Return all current partial candles for a symbol, keyed by interval."""
        prefix = f"{symbol}:"
        return {k.split(":")[1]: v for k, v in self._agg.items() if k.startswith(prefix)}

    @staticmethod
    def _now_ms() -> int:
        import time
        return int(time.time() * 1000)
