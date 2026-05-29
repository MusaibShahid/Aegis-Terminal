from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import structlog

logger = structlog.get_logger()


class Strategy(ABC):
    def __init__(self, name: str) -> None:
        self.name = name

    @abstractmethod
    async def on_candle(self, candle: dict[str, Any]) -> dict[str, Any] | None:
        ...


class EMACrossover(Strategy):
    def __init__(self, fast: int = 9, slow: int = 21):
        super().__init__(f"ema_crossover_{fast}_{slow}")
        self.fast = fast
        self.slow = slow
        self._prices: list[float] = []

    async def on_candle(self, candle: dict[str, Any]) -> dict[str, Any] | None:
        close = candle.get("close", 0)
        self._prices.append(close)
        if len(self._prices) < self.slow + 2:
            return None
        from indicators.calculator import ema
        fast_vals = ema(self._prices, self.fast)
        slow_vals = ema(self._prices, self.slow)
        if fast_vals[-2] is not None and slow_vals[-2] is not None and fast_vals[-1] is not None and slow_vals[-1] is not None:
            if fast_vals[-2] <= slow_vals[-2] and fast_vals[-1] > slow_vals[-1]:
                return {"type": "signal", "strategy": self.name, "action": "buy", "price": close, "time": candle.get("time")}
            if fast_vals[-2] >= slow_vals[-2] and fast_vals[-1] < slow_vals[-1]:
                return {"type": "signal", "strategy": self.name, "action": "sell", "price": close, "time": candle.get("time")}
        return None


class RSIStrategy(Strategy):
    def __init__(self, period: int = 14, oversold: int = 30, overbought: int = 70):
        super().__init__(f"rsi_{period}_{oversold}_{overbought}")
        self.period = period
        self.oversold = oversold
        self.overbought = overbought
        self._prices: list[float] = []

    async def on_candle(self, candle: dict[str, Any]) -> dict[str, Any] | None:
        close = candle.get("close", 0)
        self._prices.append(close)
        if len(self._prices) < self.period + 1:
            return None
        from indicators.calculator import rsi
        vals = rsi(self._prices, self.period)
        if vals[-2] is not None and vals[-1] is not None:
            if vals[-2] <= self.oversold and vals[-1] > self.oversold:
                return {"type": "signal", "strategy": self.name, "action": "buy", "price": close, "time": candle.get("time")}
            if vals[-2] >= self.overbought and vals[-1] < self.overbought:
                return {"type": "signal", "strategy": self.name, "action": "sell", "price": close, "time": candle.get("time")}
        return None


class BacktestResult:
    def __init__(self) -> None:
        self.trades: list[dict[str, Any]] = []
        self.pnl: float = 0.0
        self.wins: int = 0
        self.losses: int = 0
        self.peak: float = 0.0
        self.drawdown: float = 0.0

    @property
    def win_rate(self) -> float:
        total = self.wins + self.losses
        return self.wins / total if total > 0 else 0.0

    @property
    def sharpe(self) -> float:
        if len(self.trades) < 2:
            return 0.0
        returns = [t.get("return", 0) for t in self.trades]
        mean_r = sum(returns) / len(returns)
        var_r = sum((r - mean_r) ** 2 for r in returns) / len(returns)
        return mean_r / (var_r ** 0.5) if var_r > 0 else 0.0


class BacktestEngine:
    def __init__(self, strategy: Strategy, initial_capital: float = 10000.0):
        self.strategy = strategy
        self.capital = initial_capital
        self.position: str | None = None
        self.entry_price = 0.0
        self.result = BacktestResult()

    async def run(self, candles: list[dict[str, Any]]) -> BacktestResult:
        for candle in candles:
            signal = await self.strategy.on_candle(candle)
            if signal:
                await self._handle_signal(signal, candle)
        return self.result

    async def _handle_signal(self, signal: dict[str, Any], candle: dict[str, Any]) -> None:
        price = signal.get("price", 0)
        action = signal.get("action")

        if action == "buy" and self.position is None:
            self.position = "long"
            self.entry_price = price
        elif action == "sell" and self.position == "long":
            ret = (price - self.entry_price) / self.entry_price
            self.result.trades.append({"entry": self.entry_price, "exit": price, "return": ret})
            self.result.pnl += ret
            # Track peak equity and drawdown
            if self.result.pnl > self.result.peak:
                self.result.peak = self.result.pnl
            current_drawdown = self.result.peak - self.result.pnl
            if current_drawdown > self.result.drawdown:
                self.result.drawdown = current_drawdown
            if ret > 0:
                self.result.wins += 1
            else:
                self.result.losses += 1
            self.position = None
