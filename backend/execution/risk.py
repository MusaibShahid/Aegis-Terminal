from __future__ import annotations

from typing import Any


class RiskEngine:
    def __init__(self, params: dict[str, Any] | None = None) -> None:
        p = params or {}
        self.max_position_size = p.get("max_position_size", 1.0)
        self.max_daily_loss = p.get("max_daily_loss", 500.0)
        self.max_leverage = p.get("max_leverage", 5.0)
        self.cooldown_seconds = p.get("cooldown_seconds", 60)
        self.daily_pnl = 0.0
        self.trade_count = 0
        self.last_trade_time = 0.0

    def can_trade(self, price: float, volume: float, current_time: float) -> tuple[bool, str]:
        if abs(volume) > self.max_position_size:
            return False, "Exceeds max position size"
        if self.daily_pnl <= -self.max_daily_loss:
            return False, "Max daily loss reached"
        if current_time - self.last_trade_time < self.cooldown_seconds:
            return False, "Cooldown active"
        return True, "ok"

    def record_trade(self, pnl: float, timestamp: float) -> None:
        self.daily_pnl += pnl
        self.trade_count += 1
        self.last_trade_time = timestamp

    def reset_daily(self) -> None:
        self.daily_pnl = 0.0
        self.trade_count = 0

    def compute_position_size(self, capital: float, risk_per_trade: float, stop_distance: float) -> float:
        if stop_distance <= 0:
            return 0.0
        risk_amount = capital * risk_per_trade
        size = risk_amount / stop_distance
        return min(size, self.max_position_size)
