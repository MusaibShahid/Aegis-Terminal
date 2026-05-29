from __future__ import annotations

import structlog

logger = structlog.get_logger()

INTERVAL_SECONDS = {
    "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "2h": 7200, "4h": 14400, "1d": 86400, "1w": 604800,
}

TRADING_SESSIONS = {
    "asian": (0, 9),
    "london": (8, 17),
    "new_york": (13, 22),
}


class TickEngine:
    def __init__(self) -> None:
        self._candles: dict[str, dict] = {}
        self._ticks: dict[str, list[dict]] = {}
        self._deltas: dict[str, float] = {}
        self._cumulative_delta: dict[str, float] = {}
        self._sessions: dict[str, str] = {}

    MAX_TICKS = 5000  # Cap per-symbol tick buffer to prevent unbounded memory growth

    def process_tick(self, symbol: str, price: float, volume: float, side: str, ts: int) -> dict:
        ticks = self._ticks.setdefault(symbol, [])
        ticks.append({
            "price": price, "volume": volume, "side": side, "timestamp": ts,
        })
        # Trim to prevent unbounded memory growth
        if len(ticks) > self.MAX_TICKS:
            del ticks[: len(ticks) - self.MAX_TICKS]

        delta = volume if side == "buy" else -volume
        self._deltas[symbol] = self._deltas.get(symbol, 0) + delta
        self._cumulative_delta[symbol] = self._cumulative_delta.get(symbol, 0) + delta

        self._track_session(symbol, ts)
        return self._update_candles(symbol, price, volume, side, ts)

    def _track_session(self, symbol: str, ts: int) -> None:
        hour = (ts // 3600000) % 24
        # Priority: new_york > london > asian (most active market first)
        sessions = []
        for name, (start, end) in TRADING_SESSIONS.items():
            if start <= hour < end or (start > end and (hour >= start or hour < end)):
                sessions.append(name)
        if "new_york" in sessions:
            self._sessions[symbol] = "new_york"
        elif "london" in sessions:
            self._sessions[symbol] = "london"
        elif "asian" in sessions:
            self._sessions[symbol] = "asian"
        else:
            self._sessions[symbol] = "closed"

    def _update_candles(self, symbol: str, price: float, volume: float, side: str, ts: int) -> dict:
        result = {}
        now_ms = self._now_ms()
        for interval, sec in INTERVAL_SECONDS.items():
            bucket = (ts // (sec * 1000)) * (sec * 1000)
            close_time = bucket + (sec * 1000)
            key = f"{symbol}:{interval}"
            c = self._candles.get(key)

            if c is None or bucket != c["time"]:
                if c is not None:
                    c["close_time"] = c["time"] + (sec * 1000)
                    c["remaining_seconds"] = 0
                    c["is_final"] = True
                    result[f"{interval}_completed"] = c
                self._candles[key] = {
                    "time": bucket,
                    "open_time": bucket,
                    "close_time": close_time,
                    "interval": interval,
                    "remaining_seconds": max(0, (close_time - now_ms) // 1000),
                    "open": price,
                    "high": price,
                    "low": price,
                    "close": price,
                    "volume": volume,
                    "tick_count": 1,
                    "buy_volume": volume if side == "buy" else 0,
                    "sell_volume": volume if side == "sell" else 0,
                    "session": self._sessions.get(symbol, "unknown"),
                    "timezone": "UTC",
                }
            else:
                c["high"] = max(c["high"], price)
                c["low"] = min(c["low"], price)
                c["close"] = price
                c["close_time"] = close_time
                c["remaining_seconds"] = max(0, (close_time - now_ms) // 1000)
                c["volume"] += volume
                c["tick_count"] += 1
                if side == "buy":
                    c["buy_volume"] = c.get("buy_volume", 0) + volume
                else:
                    c["sell_volume"] = c.get("sell_volume", 0) + volume

            result[interval] = self._candles[key]
        return result

    @staticmethod
    def _now_ms() -> int:
        import time
        return int(time.time() * 1000)

    def get_candle(self, symbol: str, interval: str) -> dict | None:
        return self._candles.get(f"{symbol}:{interval}")

    def get_delta(self, symbol: str) -> float:
        return self._deltas.get(symbol, 0.0)

    def get_cumulative_delta(self, symbol: str) -> float:
        return self._cumulative_delta.get(symbol, 0.0)

    def get_ticks(self, symbol: str, limit: int = 1000) -> list[dict]:
        return self._ticks.get(symbol, [])[-limit:]

    def get_session(self, symbol: str) -> str:
        return self._sessions.get(symbol, "unknown")

    def clear_ticks(self, symbol: str) -> None:
        self._ticks[symbol] = []
