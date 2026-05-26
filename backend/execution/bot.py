from __future__ import annotations

from typing import Any

import structlog

from execution.risk import RiskEngine
from indicators.calculator import ema, rsi, macd, bollinger_bands

logger = structlog.get_logger()


class TradingBot:
    def __init__(self, config: dict[str, Any]) -> None:
        self.name = config.get("name", "bot")
        self.strategy = config.get("strategy", "ema_crossover")
        self.symbol = config.get("symbol", "BTCUSDT")
        self.params = config.get("params", {})
        self.risk = RiskEngine(config.get("risk_params", {}))
        self.position: dict[str, Any] | None = None
        self._prices: list[float] = []
        self._highs: list[float] = []
        self._lows: list[float] = []
        self._volumes: list[float] = []
        self._enabled = config.get("enabled", False)
        self._on_signal = None

    def set_signal_handler(self, handler) -> None:
        self._on_signal = handler

    @property
    def enabled(self) -> bool:
        return self._enabled

    def toggle(self) -> None:
        self._enabled = not self._enabled

    async def on_candle(self, candle: dict[str, Any]) -> dict[str, Any] | None:
        if not self._enabled:
            return None

        close = candle.get("close", 0)
        high = candle.get("high", 0)
        low = candle.get("low", 0)
        vol = candle.get("volume", 0)
        ts = candle.get("time", 0)

        self._prices.append(close)
        self._highs.append(high)
        self._lows.append(low)
        self._volumes.append(vol)

        signal = await self._evaluate_strategy(candle)
        if signal:
            can_trade, reason = self.risk.can_trade(
                close, signal.get("volume", 0.1), ts / 1000
            )
            if can_trade:
                if self._on_signal:
                    await self._on_signal(signal)
                return signal
            else:
                logger.warning("bot_trade_blocked", bot=self.name, reason=reason)
        return None

    async def _evaluate_strategy(self, candle: dict[str, Any]) -> dict[str, Any] | None:
        strategy = self.strategy
        prices = self._prices
        close = candle.get("close", 0)

        if strategy == "ema_crossover":
            fast = self.params.get("fast", 9)
            slow = self.params.get("slow", 21)
            if len(prices) < slow + 2:
                return None
            fast_ema = ema(prices, fast)
            slow_ema = ema(prices, slow)
            if fast_ema[-1] is not None and slow_ema[-1] is not None and fast_ema[-2] is not None and slow_ema[-2] is not None:
                if fast_ema[-2] <= slow_ema[-2] and fast_ema[-1] > slow_ema[-1]:
                    return self._signal("buy", close, candle)
                if fast_ema[-2] >= slow_ema[-2] and fast_ema[-1] < slow_ema[-1]:
                    return self._signal("sell", close, candle)

        elif strategy == "rsi":
            period = self.params.get("period", 14)
            oversold = self.params.get("oversold", 30)
            overbought = self.params.get("overbought", 70)
            if len(prices) < period + 2:
                return None
            vals = rsi(prices, period)
            if vals[-1] is not None and vals[-2] is not None:
                if vals[-2] <= oversold and vals[-1] > oversold:
                    return self._signal("buy", close, candle)
                if vals[-2] >= overbought and vals[-1] < overbought:
                    return self._signal("sell", close, candle)

        elif strategy == "macd":
            if len(prices) < 26 + 9 + 2:
                return None
            vals = macd(prices)
            if vals[-1] and vals[-2] and vals[-1]["macd"] is not None and vals[-2]["macd"] is not None:
                if vals[-2]["macd"] <= vals[-2]["signal"] and vals[-1]["macd"] > vals[-1]["signal"]:
                    return self._signal("buy", close, candle)
                if vals[-2]["macd"] >= vals[-2]["signal"] and vals[-1]["macd"] < vals[-1]["signal"]:
                    return self._signal("sell", close, candle)

        elif strategy == "bollinger":
            period = self.params.get("period", 20)
            std = self.params.get("std", 2.0)
            if len(prices) < period + 2:
                return None
            bands = bollinger_bands(prices, period, std)
            if bands[-1] and bands[-1]["lower"] is not None and bands[-1]["upper"] is not None:
                if prices[-1] <= bands[-1]["lower"]:
                    return self._signal("buy", close, candle)
                if prices[-1] >= bands[-1]["upper"]:
                    return self._signal("sell", close, candle)

        return None

    def _signal(self, action: str, price: float, candle: dict[str, Any]) -> dict[str, Any]:
        vol = self.params.get("volume", 0.1)
        return {
            "type": "bot_signal",
            "bot": self.name,
            "strategy": self.strategy,
            "symbol": self.symbol,
            "action": action,
            "price": price,
            "volume": vol,
            "time": candle.get("time", 0),
        }
