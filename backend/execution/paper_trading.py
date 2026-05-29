from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Coroutine

import structlog

from execution.orderbook import OrderBookSimulator

logger = structlog.get_logger()

Handler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


# ---------------------------------------------------------------------------
# Enums & Data classes
# ---------------------------------------------------------------------------


class OrderSide(Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class OrderStatus(Enum):
    OPEN = "open"
    PARTIAL = "partial"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


class PositionSide(Enum):
    LONG = "long"
    SHORT = "short"


@dataclass
class PaperOrder:
    id: int = 0
    position_id: int | None = None
    symbol: str = ""
    side: OrderSide = OrderSide.BUY
    order_type: OrderType = OrderType.MARKET
    price: float | None = None
    stop_price: float | None = None
    quantity: float = 0.0
    filled_price: float | None = None
    filled_quantity: float = 0.0
    status: OrderStatus = OrderStatus.OPEN
    slippage: float | None = None
    reason: str | None = None
    created_at: int = 0
    filled_at: int | None = None


@dataclass
class PaperPosition:
    id: int = 0
    symbol: str = ""
    side: PositionSide = PositionSide.LONG
    entry_price: float = 0.0
    quantity: float = 0.0
    stop_loss: float | None = None
    take_profit: float | None = None
    pnl: float = 0.0
    pnl_pct: float = 0.0
    status: str = "open"
    reason: str | None = None
    opened_at: int = 0
    closed_at: int | None = None


@dataclass
class PaperClosedTrade:
    id: int = 0
    symbol: str = ""
    side: PositionSide = PositionSide.LONG
    entry_price: float = 0.0
    exit_price: float = 0.0
    quantity: float = 0.0
    pnl: float = 0.0
    pnl_pct: float = 0.0
    entry_reason: str | None = None
    exit_reason: str | None = None
    opened_at: int = 0
    closed_at: int = 0


# ---------------------------------------------------------------------------
# Paper Trading Engine
# ---------------------------------------------------------------------------


DEFAULT_INITIAL_BALANCE = 10_000.0
DEFAULT_SLIPPAGE_BPS = 1.0  # 1 bps = 0.01 %
DEFAULT_FEE_MODEL = "exchange"  # "none" | "exchange"
DEFAULT_TAKER_FEE_BPS = 10.0  # 0.1 %
DEFAULT_MAKER_FEE_BPS = 8.0   # 0.08 %


class PaperTradingEngine:
    """Simulated execution engine for paper trading.

    Processes market, limit, stop, and stop-limit orders using a
    configurable slippage model backed by the order book simulator.

    Key behaviours
    --------------
    * **Market orders** fill immediately at the VWAP through the book plus
      configurable slippage.
    * **Limit orders** fill when price crosses the limit level.
    * **Stop orders** trigger when price reaches the stop level, then fill
      as market orders.
    * **Stop-limit** orders trigger at the stop level and become a limit order.
    * **Long/short positions** are tracked with mark-to-market P&L.
    * **SL/TP** can be attached to positions and auto-close when triggered.
    * **Fees** are deducted on each fill based on ``fee_model``.
    * **Events** are emitted through a handler callback for WS broadcast.
    """

    def __init__(
        self,
        orderbook: OrderBookSimulator | None = None,
        initial_balance: float = DEFAULT_INITIAL_BALANCE,
        slippage_bps: float = DEFAULT_SLIPPAGE_BPS,
        fee_model: str = DEFAULT_FEE_MODEL,
        taker_fee_bps: float = DEFAULT_TAKER_FEE_BPS,
        maker_fee_bps: float = DEFAULT_MAKER_FEE_BPS,
    ) -> None:
        self.orderbook = orderbook or OrderBookSimulator()

        self._balance = initial_balance
        self._initial_balance = initial_balance

        self._positions: dict[int, PaperPosition] = {}  # id -> position
        self._orders: dict[int, PaperOrder] = {}  # id -> order
        self._closed_trades: list[PaperClosedTrade] = []

        self._next_pos_id = 1
        self._next_order_id = 1

        self._slippage_bps = slippage_bps
        self._fee_model = fee_model
        self._taker_fee_bps = taker_fee_bps
        self._maker_fee_bps = maker_fee_bps
        self._total_fees_paid = 0.0
        self._pending_triggers: list[int] = []  # order ids that will fill next price update

        self._on_event: Handler | None = None

        # Stats
        self._total_trades = 0
        self._wins = 0
        self._losses = 0
        self._total_pnl = 0.0

        self._running = False
        self._task: asyncio.Task | None = None
        self._db: Any = None  # persistent DB connection for auto-persistence

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def set_event_handler(self, handler: Handler | None) -> None:
        self._on_event = handler

    def set_db(self, db) -> None:
        """Set a persistent DB connection for auto-persistence of price-driven fills."""
        self._db = db

    @property
    def balance(self) -> float:
        return self._balance

    @property
    def equity(self) -> float:
        pos_value = sum(
            self._mark_to_market(p) for p in self._positions.values()
        )
        return self._balance + pos_value

    @property
    def open_positions(self) -> list[PaperPosition]:
        return [p for p in self._positions.values() if p.status == "open"]

    @property
    def open_orders(self) -> list[PaperOrder]:
        return [o for o in self._orders.values() if o.status in (OrderStatus.OPEN, OrderStatus.PARTIAL)]

    @property
    def closed_trades(self) -> list[PaperClosedTrade]:
        return list(self._closed_trades)

    @property
    def settings(self) -> dict[str, Any]:
        return {
            "initial_balance": self._initial_balance,
            "slippage_bps": self._slippage_bps,
            "fee_model": self._fee_model,
            "taker_fee_bps": self._taker_fee_bps,
            "maker_fee_bps": self._maker_fee_bps,
        }

    @property
    def stats(self) -> dict[str, Any]:
        return {
            "balance": round(self._balance, 2),
            "initial_balance": self._initial_balance,
            "equity": round(self.equity, 2),
            "total_pnl": round(self._total_pnl, 2),
            "total_trades": self._total_trades,
            "wins": self._wins,
            "losses": self._losses,
            "total_fees_paid": round(self._total_fees_paid, 2),
            "win_rate": round(self._wins / self._total_trades * 100, 1)
            if self._total_trades > 0 else 0,
        }

    # ------------------------------------------------------------------
    # Order submission
    # ------------------------------------------------------------------

    async def create_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        quantity: float,
        *,
        price: float | None = None,
        stop_price: float | None = None,
        reason: str | None = None,
        db=None,
    ) -> dict[str, Any]:
        """Create a new paper order.  Returns the order dict (with id)."""
        side_enum = OrderSide(side.lower())
        type_enum = OrderType(order_type.lower())

        symbol = symbol.upper()

        # --- Validation ---
        if quantity <= 0:
            return {"error": "quantity_must_be_positive"}

        if type_enum == OrderType.MARKET:
            pass  # no price needed
        elif type_enum == OrderType.LIMIT:
            if price is None or price <= 0:
                return {"error": "limit_price_required"}
        elif type_enum == OrderType.STOP:
            if stop_price is None or stop_price <= 0:
                return {"error": "stop_price_required"}
        elif type_enum == OrderType.STOP_LIMIT:
            if stop_price is None or stop_price <= 0:
                return {"error": "stop_price_required"}
            if price is None or price <= 0:
                return {"error": "limit_price_required"}

        # Check buying power for market / stop orders (immediate / soon)
        if type_enum in (OrderType.MARKET, OrderType.STOP):
            cost = price or self.orderbook.mid_price(symbol) or 0
            if side_enum == OrderSide.BUY and cost * quantity > self._balance:
                return {"error": "insufficient_balance"}

        now_ms = int(time.time() * 1000)
        order = PaperOrder(
            id=self._next_order_id,
            symbol=symbol,
            side=side_enum,
            order_type=type_enum,
            price=price,
            stop_price=stop_price,
            quantity=quantity,
            created_at=now_ms,
            reason=reason,
        )
        self._next_order_id += 1

        # Market orders execute immediately
        if type_enum == OrderType.MARKET:
            return await self._execute_market(order)

        # For limit/stop, store and check current price
        self._orders[order.id] = order
        await self._check_triggers(symbol)

        order_dict = self._order_to_dict(order)
        await self._emit("order_created", order_dict)

        # Persist to DB
        if db:
            await self._save_order_to_db(db, order)

        return order_dict

    async def cancel_order(self, order_id: int, db=None) -> dict[str, Any] | None:
        """Cancel an open order.  Returns cancelled order or None."""
        order = self._orders.get(order_id)
        if not order or order.status not in (OrderStatus.OPEN, OrderStatus.PARTIAL):
            return None
        order.status = OrderStatus.CANCELLED
        order_dict = self._order_to_dict(order)

        if db:
            await db.execute(
                "UPDATE paper_orders SET status = 'cancelled' WHERE id = ?",
                (order_id,),
            )
            await db.commit()

        await self._emit("order_cancelled", order_dict)
        return order_dict

    # ------------------------------------------------------------------
    # Position management
    # ------------------------------------------------------------------

    async def close_position(
        self,
        position_id: int,
        *,
        exit_price: float | None = None,
        reason: str | None = None,
        db=None,
        balance_adjusted: bool = False,
    ) -> dict[str, Any] | None:
        """Close an open position at *exit_price* (or current market price).

        When *balance_adjusted* is True (position closed by an opposite order),
        the order execution already credited / debited the balance, so we skip
        the balance adjustment here to avoid double-counting.
        """
        pos = self._positions.get(position_id)
        if not pos or pos.status != "open":
            return None

        symbol = pos.symbol
        price = exit_price or self.orderbook.mid_price(symbol) or pos.entry_price

        # Compute P&L
        is_long = pos.side == PositionSide.LONG
        pnl = (
            (price - pos.entry_price) * pos.quantity
            if is_long
            else (pos.entry_price - price) * pos.quantity
        )
        pnl_pct = (
            (price - pos.entry_price) / pos.entry_price * 100
            if is_long
            else (pos.entry_price - price) / pos.entry_price * 100
        )

        # Record closed trade
        closed = PaperClosedTrade(
            id=pos.id,
            symbol=pos.symbol,
            side=pos.side,
            entry_price=pos.entry_price,
            exit_price=price,
            quantity=pos.quantity,
            pnl=round(pnl, 2),
            pnl_pct=round(pnl_pct, 2),
            entry_reason=pos.reason,
            exit_reason=reason,
            opened_at=pos.opened_at,
            closed_at=int(time.time() * 1000),
        )
        self._closed_trades.append(closed)
        self._closed_trades = self._closed_trades[-500:]  # keep last 500

        # Update account (skip if the closing order already adjusted balance)
        if not balance_adjusted:
            if is_long:
                return_value = pos.entry_price * pos.quantity + pnl  # = exit_price * qty
            else:
                return_value = -pos.entry_price * pos.quantity + pnl  # = -exit_price * qty
            self._balance += return_value
        self._total_pnl += pnl
        self._total_trades += 1
        if pnl > 0:
            self._wins += 1
        else:
            self._losses += 1

        # Mark position closed
        pos.status = "closed"
        pos.closed_at = int(time.time() * 1000)
        pos.pnl = round(pnl, 2)
        pos.pnl_pct = round(pnl_pct, 2)

        # Cancel any remaining orders for this position
        for o in list(self._orders.values()):
            if o.position_id == position_id and o.status == OrderStatus.OPEN:
                o.status = OrderStatus.CANCELLED

        # Persist
        if db:
            await db.execute(
                "UPDATE paper_positions SET status='closed', pnl=?, pnl_pct=?, "
                "closed_at=? WHERE id=?",
                (pos.pnl, pos.pnl_pct, pos.closed_at, position_id),
            )
            await db.execute(
                "INSERT INTO paper_closed_trades "
                "(symbol,side,entry_price,exit_price,quantity,pnl,pnl_pct,entry_reason,exit_reason,opened_at,closed_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (closed.symbol, closed.side.value, closed.entry_price, closed.exit_price,
                 closed.quantity, closed.pnl, closed.pnl_pct,
                 closed.entry_reason, closed.exit_reason, closed.opened_at, closed.closed_at),
            )
            await db.commit()

        await self._emit("position_closed", self._pos_to_dict(pos, price))

        return self._pos_to_dict(pos, price)

    def mark_prices(self, symbol: str, price: float) -> None:
        """Mark positions for *symbol* to *price* (updates unrealised P&L)."""
        self.orderbook.update_last_price(symbol, price)
        for pos in self._positions.values():
            if pos.symbol == symbol and pos.status == "open":
                self._update_position_pnl(pos, price)

    # ------------------------------------------------------------------
    # Price/quote driven order checking
    # ------------------------------------------------------------------

    async def on_price(
        self,
        symbol: str,
        price: float,
        *,
        bid: float | None = None,
        ask: float | None = None,
        db=None,
    ) -> None:
        """Called whenever a new price is available (candle close, quote, tick).

        Uses the persistent ``self._db`` connection for auto-persistence when
        *db* is not explicitly provided (price-driven fills).
        """
        persist = db or self._db
        symbol = symbol.upper()
        self.mark_prices(symbol, price)

        # Check SL/TP for positions on this symbol
        for pos in list(self._positions.values()):
            if pos.symbol != symbol or pos.status != "open":
                continue
            if self._should_trigger_sl_tp(pos, price):
                await self.close_position(pos.id, exit_price=price,
                                          reason=self._trigger_reason(pos, price),
                                          db=persist, balance_adjusted=False)

        # Check pending orders
        if bid is not None and ask is not None:
            self.orderbook.update_depth(symbol, [[bid, 1_000]], [[ask, 1_000]])

        await self._check_triggers(symbol, db=persist)

    # ------------------------------------------------------------------
    # Internal execution
    # ------------------------------------------------------------------

    def _compute_fee(self, notional: float, is_taker: bool) -> float:
        """Compute fee for a trade of *notional* value.

        *is_taker* should be True for market / stop orders, False for limit fills.
        Returns the fee amount (always non-negative).
        """
        if self._fee_model == "none":
            return 0.0
        rate_bps = self._taker_fee_bps if is_taker else self._maker_fee_bps
        return round(notional * rate_bps / 10000, 2)

    async def _execute_market(self, order: PaperOrder, db=None) -> dict[str, Any]:
        """Execute a market order immediately."""
        persist = db or self._db
        fill = self.orderbook.simulate_fill(
            order.symbol,
            order.side.value,
            order.quantity,
            slippage_bps=self._slippage_bps,
        )

        if fill.get("error") or fill["filled_qty"] <= 0:
            order.status = OrderStatus.REJECTED
            await self._emit("order_rejected", self._order_to_dict(order))
            return {"error": fill.get("error", "fill_failed")}

        order.filled_price = fill["filled_price"]
        order.filled_quantity = fill["filled_qty"]
        order.status = OrderStatus.FILLED if fill["fully_filled"] else OrderStatus.PARTIAL
        order.filled_at = int(time.time() * 1000)
        order.slippage = fill["slippage_bps"]

        cost = order.filled_price * order.filled_quantity
        fee = self._compute_fee(cost, is_taker=True)

        # Guard: balance should never go negative for buy orders
        if order.side == OrderSide.BUY and (cost + fee) > self._balance + 1e-8:
            order.status = OrderStatus.REJECTED
            logger.warning(
                "market_order_insufficient_balance",
                order_id=order.id, symbol=order.symbol,
                cost=cost + fee, balance=self._balance,
            )
            await self._emit("order_rejected", self._order_to_dict(order))
            return {"error": "insufficient_balance"}

        self._total_fees_paid += fee
        if order.side == OrderSide.BUY:
            self._balance -= (cost + fee)
        else:
            self._balance += (cost - fee)

        # Create or increase position
        pos = await self._apply_fill_to_position(order, db=db)

        order.position_id = pos.id if pos else None
        self._orders[order.id] = order

        # Persist order
        if persist:
            await self._save_order_to_db(persist, order)

        result = self._order_to_dict(order)
        result["fee"] = fee
        result["position"] = self._pos_to_dict(pos, order.filled_price) if pos else None
        await self._emit("order_filled", result)
        return result

    async def _check_triggers(self, symbol: str, db=None) -> None:
        """Check limit and stop orders for *symbol*."""
        price = self.orderbook.mid_price(symbol)
        if price is None:
            # Fallback: use last known price from positions
            for pos in self._positions.values():
                if pos.symbol == symbol and pos.status == "open":
                    price = pos.entry_price
                    break
        if price is None:
            return

        for order in list(self._orders.values()):
            if order.symbol != symbol:
                continue
            if order.status not in (OrderStatus.OPEN, OrderStatus.PARTIAL):
                continue

            # --- Limit order ---
            if order.order_type == OrderType.LIMIT:
                if order.price is None:
                    continue
                triggered = (
                    (order.side == OrderSide.BUY and price <= order.price)
                    or (order.side == OrderSide.SELL and price >= order.price)
                )
                if triggered:
                    await self._fill_limit_order(order, db=db)
                    break  # one order per tick — next tick will handle more

            # --- Stop order (becomes market) ---
            elif order.order_type == OrderType.STOP:
                if order.stop_price is None:
                    continue
                triggered = (
                    (order.side == OrderSide.BUY and price >= order.stop_price)
                    or (order.side == OrderSide.SELL and price <= order.stop_price)
                )
                if triggered:
                    order.order_type = OrderType.MARKET  # convert to market
                    order.price = None
                    await self._execute_market(order, db=db)
                    break  # one order per tick

            # --- Stop-limit order ---
            elif order.order_type == OrderType.STOP_LIMIT:
                if order.stop_price is None or order.price is None:
                    continue
                triggered = (
                    (order.side == OrderSide.BUY and price >= order.stop_price)
                    or (order.side == OrderSide.SELL and price <= order.stop_price)
                )
                if triggered:
                    order.order_type = OrderType.LIMIT  # convert to limit
                    order.stop_price = None
                    # Check if limit can fill immediately
                    await self._check_triggers(symbol, db=db)
                    break

    async def _fill_limit_order(self, order: PaperOrder, db=None) -> None:
        """Fill a limit order at its limit price (or better)."""
        persist = db or self._db
        # Guard: skip if no longer open
        if order.status not in (OrderStatus.OPEN, OrderStatus.PARTIAL):
            return
        if order.price is None:
            return

        # Limit orders fill at the limit price or better
        fill_qty = order.quantity - order.filled_quantity

        # Use order book to see if volume is available, but cap at limit price
        fill = self.orderbook.simulate_fill(
            order.symbol,
            order.side.value,
            fill_qty,
            limit_price=order.price,
        )

        if fill.get("error") or fill["filled_qty"] <= 0:
            return

        # Use the limit price (better for the orderer) or the VWAP
        actual_fill_price = fill["filled_price"]
        if order.side == OrderSide.BUY:
            actual_fill_price = min(actual_fill_price, order.price)
        else:
            actual_fill_price = max(actual_fill_price, order.price)

        # Check buying power before filling
        fill_cost = actual_fill_price * fill["filled_qty"]
        if order.side == OrderSide.BUY and fill_cost > self._balance + 1e-8:
            logger.warning("limit_fill_insufficient_balance", order_id=order.id,
                           symbol=order.symbol, cost=fill_cost, balance=self._balance)
            return

        order.filled_price = actual_fill_price
        fill_delta = fill["filled_qty"]
        order.filled_quantity += fill_delta
        order.filled_at = int(time.time() * 1000)
        order.slippage = fill["slippage_bps"]

        if order.filled_quantity >= order.quantity - 1e-8:
            order.status = OrderStatus.FILLED
        else:
            order.status = OrderStatus.PARTIAL

        # Deduct cost + maker fee
        fee = self._compute_fee(fill_cost, is_taker=False)
        self._total_fees_paid += fee
        if order.side == OrderSide.BUY:
            self._balance -= (fill_cost + fee)
        else:
            self._balance += (fill_cost - fee)

        # Apply to position using only the current fill delta, not accumulated filled_quantity
        pos = await self._apply_fill_to_position(order, db=db, fill_qty=fill_delta)
        order.position_id = pos.id if pos else None

        if persist:
            await self._save_order_to_db(persist, order)

        result = self._order_to_dict(order)
        result["fee"] = fee
        result["position"] = self._pos_to_dict(pos, actual_fill_price) if pos else None
        await self._emit("order_filled", result)

    async def _apply_fill_to_position(self, order: PaperOrder, db=None, fill_qty: float | None = None) -> PaperPosition | None:
        """Add a filled order to an existing position (same direction) or close / flip.

        Parameters
        ----------
        fill_qty : float | None
            When provided (partial/staged fills), use this as the fill amount
            instead of ``order.filled_quantity`` (which accumulates across calls).
        """
        qty = fill_qty if fill_qty is not None else order.filled_quantity
        pos_side = PositionSide.LONG if order.side == OrderSide.BUY else PositionSide.SHORT
        existing = None

        # Find open position in the same symbol
        for p in self._positions.values():
            if p.symbol == order.symbol and p.status == "open":
                existing = p
                break

        if existing is None:
            # Create new position
            pos = PaperPosition(
                id=self._next_pos_id,
                symbol=order.symbol,
                side=pos_side,
                entry_price=order.filled_price or 0,
                quantity=qty,
                opened_at=int(time.time() * 1000),
            )
            self._next_pos_id += 1
            self._positions[pos.id] = pos

            if db:
                await db.execute(
                    "INSERT INTO paper_positions (symbol, side, entry_price, quantity, opened_at) "
                    "VALUES (?,?,?,?,?)",
                    (pos.symbol, pos.side.value, pos.entry_price, pos.quantity, pos.opened_at),
                )
                await db.commit()

            await self._emit("position_opened", self._pos_to_dict(pos, pos.entry_price))
            return pos

        # Same direction → increase position (weighted average entry)
        if existing.side == pos_side:
            total_qty = existing.quantity + qty
            existing.entry_price = (
                (existing.entry_price * existing.quantity + (order.filled_price or 0) * qty)
                / total_qty
            )
            existing.quantity = total_qty

            if db:
                await db.execute(
                    "UPDATE paper_positions SET entry_price=?, quantity=? WHERE id=?",
                    (existing.entry_price, existing.quantity, existing.id),
                )
                await db.commit()
            return existing

        # Opposite direction → reduce position, close, or flip
        remaining = qty
        reduce_qty = min(remaining, existing.quantity)
        # Save original quantity before reducing — close_position needs it for P&L calc
        original_qty = existing.quantity
        existing.quantity -= reduce_qty
        remaining -= reduce_qty

        if existing.quantity <= 1e-8:
            # Restore quantity so close_position calculates correct P&L
            existing.quantity = original_qty
            await self.close_position(existing.id, exit_price=order.filled_price,
                                      reason="closed_by_opposite_order", db=db,
                                      balance_adjusted=True)
            existing = None

        if remaining > 1e-8 and existing is None:
            # Flip: leftover becomes new opposite position
            pos = PaperPosition(
                id=self._next_pos_id,
                symbol=order.symbol,
                side=pos_side,
                entry_price=order.filled_price or 0,
                quantity=remaining,
                opened_at=int(time.time() * 1000),
            )
            self._next_pos_id += 1
            self._positions[pos.id] = pos

            if db:
                await db.execute(
                    "INSERT INTO paper_positions (symbol, side, entry_price, quantity, opened_at) "
                    "VALUES (?,?,?,?,?)",
                    (pos.symbol, pos.side.value, pos.entry_price, pos.quantity, pos.opened_at),
                )
                await db.commit()

            await self._emit("position_opened", self._pos_to_dict(pos, pos.entry_price))
            return pos

        if existing and existing.quantity > 0:
            if db:
                await db.execute(
                    "UPDATE paper_positions SET quantity=? WHERE id=?",
                    (existing.quantity, existing.id),
                )
                await db.commit()

        return existing

    # ------------------------------------------------------------------
    # SL / TP logic
    # ------------------------------------------------------------------

    def _should_trigger_sl_tp(self, pos: PaperPosition, price: float) -> bool:
        if pos.stop_loss is not None:
            if pos.side == PositionSide.LONG and price <= pos.stop_loss:
                return True
            if pos.side == PositionSide.SHORT and price >= pos.stop_loss:
                return True
        if pos.take_profit is not None:
            if pos.side == PositionSide.LONG and price >= pos.take_profit:
                return True
            if pos.side == PositionSide.SHORT and price <= pos.take_profit:
                return True
        return False

    def _trigger_reason(self, pos: PaperPosition, price: float) -> str:
        if pos.stop_loss is not None:
            if (pos.side == PositionSide.LONG and price <= pos.stop_loss) or \
               (pos.side == PositionSide.SHORT and price >= pos.stop_loss):
                return "stop_loss"
        return "take_profit"

    # ------------------------------------------------------------------
    # Mark-to-market
    # ------------------------------------------------------------------

    def _mark_to_market(self, pos: PaperPosition) -> float:
        price = self.orderbook.mid_price(pos.symbol) or pos.entry_price
        if pos.side == PositionSide.LONG:
            return (price - pos.entry_price) * pos.quantity
        return (pos.entry_price - price) * pos.quantity

    def _update_position_pnl(self, pos: PaperPosition, price: float) -> None:
        if pos.side == PositionSide.LONG:
            pos.pnl = round((price - pos.entry_price) * pos.quantity, 2)
        else:
            pos.pnl = round((pos.entry_price - price) * pos.quantity, 2)
        pos.pnl_pct = round(
            (price - pos.entry_price) / pos.entry_price * 100
            * (1 if pos.side == PositionSide.LONG else -1),
            2,
        )

    # ------------------------------------------------------------------
    # Serialisation helpers
    # ------------------------------------------------------------------

    def _order_to_dict(self, o: PaperOrder) -> dict[str, Any]:
        return {
            "id": o.id,
            "position_id": o.position_id,
            "symbol": o.symbol,
            "side": o.side.value,
            "order_type": o.order_type.value,
            "price": o.price,
            "stop_price": o.stop_price,
            "quantity": o.quantity,
            "filled_price": o.filled_price,
            "filled_quantity": o.filled_quantity,
            "status": o.status.value,
            "slippage": o.slippage,
            "reason": o.reason,
            "created_at": o.created_at,
            "filled_at": o.filled_at,
        }

    def _pos_to_dict(self, p: PaperPosition, current_price: float | None = None) -> dict[str, Any]:
        price = current_price or self.orderbook.mid_price(p.symbol) or p.entry_price
        self._update_position_pnl(p, price)
        return {
            "id": p.id,
            "symbol": p.symbol,
            "side": p.side.value,
            "entry_price": p.entry_price,
            "quantity": p.quantity,
            "stop_loss": p.stop_loss,
            "take_profit": p.take_profit,
            "pnl": p.pnl,
            "pnl_pct": p.pnl_pct,
            "status": p.status,
            "current_price": price,
            "opened_at": p.opened_at,
            "closed_at": p.closed_at,
        }

    # ------------------------------------------------------------------
    # DB persistence helpers
    # ------------------------------------------------------------------

    async def _save_order_to_db(self, db, order: PaperOrder) -> None:
        await db.execute(
            "INSERT INTO paper_orders "
            "(position_id, symbol, side, order_type, price, stop_price, quantity, "
            "filled_price, filled_quantity, status, slippage, reason, created_at, filled_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                order.position_id, order.symbol, order.side.value, order.order_type.value,
                order.price, order.stop_price, order.quantity,
                order.filled_price, order.filled_quantity, order.status.value,
                order.slippage, order.reason, order.created_at, order.filled_at,
            ),
        )
        await db.commit()

    async def _save_settings_to_db(self, db) -> None:
        """Persist current settings to the paper_accounts row."""
        await db.execute(
            "UPDATE paper_accounts SET "
            "initial_balance=?, slippage_bps=?, fee_model=?, "
            "taker_fee_bps=?, maker_fee_bps=?, total_fees_paid=? "
            "WHERE id=1",
            (
                self._initial_balance, self._slippage_bps,
                self._fee_model, self._taker_fee_bps,
                self._maker_fee_bps, self._total_fees_paid,
            ),
        )
        await db.commit()

    async def _load_settings_from_db(self, db) -> None:
        """Load settings from the paper_accounts row."""
        cursor = await db.execute(
            "SELECT slippage_bps, fee_model, taker_fee_bps, maker_fee_bps, total_fees_paid "
            "FROM paper_accounts WHERE id=1"
        )
        row = await cursor.fetchone()
        if row:
            self._slippage_bps = row["slippage_bps"] or DEFAULT_SLIPPAGE_BPS
            self._fee_model = row["fee_model"] or DEFAULT_FEE_MODEL
            self._taker_fee_bps = row["taker_fee_bps"] or DEFAULT_TAKER_FEE_BPS
            self._maker_fee_bps = row["maker_fee_bps"] or DEFAULT_MAKER_FEE_BPS
            self._total_fees_paid = row["total_fees_paid"] or 0.0

    # ------------------------------------------------------------------
    # Event emission
    # ------------------------------------------------------------------

    async def _emit(self, event_type: str, data: dict[str, Any]) -> None:
        if self._on_event:
            try:
                await self._on_event({"type": f"paper_{event_type}", "data": data})
            except Exception as exc:
                logger.warning("paper_event_handler_error", event=event_type, error=str(exc))

    # ------------------------------------------------------------------
    # Update position (SL/TP)
    # ------------------------------------------------------------------

    async def update_position(
        self,
        position_id: int,
        *,
        stop_loss: float | None = None,
        take_profit: float | None = None,
        db=None,
    ) -> dict[str, Any] | None:
        """Set stop-loss and/or take-profit on an open position."""
        pos = self._positions.get(position_id)
        if not pos or pos.status != "open":
            return None

        persist = db or self._db

        if stop_loss is not None:
            pos.stop_loss = stop_loss
        if take_profit is not None:
            pos.take_profit = take_profit

        if persist:
            updates = []
            vals = []
            if stop_loss is not None:
                updates.append("stop_loss = ?")
                vals.append(stop_loss)
            if take_profit is not None:
                updates.append("take_profit = ?")
                vals.append(take_profit)
            if updates:
                vals.append(position_id)
                await persist.execute(
                    f"UPDATE paper_positions SET {', '.join(updates)} WHERE id=?",
                    vals,
                )
                await persist.commit()

        result = self._pos_to_dict(pos)
        await self._emit("position_updated", result)
        return result

    # ------------------------------------------------------------------
    # Reset
    # ------------------------------------------------------------------

    async def update_settings(
        self,
        *,
        initial_balance: float | None = None,
        slippage_bps: float | None = None,
        fee_model: str | None = None,
        taker_fee_bps: float | None = None,
        maker_fee_bps: float | None = None,
        db=None,
    ) -> dict[str, Any]:
        """Update paper trading settings.

        When *initial_balance* is changed, the change only takes effect for
        new accounts -- existing balance is *not* overwritten unless the
        account has never traded (total_trades == 0).
        """
        persist = db or self._db

        if initial_balance is not None and initial_balance > 0:
            old_initial = self._initial_balance
            self._initial_balance = initial_balance
            # Only reset balance if no trades have been made
            if self._total_trades == 0:
                self._balance = initial_balance

        if slippage_bps is not None and slippage_bps >= 0:
            self._slippage_bps = slippage_bps
        if fee_model is not None and fee_model in ("none", "exchange"):
            self._fee_model = fee_model
        if taker_fee_bps is not None and taker_fee_bps >= 0:
            self._taker_fee_bps = taker_fee_bps
        if maker_fee_bps is not None and maker_fee_bps >= 0:
            self._maker_fee_bps = maker_fee_bps

        # Persist to DB
        if persist:
            await self._save_settings_to_db(persist)

        settings = self.settings
        await self._emit("settings_updated", settings)
        return settings

    async def reset(self, db=None) -> None:
        self._balance = self._initial_balance
        self._total_fees_paid = 0.0
        self._positions.clear()
        self._orders.clear()
        self._closed_trades.clear()
        self._next_pos_id = 1
        self._next_order_id = 1
        self._total_trades = 0
        self._wins = 0
        self._losses = 0
        self._total_pnl = 0.0

        if db:
            await db.execute("DELETE FROM paper_orders")
            await db.execute("DELETE FROM paper_positions")
            await db.execute("DELETE FROM paper_closed_trades")
            await db.execute(
                "UPDATE paper_accounts SET balance=?, total_pnl=0, total_trades=0, "
                "wins=0, losses=0, total_fees_paid=0 WHERE id=1",
                (self._initial_balance,),
            )
            await db.commit()

        await self._emit("reset", self.stats)

    # ------------------------------------------------------------------
    # Snapshot for REST
    # ------------------------------------------------------------------

    def get_position(self, position_id: int) -> PaperPosition | None:
        """Get an open position by id. Returns None if not found or closed."""
        pos = self._positions.get(position_id)
        if pos and pos.status == "open":
            return pos
        return None

    def snapshot(self) -> dict[str, Any]:
        return {
            **self.stats,
            "settings": self.settings,
            "positions": [self._pos_to_dict(p) for p in self.open_positions],
            "orders": [self._order_to_dict(o) for o in self.open_orders],
            "closed_trades": [
                {
                    "id": t.id,
                    "symbol": t.symbol,
                    "side": t.side.value,
                    "entry_price": t.entry_price,
                    "exit_price": t.exit_price,
                    "quantity": t.quantity,
                    "pnl": t.pnl,
                    "pnl_pct": t.pnl_pct,
                    "entry_reason": t.entry_reason,
                    "exit_reason": t.exit_reason,
                    "opened_at": t.opened_at,
                    "closed_at": t.closed_at,
                }
                for t in self._closed_trades[-200:]
            ],
        }

    # ------------------------------------------------------------------
    # Load persisted data on startup
    # ------------------------------------------------------------------

    async def load_from_db(self, db) -> None:
        """Restore engine state from the database on startup."""
        # Account
        cursor = await db.execute("SELECT * FROM paper_accounts WHERE id = 1")
        row = await cursor.fetchone()
        if row:
            self._balance = row["balance"]
            self._initial_balance = row["initial_balance"]
            self._total_pnl = row["total_pnl"]
            self._total_trades = row["total_trades"]
            self._wins = row["wins"]
            self._losses = row["losses"]
            # Existing account — load settings from it
            await self._load_settings_from_db(db)
        else:
            await db.execute(
                "INSERT INTO paper_accounts (balance, initial_balance, slippage_bps, fee_model, taker_fee_bps, maker_fee_bps) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (self._initial_balance, self._initial_balance,
                 self._slippage_bps, self._fee_model,
                 self._taker_fee_bps, self._maker_fee_bps),
            )
            await db.commit()

        # Open positions
        cursor = await db.execute(
            "SELECT * FROM paper_positions WHERE status = 'open'"
        )
        for row in await cursor.fetchall():
            pos = PaperPosition(
                id=row["id"], symbol=row["symbol"],
                side=PositionSide(row["side"]),
                entry_price=row["entry_price"], quantity=row["quantity"],
                stop_loss=row["stop_loss"], take_profit=row["take_profit"],
                pnl=row["pnl"], pnl_pct=row["pnl_pct"],
                status=row["status"],
                opened_at=int(datetime.fromisoformat(row["opened_at"]).timestamp() * 1000)
                if row["opened_at"] else 0,
            )
            self._positions[pos.id] = pos
            if pos.id >= self._next_pos_id:
                self._next_pos_id = pos.id + 1

        # Open orders
        cursor = await db.execute(
            "SELECT * FROM paper_orders WHERE status IN ('open', 'partial') ORDER BY created_at"
        )
        for row in await cursor.fetchall():
            order = PaperOrder(
                id=row["id"], position_id=row["position_id"],
                symbol=row["symbol"], side=OrderSide(row["side"]),
                order_type=OrderType(row["order_type"]),
                price=row["price"], stop_price=row["stop_price"],
                quantity=row["quantity"],
                filled_price=row["filled_price"],
                filled_quantity=row["filled_quantity"],
                status=OrderStatus(row["status"]),
                slippage=row["slippage"], reason=row["reason"],
                created_at=row["created_at"] or 0,
                filled_at=row["filled_at"],
            )
            self._orders[order.id] = order
            if order.id >= self._next_order_id:
                self._next_order_id = order.id + 1

        # Closed trades (last 200)
        cursor = await db.execute(
            "SELECT * FROM paper_closed_trades ORDER BY closed_at DESC LIMIT 200"
        )
        for row in await cursor.fetchall():
            trade = PaperClosedTrade(
                id=row["id"], symbol=row["symbol"],
                side=PositionSide(row["side"]),
                entry_price=row["entry_price"], exit_price=row["exit_price"],
                quantity=row["quantity"],
                pnl=row["pnl"], pnl_pct=row["pnl_pct"],
                entry_reason=row["entry_reason"], exit_reason=row["exit_reason"],
                opened_at=row["opened_at"] or 0,
                closed_at=row["closed_at"] or 0,
            )
            self._closed_trades.append(trade)

        logger.info(
            "paper_trading_loaded",
            balance=self._balance,
            positions=len(self._positions),
            orders=len(self._orders),
            trades=len(self._closed_trades),
        )
