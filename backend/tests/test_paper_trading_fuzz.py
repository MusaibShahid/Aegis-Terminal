"""
Property-based fuzz tests for PaperTradingEngine + OrderBookSimulator.

Uses Hypothesis to generate random book states, order parameters, and
action sequences, then validates key invariants:

- Balance never goes negative (within floating-point tolerance)
- Equity is a finite, reasonable value
- Limit prices are respected (fills don't exceed limit)
- Filled quantities never exceed requested quantities
- Position quantities are consistent
- VWAP stays within the range of level prices consumed
- Order status transitions are valid
- Closed-trade P&L is consistent with entry/exit prices
- Total P&L equals sum of closed trade P&Ls

These tests are designed to discover edge cases that structured
test scenarios might miss.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from hypothesis import given, settings, strategies as st
from hypothesis.strategies import composite

from execution.orderbook import OrderBookSimulator
from execution.paper_trading import (
    PaperTradingEngine,
    OrderSide,
    OrderType,
    OrderStatus,
)

# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Price tolerance for floating-point assertions
TOLERANCE = 1e-8


@composite
def st_book_state(draw, max_levels: int = 6) -> dict[str, Any]:
    """Generate a random book state with bids, asks, and a last price.

    Bids are below *last_price*, asks above, each with random offsets
    and volumes.  Either side may be empty.
    """
    last_price = draw(st.floats(min_value=10.0, max_value=500.0, allow_nan=False))
    max_offset = last_price * 0.25  # 25 % max offset

    # Bids: 0–6 levels below last_price
    n_bids = draw(st.integers(min_value=0, max_value=max_levels))
    bids: list[list[float]] = []
    for _ in range(n_bids):
        offset = draw(st.floats(min_value=0.01, max_value=max_offset, allow_nan=False))
        vol = draw(st.floats(min_value=1.0, max_value=5000.0, allow_nan=False))
        price = last_price - offset
        if price > 0.0:
            bids.append([price, vol])

    # Asks: 0–6 levels above last_price
    n_asks = draw(st.integers(min_value=0, max_value=max_levels))
    asks: list[list[float]] = []
    for _ in range(n_asks):
        offset = draw(st.floats(min_value=0.01, max_value=max_offset, allow_nan=False))
        vol = draw(st.floats(min_value=1.0, max_value=5000.0, allow_nan=False))
        price = last_price + offset
        asks.append([price, vol])

    # Sort: bids descending, asks ascending
    bids.sort(key=lambda x: -x[0])
    asks.sort(key=lambda x: x[0])

    return {"last_price": last_price, "bids": bids, "asks": asks}


@composite
def st_market_order(draw) -> dict[str, Any]:
    """Generate a random market order parameter set."""
    side = draw(st.sampled_from(["buy", "sell"]))
    qty = draw(st.floats(min_value=1.0, max_value=5000.0, allow_nan=False))
    return {"side": side, "order_type": "market", "quantity": qty,
            "price": None, "stop_price": None}


@composite
def st_limit_order(draw) -> dict[str, Any]:
    """Generate a random limit order parameter set."""
    side = draw(st.sampled_from(["buy", "sell"]))
    qty = draw(st.floats(min_value=1.0, max_value=5000.0, allow_nan=False))
    price = draw(st.floats(min_value=0.5, max_value=500.0, allow_nan=False))
    return {"side": side, "order_type": "limit", "quantity": qty,
            "price": price, "stop_price": None}


def _build_engine(
    book: dict[str, Any],
    balance: float = 1_000_000.0,
    slippage_bps: float = 0.0,
    fee_model: str = "exchange",
) -> PaperTradingEngine:
    """Create a fresh engine seeded with *book* state."""
    e = PaperTradingEngine(
        initial_balance=balance,
        slippage_bps=slippage_bps,
        fee_model=fee_model,
    )
    e.orderbook.update_last_price("FUZZ", book["last_price"])
    if book["bids"] or book["asks"]:
        e.orderbook.update_depth("FUZZ", book["bids"], book["asks"])
    return e


# ================================================================
# Invariant checks
# ================================================================


async def _check_post_order_invariants(
    e: PaperTradingEngine,
    result: dict[str, Any],
    order_params: dict[str, Any],
    book: dict[str, Any],
) -> list[str]:
    """Validate invariants after a single order execution.

    Returns a list of violation messages (empty = all passed).
    """
    violations: list[str] = []

    # 1. Balance never negative
    if e.balance < -TOLERANCE:
        violations.append(f"balance={e.balance} is negative")

    # 2. Equity is a reasonable value (not NaN, not pathologically negative)
    eq = e.equity
    if math.isnan(eq) or math.isinf(eq):
        violations.append(f"equity={eq} is NaN or inf")
    if eq < -1_000_000_000:
        violations.append(f"equity={eq} is pathologically negative")

    # 3. If order was accepted (no error key), check fill invariants
    if "error" not in result:
        filled_qty = result.get("filled_quantity", 0)
        filled_price = result.get("filled_price", 0)
        status = result.get("status", "")

        # Filled qty <= requested qty
        if filled_qty > order_params["quantity"] + TOLERANCE:
            violations.append(
                f"filled_qty={filled_qty} > requested_qty={order_params['quantity']}"
            )

        # Filled qty >= 0
        if filled_qty < -TOLERANCE:
            violations.append(f"filled_qty={filled_qty} is negative")

        # For filled/partial orders, filled_price should be > 0
        if status in ("filled", "partial") and filled_price <= 0:
            violations.append(f"filled_price={filled_price} <= 0 for {status} order")

        # 4. Limit price check (for limit orders)
        if order_params["order_type"] == "limit" and order_params["price"] is not None:
            lim = order_params["price"]
            if status in ("filled", "partial") and filled_qty > 0:
                if order_params["side"] == "buy" and filled_price > lim + TOLERANCE:
                    violations.append(
                        f"buy limit filled_price={filled_price} > limit={lim}"
                    )
                if order_params["side"] == "sell" and filled_price + TOLERANCE < lim:
                    violations.append(
                        f"sell limit filled_price={filled_price} < limit={lim}"
                    )

    # 5. Position invariants
    for pos in e.open_positions:
        if pos.quantity < -TOLERANCE:
            violations.append(f"position {pos.id} has negative qty={pos.quantity}")
        if pos.entry_price <= 0 and pos.quantity > 0:
            violations.append(f"position {pos.id} has zero entry_price with positive qty")

    # 6. Closed trade PnL consistency
    for t in e.closed_trades:
        if t.side.value == "long":
            expected_pnl = (t.exit_price - t.entry_price) * t.quantity
        else:
            expected_pnl = (t.entry_price - t.exit_price) * t.quantity
        # PnL is rounded to 2 decimal places by the engine
        if t.pnl != 0 and abs(t.pnl - round(expected_pnl, 2)) > 0.02:
            violations.append(
                f"closed trade {t.id} pnl={t.pnl} != expected={round(expected_pnl, 2)}"
            )

    # 7. Total PnL consistency (with rounding tolerance)
    total_closed_pnl = sum(t.pnl for t in e.closed_trades)
    if abs(e.stats["total_pnl"] - total_closed_pnl) > 0.02:
        violations.append(
            f"stats.total_pnl={e.stats['total_pnl']} != sum(closed_pnl)={total_closed_pnl}"
        )

    # 8. Stats: wins + losses <= total_trades
    if e.stats["wins"] + e.stats["losses"] > e.stats["total_trades"]:
        violations.append(
            f"wins({e.stats['wins']})+losses({e.stats['losses']}) > total_trades({e.stats['total_trades']})"
        )

    return violations


# ================================================================
# Fuzz test: random market orders against random books
# ================================================================


class TestFuzzMarketOrders:
    """Fuzz market orders against random book states."""

    @given(book=st_book_state(max_levels=5), order=st_market_order())
    @settings(max_examples=200, stateful_step_count=10)
    @pytest.mark.asyncio
    async def test_market_fill_invariants(
        self, book: dict[str, Any], order: dict[str, Any]
    ) -> None:
        """Market orders: balance, equity, fill invariants."""
        e = _build_engine(book, balance=10_000_000.0)
        result = await e.create_order("FUZZ", order["side"], "market", order["quantity"])
        violations = await _check_post_order_invariants(e, result, order, book)
        assert not violations, "; ".join(violations)

    @given(book=st_book_state(max_levels=5), order=st_market_order())
    @settings(max_examples=100, stateful_step_count=10)
    @pytest.mark.asyncio
    async def test_market_fill_quantity_behavior(
        self, book: dict[str, Any], order: dict[str, Any]
    ) -> None:
        """Market fills consume up to book+liquidity, never exceed requested."""
        e = _build_engine(book, balance=10_000_000.0, slippage_bps=0.0)
        result = await e.create_order("FUZZ", order["side"], "market", order["quantity"])

        if "error" in result:
            return  # rejected (e.g. insufficient balance) — nothing to check

        filled_qty = result["filled_quantity"]
        # Every filled unit must have a price > 0
        if filled_qty > 0:
            assert result["filled_price"] > 0, "filled_price must be > 0 when qty > 0"

        # VWAP should be between cheapest and most expensive level consumed
        # (only checkable when fills come from the book, not fallback)
        levels = book["asks"] if order["side"] == "buy" else book["bids"]
        total_book_vol = sum(v for _, v in levels)
        if filled_qty > 0 and total_book_vol >= filled_qty:
            min_price = min(p for p, _ in levels)
            max_price = max(p for p, _ in levels)
            vwap = result["filled_price"]
            assert min_price - 0.01 <= vwap <= max_price + 0.01, (
                f"VWAP {vwap} outside level range [{min_price}, {max_price}]"
            )


# ================================================================
# Fuzz test: random limit orders against random books
# ================================================================


class TestFuzzLimitOrders:
    """Fuzz limit orders against random book states."""

    @given(book=st_book_state(max_levels=5), order=st_limit_order())
    @settings(max_examples=200, stateful_step_count=10)
    @pytest.mark.asyncio
    async def test_limit_fill_invariants(
        self, book: dict[str, Any], order: dict[str, Any]
    ) -> None:
        """Limit orders: limit price respected, fill invariants."""
        e = _build_engine(book, balance=10_000_000.0)
        result = await e.create_order(
            "FUZZ", order["side"], "limit", order["quantity"],
            price=order["price"],
        )
        violations = await _check_post_order_invariants(e, result, order, book)
        assert not violations, "; ".join(violations)

    @given(book=st_book_state(max_levels=5), order=st_limit_order())
    @settings(max_examples=100, stateful_step_count=10)
    @pytest.mark.asyncio
    async def test_limit_fill_price_bound(
        self, book: dict[str, Any], order: dict[str, Any]
    ) -> None:
        """Limit buy never fills above limit; limit sell never below."""
        e = _build_engine(book, balance=10_000_000.0)
        result = await e.create_order(
            "FUZZ", order["side"], "limit", order["quantity"],
            price=order["price"],
        )

        if "error" in result:
            return

        filled_qty = result.get("filled_quantity", 0)
        filled_price = result.get("filled_price", 0)
        lim = order["price"]

        # If filled, check price bound
        if filled_qty > 0:
            if order["side"] == "buy":
                assert filled_price <= lim + TOLERANCE, (
                    f"buy limit filled at {filled_price} above limit {lim}"
                )
            else:
                assert filled_price + TOLERANCE >= lim, (
                    f"sell limit filled at {filled_price} below limit {lim}"
                )

        # If not filled (open order), verify it could not fill from book
        if result.get("status") == "open" and book["asks"]:
            if order["side"] == "buy":
                cheapest_ask = book["asks"][0][0]
                assert lim < cheapest_ask, (
                    f"limit buy at {lim} should fill when cheapest ask={cheapest_ask}"
                )

    @given(book=st_book_state(max_levels=5))
    @settings(max_examples=100, stateful_step_count=10)
    @pytest.mark.asyncio
    async def test_limit_order_never_exceeds_balance(
        self, book: dict[str, Any]
    ) -> None:
        """Limit buy beyond balance is either rejected or skipped on fill."""
        import random

        e = _build_engine(book, balance=1000.0)  # tiny balance
        # Try various limit prices — expensive ones should be rejected or safe
        for lim_price in [50.0, 100.0, 200.0, 500.0]:
            side = "buy"
            result = await e.create_order(
                "FUZZ", side, "limit", 100.0, price=lim_price,
            )
            if "error" not in result:
                # Order was accepted — balance should not go negative
                assert e.balance >= -0.01, f"balance={e.balance} went negative"
                break  # only need one accepted


# ================================================================
# Fuzz test: random stop orders against random books
# ================================================================


class TestFuzzStopOrders:
    """Fuzz stop orders against random book states."""

    @given(
        book=st_book_state(max_levels=5),
        side=st.sampled_from(["buy", "sell"]),
        qty=st.floats(min_value=1.0, max_value=2000.0, allow_nan=False),
        stop_price=st.floats(min_value=1.0, max_value=500.0, allow_nan=False),
    )
    @settings(max_examples=200, stateful_step_count=10)
    @pytest.mark.asyncio
    async def test_stop_order_invariants(
        self, book: dict[str, Any], side: str, qty: float, stop_price: float
    ) -> None:
        """Stop orders: trigger logic, market conversion, invariants."""
        e = _build_engine(book, balance=1_000_000.0)
        order_params = {"side": side, "order_type": "stop", "quantity": qty,
                        "price": None, "stop_price": stop_price}

        result = await e.create_order(
            "FUZZ", side, "stop", qty, stop_price=stop_price,
        )
        violations = await _check_post_order_invariants(e, result, order_params, book)
        assert not violations, "; ".join(violations)

        trigger_price = e.orderbook.mid_price("FUZZ")
        if trigger_price is not None:
            # If stop would trigger immediately (mid >= stop for buy, mid <= stop for sell),
            # the order should not be open — it should have filled or been rejected
            if result.get("status") == "open":
                if side == "buy":
                    assert trigger_price < stop_price, (
                        f"stop buy open but trigger_price={trigger_price} >= stop={stop_price}"
                    )
                else:
                    assert trigger_price > stop_price, (
                        f"stop sell open but trigger_price={trigger_price} <= stop={stop_price}"
                    )


# ================================================================
# Fuzz test: random action sequences
# ================================================================


class TestFuzzActionSequences:
    """Fuzz multi-step action sequences against invariants."""

    @given(
        book=st_book_state(max_levels=4),
        n_orders=st.integers(min_value=1, max_value=8),
    )
    @settings(max_examples=100, stateful_step_count=10)
    @pytest.mark.asyncio
    async def test_multi_order_sequence_invariants(
        self, book: dict[str, Any], n_orders: int
    ) -> None:
        """Random sequence of market + limit orders maintains invariants."""
        import random
        random.seed(42)

        e = _build_engine(book, balance=10_000_000.0)
        sides = ["buy", "sell"]
        types = ["market", "limit"]

        # Track all order results for later validation
        all_results: list[dict[str, Any]] = []
        all_params: list[dict[str, Any]] = []

        for i in range(n_orders):
            side = random.choice(sides)
            otype = random.choice(types)
            qty = random.uniform(1.0, 3000.0)
            price = random.uniform(1.0, 500.0) if otype == "limit" else None

            params = {"side": side, "order_type": otype, "quantity": qty,
                      "price": price, "stop_price": None}

            result = await e.create_order(
                "FUZZ", side, otype, qty,
                price=price if otype == "limit" else None,
            )

            violations = await _check_post_order_invariants(e, result, params, book)
            assert not violations, (
                f"Step {i}: {side} {otype} qty={qty} price={price}: "
                f"{'; '.join(violations)}"
            )

            all_results.append(result)
            all_params.append(params)

        # Final invariants after all orders
        assert e.balance >= -0.01, f"final balance={e.balance} is negative"
        assert e.stats["total_trades"] >= 0
        assert e.stats["wins"] >= 0
        assert e.stats["losses"] >= 0

        # If we have closed trades, verify win count + loss count <= total trades
        if e.stats["total_trades"] > 0:
            assert e.stats["wins"] + e.stats["losses"] <= e.stats["total_trades"], (
                f"wins+losses > total_trades"
            )

    @given(
        book=st_book_state(max_levels=3),
        side=st.sampled_from(["buy", "sell"]),
        entry_qty=st.floats(min_value=10.0, max_value=2000.0, allow_nan=False),
        exit_qty=st.floats(min_value=10.0, max_value=2000.0, allow_nan=False),
    )
    @settings(max_examples=100, stateful_step_count=10)
    @pytest.mark.asyncio
    async def test_position_entry_exit_round_trip(
        self, book: dict[str, Any], side: str,
        entry_qty: float, exit_qty: float,
    ) -> None:
        """Enter a position then exit — invariants hold after both steps."""
        # Skip if book has no depth on the relevant side
        if side == "buy" and not book["asks"]:
            return
        if side == "sell" and not book["bids"]:
            return

        e = _build_engine(book, balance=10_000_000.0)
        opposite = "sell" if side == "buy" else "buy"

        # Enter
        r1 = await e.create_order("FUZZ", side, "market", entry_qty)
        if "error" in r1:
            return  # rejected at entry — nothing more to test

        assert e.balance >= -0.01, f"balance={e.balance} negative after entry"

        # Exit (may partially close, fully close, or flip)
        r2 = await e.create_order("FUZZ", opposite, "market", exit_qty)
        if "error" not in r2:
            assert e.balance >= -0.01, f"balance={e.balance} negative after exit"

        # Verify position quantity is consistent
        for pos in e.open_positions:
            assert pos.quantity > 0, f"open position {pos.id} has qty={pos.quantity}"

        # If we have exactly one closed trade, verify its PnL is sensible
        if len(e.closed_trades) == 1:
            t = e.closed_trades[0]
            assert isinstance(t.pnl, float)
            # PnL magnitude should not exceed ~entry_price * qty * 2 (failsafe bound)
            max_reasonable_pnl = abs(t.entry_price * t.quantity * 2)
            assert abs(t.pnl) <= max_reasonable_pnl + 100, (
                f"unreasonable PnL {t.pnl} for entry={t.entry_price} qty={t.quantity}"
            )


# ================================================================
# Fuzz test: book-level invariants
# ================================================================


class TestFuzzBookInvariants:
    """Fuzz the order book simulator directly."""

    @given(
        bids=st.lists(
            st.lists(
                st.floats(min_value=0.01, max_value=1000.0, allow_nan=False),
                min_size=2, max_size=2,
            ),
            min_size=0, max_size=8,
        ),
        asks=st.lists(
            st.lists(
                st.floats(min_value=0.01, max_value=1000.0, allow_nan=False),
                min_size=2, max_size=2,
            ),
            min_size=0, max_size=8,
        ),
        qty=st.floats(min_value=1.0, max_value=10000.0, allow_nan=False),
    )
    @settings(max_examples=200, stateful_step_count=10)
    @pytest.mark.asyncio
    async def test_simulate_fill_invariants(
        self,
        bids: list[list[float]],
        asks: list[list[float]],
        qty: float,
    ) -> None:
        """simulate_fill invariants: VWAP in range, qty bounds, fallback."""
        ob = OrderBookSimulator(max_levels=20)
        ob.update_last_price("FUZZ", 100.0)
        ob.update_depth("FUZZ", bids, asks)

        for side in ("buy", "sell"):
            fill = ob.simulate_fill("FUZZ", side, qty, slippage_bps=0.0)

            if fill.get("error"):
                continue

            assert fill["filled_qty"] >= 0
            assert fill["filled_qty"] <= qty + TOLERANCE
            assert fill["slippage_bps"] >= 0

            if fill["filled_qty"] > 0:
                assert fill["filled_price"] > 0

            # With slippage=0, fallback uses last_price=100
            if fill["liquidity"] == "estimated" and fill["filled_qty"] > 0:
                expected_price = 100.0 * (1.01 if side == "buy" else 0.99)
                # With slippage=0, it's exactly 100.0
                assert abs(fill["filled_price"] - 100.0) < 0.01, (
                    f"fallback price {fill['filled_price']} != 100"
                )

    @given(
        bids=st.lists(
            st.lists(
                st.floats(min_value=0.01, max_value=1000.0, allow_nan=False),
                min_size=2, max_size=2,
            ),
            min_size=0, max_size=6,
        ),
        asks=st.lists(
            st.lists(
                st.floats(min_value=0.01, max_value=1000.0, allow_nan=False),
                min_size=2, max_size=6,
            ),
            min_size=0, max_size=6,
        ),
    )
    @settings(max_examples=100, stateful_step_count=10)
    @pytest.mark.asyncio
    async def test_book_sorting_invariant(
        self,
        bids: list[list[float]],
        asks: list[list[float]],
    ) -> None:
        """update_depth sorts bids descending, asks ascending; filters zero-volume."""
        ob = OrderBookSimulator(max_levels=20)
        ob.update_depth("FUZZ", bids, asks)

        stored_bids = ob._bids.get("FUZZ", [])
        stored_asks = ob._asks.get("FUZZ", [])

        # Bids sorted descending
        for i in range(len(stored_bids) - 1):
            assert stored_bids[i][0] >= stored_bids[i + 1][0], (
                f"bids not sorted descending: {stored_bids}"
            )

        # Asks sorted ascending
        for i in range(len(stored_asks) - 1):
            assert stored_asks[i][0] <= stored_asks[i + 1][0], (
                f"asks not sorted ascending: {stored_asks}"
            )

        # No zero volume entries
        for level in stored_bids:
            assert level[1] > 0, f"zero-volume bid entry: price={level[0]}"
        for level in stored_asks:
            assert level[1] > 0, f"zero-volume ask entry: price={level[0]}"

        # Bids and asks from book should be within max_levels
        assert len(stored_bids) <= 20
        assert len(stored_asks) <= 20


# ================================================================
# Fuzz test: combined price + depth sequences with orders
# ================================================================


class TestFuzzPriceDepthIntegration:
    """Fuzz on_price + update_depth interleaved with orders."""

    @given(
        initial_book=st_book_state(max_levels=3),
        n_steps=st.integers(min_value=1, max_value=6),
    )
    @settings(max_examples=100, stateful_step_count=10)
    @pytest.mark.asyncio
    async def test_price_depth_sequence_invariants(
        self, initial_book: dict[str, Any], n_steps: int
    ) -> None:
        """Interleave on_price and update_depth with orders — invariants hold."""
        import random
        random.seed(123)

        e = _build_engine(initial_book, balance=10_000_000.0)
        last_price = initial_book["last_price"]

        for step in range(n_steps):
            # 50 % chance: push a price update
            if random.random() < 0.5:
                new_price = last_price * (1 + random.uniform(-0.05, 0.05))
                new_price = max(new_price, 0.1)
                last_price = new_price
                bid = new_price * 0.995
                ask = new_price * 1.005
                await e.on_price("FUZZ", new_price, bid=bid, ask=ask)

            # 50 % chance: refresh depth
            if random.random() < 0.5:
                n_levels = random.randint(1, 4)
                spread = random.uniform(0.5, 5.0)
                step_size = random.uniform(0.1, 1.0)
                bids = [[last_price - spread - i * step_size,
                         random.uniform(10, 5000)] for i in range(n_levels)]
                asks = [[last_price + spread + i * step_size,
                         random.uniform(10, 5000)] for i in range(n_levels)]
                # Filter negative prices
                bids = [[p, v] for p, v in bids if p > 0]
                asks = [[p, v] for p, v in asks if p > 0]
                if bids and asks:
                    e.orderbook.update_depth("FUZZ", bids, asks)

            # 40 % chance: place a market order
            if random.random() < 0.4:
                side = random.choice(["buy", "sell"])
                qty = random.uniform(1.0, 2000.0)
                result = await e.create_order("FUZZ", side, "market", qty)

                # Check invariants
                if "error" not in result:
                    assert result["filled_quantity"] >= 0
                    assert result["filled_quantity"] <= qty + TOLERANCE
                    if result["filled_quantity"] > 0:
                        assert result["filled_price"] > 0

                assert e.balance >= -0.01, f"step {step}: balance={e.balance} negative"

        # Final invariant: all positions have positive quantity
        for pos in e.open_positions:
            assert pos.quantity > 0, f"open position {pos.id} zero qty"
