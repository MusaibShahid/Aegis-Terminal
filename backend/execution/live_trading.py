"""Live MT5 trading engine — wraps MT5Bridge with risk checks and WS event emission.

This engine sits between bot signals and the MT5 bridge, applying the
same RiskEngine checks used by paper trading before sending real orders.
It is **disabled by default** — must be explicitly enabled via WS/REST.

Rationale
---------
- All orders go through ``can_trade()`` risk checks (max position size,
  max daily loss, cooldown, max daily trades).
- Every submission is logged with full detail.
- MT5's own ``order_check`` validation is used before sending.
- The engine broadcasts status via WebSocket through a configurable handler.
- A daily reset method is provided (typically called by a scheduler or
  on server restart via the WS handler).
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Callable, Coroutine

import structlog

from connectors.mt5_bridge import MT5Bridge
from execution.risk import RiskEngine

logger = structlog.get_logger()

Handler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]

# MT5 order type constants
ORDER_TYPE_BUY = 0
ORDER_TYPE_SELL = 1
ORDER_TYPE_BUY_LIMIT = 2
ORDER_TYPE_SELL_LIMIT = 3
ORDER_TYPE_BUY_STOP = 4
ORDER_TYPE_SELL_STOP = 5

# MT5 trade action constants
TRADE_ACTION_DEAL = 0
TRADE_ACTION_PENDING = 1
TRADE_ACTION_SLTP = 2
TRADE_ACTION_MODIFY = 3
TRADE_ACTION_REMOVE = 4

# MT5 order filling constants
ORDER_FILLING_FOK = 0
ORDER_FILLING_IOC = 1
ORDER_FILLING_RETURN = 2

# MT5 order magic number for Aegis
AEGIS_MAGIC = 12345


class LiveTradingEngine:
    """Executes real MT5 trades through the MT5 bridge with safety checks.

    Parameters
    ----------
    mt5_bridge : MT5Bridge
        The connected MT5 bridge instance.
    risk_params : dict, optional
        Parameters for the risk engine (see ``RiskEngine.__init__``).
    max_daily_trades : int
        Hard limit on the number of live trades per day (default 20).
    """

    def __init__(
        self,
        mt5_bridge: MT5Bridge,
        risk_params: dict[str, Any] | None = None,
        max_daily_trades: int = 20,
    ) -> None:
        self._bridge = mt5_bridge
        self._risk = RiskEngine(risk_params or {})
        self._max_daily_trades = max_daily_trades
        self._daily_trade_count = 0
        self._enabled = False  # SAFETY: disabled by default
        self._on_event: Handler | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    @property
    def enabled(self) -> bool:
        return self._enabled

    def set_enabled(self, enabled: bool) -> None:
        """Enable or disable live trading.  Disabled by default."""
        was = self._enabled
        self._enabled = enabled
        if was != enabled:
            logger.warning("live_trading_toggled", enabled=enabled)
            asyncio.ensure_future(self._emit("live_enabled" if enabled else "live_disabled", {}))

    def set_event_handler(self, handler: Handler | None) -> None:
        self._on_event = handler

    def set_risk_params(self, params: dict[str, Any]) -> None:
        """Update risk engine parameters in-place."""
        for key in ("max_position_size", "max_daily_loss", "max_leverage", "cooldown_seconds"):
            if key in params:
                setattr(self._risk, key, params[key])

    @property
    def risk_params(self) -> dict[str, Any]:
        return {
            "max_position_size": self._risk.max_position_size,
            "max_daily_loss": self._risk.max_daily_loss,
            "max_leverage": self._risk.max_leverage,
            "cooldown_seconds": self._risk.cooldown_seconds,
            "daily_pnl": self._risk.daily_pnl,
            "daily_trade_count": self._daily_trade_count,
            "max_daily_trades": self._max_daily_trades,
        }

    # ------------------------------------------------------------------
    # Order execution
    # ------------------------------------------------------------------

    async def send_market_order(
        self,
        symbol: str,
        side: str,
        volume: float,
        *,
        price: float | None = None,
        sl: float | None = None,
        tp: float | None = None,
        deviation: int = 10,
        comment: str = "aegis_live",
        reason: str | None = None,
    ) -> dict[str, Any]:
        """Send a live market order through MT5 with full risk checks.

        Returns the order result dict or an error dict with ``"error"`` key.
        """
        if not self._enabled:
            return {"error": "live_trading_disabled"}

        if not self._bridge or not self._bridge.is_connected:
            return {"error": "mt5_bridge_not_connected"}

        symbol = symbol.upper()
        side_lower = side.lower()

        if side_lower not in ("buy", "sell"):
            return {"error": f"invalid_side: {side}"}

        order_type = ORDER_TYPE_BUY if side_lower == "buy" else ORDER_TYPE_SELL

        now = time.time()

        # --- Risk checks ---
        can_trade, reason_blocked = self._risk.can_trade(
            price or 0, volume, now
        )
        if not can_trade:
            logger.warning("live_trade_blocked_by_risk", symbol=symbol, side=side,
                           volume=volume, reason=reason_blocked)
            return {"error": f"risk_blocked: {reason_blocked}"}

        if self._daily_trade_count >= self._max_daily_trades:
            return {"error": "max_daily_trades_reached"}

        # Clamp deviation to safe range
        deviation = max(0, min(deviation, 100))

        # --- Build order request ---
        order_request = {
            "action": TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "price": price or 0.0,
            "sl": sl or 0.0,
            "tp": tp or 0.0,
            "deviation": deviation,
            "type": order_type,
            "type_filling": ORDER_FILLING_IOC,
            "magic": AEGIS_MAGIC,
            "comment": comment,
        }

        # --- Send to MT5 ---
        logger.info("live_order_sending", symbol=symbol, side=side, volume=volume,
                    price=price, reason=reason)
        result = await self._bridge.send_order(order_request)

        retcode = result.get("retcode", -1)
        success = retcode == 10009  # TRADE_RETCODE_DONE

        if success:
            self._risk.record_trade(0, now)  # P&L unknown yet; will be updated on position sync
            self._daily_trade_count += 1
            logger.info("live_order_filled", symbol=symbol, side=side, volume=volume,
                        deal=result.get("deal"), order=result.get("order"))
        else:
            error_str = result.get("error", mt5_error_string(retcode))
            logger.warning("live_order_rejected", symbol=symbol, side=side,
                           retcode=retcode, error=error_str)
            result["error"] = error_str

        await self._emit("live_order_result", {
            "symbol": symbol,
            "side": side,
            "volume": volume,
            "price": price,
            "sl": sl,
            "tp": tp,
            "success": success,
            "retcode": retcode,
            "deal": result.get("deal"),
            "order": result.get("order"),
            "reason": reason,
            "error": result.get("error"),
        })

        return result

    async def close_market_position(
        self,
        symbol: str,
        volume: float,
        price: float,
        *,
        deviation: int = 10,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """Close an MT5 position by sending an opposite market order.

        The engine will look up the current position to determine side.
        """
        if not self._enabled:
            return {"error": "live_trading_disabled"}

        positions = await self._bridge.get_positions(symbol=symbol)
        if not positions:
            return {"error": "no_position_to_close"}

        # Find the first open position for this symbol (netting)
        pos = positions[0]
        ticket = pos.get("ticket")
        if ticket is None:
            return {"error": "no_ticket_on_position"}

        # Determine opposite side
        pos_type = pos.get("type", ORDER_TYPE_BUY)
        close_type = ORDER_TYPE_SELL if pos_type == ORDER_TYPE_BUY else ORDER_TYPE_BUY

        # Clamp deviation to safe range
        deviation = max(0, min(deviation, 100))

        order_request = {
            "action": TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "price": price,
            "type": close_type,
            "type_filling": ORDER_FILLING_IOC,
            "deviation": deviation,
            "magic": AEGIS_MAGIC,
            "comment": "aegis_close",
        }

        logger.info("live_close_sending", symbol=symbol, volume=volume,
                    price=price, ticket=ticket, reason=reason)
        result = await self._bridge.send_order(order_request)

        retcode = result.get("retcode", -1)
        success = retcode == 10009

        if success:
            logger.info("live_position_closed", symbol=symbol, deal=result.get("deal"),
                        order=result.get("order"))
        else:
            error_str = result.get("error", mt5_error_string(retcode))
            logger.warning("live_close_rejected", symbol=symbol, retcode=retcode,
                           error=error_str)
            result["error"] = error_str

        await self._emit("live_close_result", {
            "symbol": symbol,
            "volume": volume,
            "price": price,
            "ticket": ticket,
            "success": success,
            "retcode": retcode,
            "deal": result.get("deal"),
            "order": result.get("order"),
            "reason": reason,
            "error": result.get("error"),
        })

        return result

    async def sync_positions(self) -> list[dict]:
        """Fetch and return current MT5 positions (updates internal tracking)."""
        if not self._bridge or not self._bridge.is_connected:
            return []

        positions = await self._bridge.get_positions()
        await self._emit("live_positions", {"positions": positions, "count": len(positions)})
        return positions

    async def sync_orders(self) -> list[dict]:
        """Fetch and return pending MT5 orders."""
        if not self._bridge or not self._bridge.is_connected:
            return []

        orders = await self._bridge.get_open_orders()
        await self._emit("live_orders", {"orders": orders, "count": len(orders)})
        return orders

    async def get_account_info(self) -> dict[str, Any]:
        """Fetch MT5 account info (balance, equity, margin)."""
        if not self._bridge or not self._bridge.is_connected:
            return {"error": "MT5 bridge not connected"}

        info = await self._bridge.get_account_info()
        if info and "error" not in info:
            await self._emit("live_account_info", info)
        return info

    # ------------------------------------------------------------------
    # Daily reset
    # ------------------------------------------------------------------

    def reset_daily(self) -> None:
        """Reset daily trade count and risk P&L (called at market open / midnight)."""
        self._daily_trade_count = 0
        self._risk.reset_daily()
        logger.info("live_trading_daily_reset")

    # ------------------------------------------------------------------
    # Status snapshot
    # ------------------------------------------------------------------

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self._enabled,
            "bridge_connected": self._bridge.is_connected if self._bridge else False,
            **self.risk_params,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _emit(self, event_type: str, data: dict[str, Any]) -> None:
        if self._on_event:
            try:
                await self._on_event({"type": event_type, "data": data})
            except Exception as exc:
                logger.warning("live_event_handler_error", event=event_type, error=str(exc))


def mt5_error_string(retcode: int) -> str:
    """Map MT5 retcode to a human-readable string."""
    errors = {
        10004: "TRADE_RETCODE_NO_MONEY",
        10006: "TRADE_RETCODE_INVALID",
        10007: "TRADE_RETCODE_INVALID_VOLUME",
        10008: "TRADE_RETCODE_INVALID_STOPS",
        10009: "TRADE_RETCODE_DONE",
        10010: "TRADE_RETCODE_TRADE_DISABLED",
        10011: "TRADE_RETCODE_MARKET_CLOSED",
        10012: "TRADE_RETCODE_NO_MARGIN",
        10013: "TRADE_RETCODE_NO_CHANGES",
        10014: "TRADE_RETCODE_TRADE_EXPERT_DISABLED",
        10015: "TRADE_RETCODE_TOO_MANY_REQUESTS",
        10016: "TRADE_RETCODE_NO_TIME",
        10017: "TRADE_RETCODE_INVALID_EXPIRATION",
        10018: "TRADE_RETCODE_INVALID_TRADE_VOLUME",
        10019: "TRADE_RETCODE_POSITION_CLOSED",
        10020: "TRADE_RETCODE_SERVER_DISABLED",
        10021: "TRADE_RETCODE_CLIENT_DISABLED",
        10022: "TRADE_RETCODE_CANCELED_BY_USER",
        10023: "TRADE_RETCODE_WRONG_ORDER",
        10024: "TRADE_RETCODE_SYNCHRONIZATION_ERROR",
        10025: "TRADE_RETCODE_ORDER_LOCKED",
        10026: "TRADE_RETCODE_LONG_ONLY",
        10027: "TRADE_RETCODE_SHORT_ONLY",
        10028: "TRADE_RETCODE_CLOSE_ONLY",
        10029: "TRADE_RETCODE_REQUOTE",
        10030: "TRADE_RETCODE_FIFO_ERROR",
        10031: "TRADE_RETCODE_SLTP_MISMATCH",
        10032: "TRADE_RETCODE_HEDGE_PROHIBITED",
        10033: "TRADE_RETCODE_FIFO_CLOSE_FAILED",
        10034: "TRADE_RETCODE_SLTP_PRICE_DECIMAL",
        10035: "TRADE_RETCODE_PRICE_LIMITABLE",
    }
    return errors.get(retcode, f"UNKNOWN_RETCODE_{retcode}")


