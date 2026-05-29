from __future__ import annotations

from typing import Any, Callable, Coroutine

import structlog

from execution.risk import RiskEngine
from indicators.calculator import ema, rsi, macd, bollinger_bands

logger = structlog.get_logger()

SignalHandler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


class TradingBot:
    def __init__(self, config: dict[str, Any]) -> None:
        self.name = config.get("name", "bot")
        self.strategy = config.get("strategy", "ema_crossover")
        self.symbol = config.get("symbol", "BTCUSDT")
        self.interval = config.get("interval", "1m")
        self.params = config.get("params", {})
        self.risk = RiskEngine(config.get("risk_params", {}))
        self.position: dict[str, Any] | None = None
        self._prices: list[float] = []
        self._highs: list[float] = []
        self._lows: list[float] = []
        self._volumes: list[float] = []
        self._enabled = config.get("enabled", False)
        self._live_mode = config.get("live_mode", False)  # False = paper, True = live MT5
        self._on_signal: SignalHandler | None = None

    def set_signal_handler(self, handler: SignalHandler | None) -> None:
        self._on_signal = handler

    @property
    def enabled(self) -> bool:
        return self._enabled

    def toggle(self) -> None:
        self._enabled = not self._enabled

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "strategy": self.strategy,
            "symbol": self.symbol,
            "interval": self.interval,
            "params": self.params,
            "risk_params": {
                "max_position_size": self.risk.max_position_size,
                "max_daily_loss": self.risk.max_daily_loss,
                "max_leverage": self.risk.max_leverage,
                "cooldown_seconds": self.risk.cooldown_seconds,
            },
            "enabled": self._enabled,
            "live_mode": self._live_mode,
        }

    async def on_candle(self, candle: dict[str, Any]) -> dict[str, Any] | None:
        if not self._enabled:
            return None

        # Only evaluate if the candle matches the bot's configured interval
        candle_interval = candle.get("interval", "")
        if candle_interval and candle_interval != self.interval:
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

    @property
    def live_mode(self) -> bool:
        return self._live_mode

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
            "live_mode": self._live_mode,
        }


# ---------------------------------------------------------------------------
# Bot Orchestrator — manages all bot instances, feeds candles, emits signals
# ---------------------------------------------------------------------------


class BotOrchestrator:
    """Manages TradingBot instances and routes candle data to them.

    Signals generated by bots are passed through a handler that can
    broadcast them via WebSocket and/or auto-create paper trading orders.
    """

    def __init__(self) -> None:
        self._bots: dict[str, TradingBot] = {}
        self._on_signal: SignalHandler | None = None

    def set_signal_handler(self, handler: SignalHandler | None) -> None:
        """Set the global handler called for every bot signal."""
        self._on_signal = handler
        # Update all existing bots
        for bot in self._bots.values():
            bot.set_signal_handler(self._make_bot_handler(bot.name))

    def _make_bot_handler(self, bot_name: str) -> SignalHandler:
        """Create a per-bot handler that delegates to the global handler."""

        async def handler(signal: dict[str, Any]) -> None:
            if self._on_signal:
                await self._on_signal(signal)

        return handler

    def add_bot(self, config: dict[str, Any]) -> TradingBot:
        """Add a new bot from a config dict. Returns the bot instance."""
        name = config.get("name", config.get("strategy", "bot"))
        if name in self._bots:
            raise ValueError(f"Bot '{name}' already exists")

        bot = TradingBot(config)
        bot.set_signal_handler(self._make_bot_handler(name))
        self._bots[name] = bot
        logger.info("bot_added", name=name, strategy=bot.strategy, symbol=bot.symbol)
        return bot

    def remove_bot(self, name: str) -> bool:
        """Remove a bot by name. Returns True if removed."""
        if name in self._bots:
            del self._bots[name]
            logger.info("bot_removed", name=name)
            return True
        return False

    def get_bot(self, name: str) -> TradingBot | None:
        return self._bots.get(name)

    def toggle_bot(self, name: str) -> TradingBot | None:
        """Toggle a bot's enabled state. Returns the bot or None."""
        bot = self._bots.get(name)
        if bot:
            bot.toggle()
            logger.info("bot_toggled", name=name, enabled=bot.enabled)
        return bot

    def list_bots(self) -> list[dict[str, Any]]:
        return [bot.to_dict() for bot in self._bots.values()]

    async def on_candle(self, candle: dict[str, Any]) -> None:
        """Feed a candle to all enabled bots."""
        symbol = candle.get("symbol", "")
        for bot in self._bots.values():
            if bot.symbol == symbol and bot.enabled:
                try:
                    await bot.on_candle(candle)
                except Exception as exc:
                    logger.exception("bot_candle_error", bot=bot.name, error=str(exc))

    async def feed_quote(self, symbol: str, price: float) -> None:
        """Feed a quote price to bots for real-time price checks (not strategy eval)."""
        # Quote-based evaluation is not implemented yet — strategies evaluate on candle close.
        # This method is a hook for future tick/quote-based strategies.
        pass
