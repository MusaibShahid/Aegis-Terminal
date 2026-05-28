"""
Integration tests for PaperTradingEngine + OrderBookSimulator.

These tests exercise end-to-end scenarios where the engine interacts with a
populated order book — deep books, dynamic depth changes, stop/limit fills
that walk multiple levels, position flips through book liquidity, spread
cost on round-trips, and event emission during book-walking fills.

Unlike unit tests in ``test_paper_trading.py`` (which use fallback last-price
fills), these tests always seed the order book with depth data so that fills
walk bid/ask levels.
"""

from __future__ import annotations

import pytest

from tests.conftest import BP_BALANCE as BP
from tests.conftest import captured_events, levels as _levels
from execution.orderbook import OrderBookSimulator
from execution.paper_trading import PaperTradingEngine


def _engine_with_book(
    last_price: float = 100.0,
    bids: list[list[float]] | None = None,
    asks: list[list[float]] | None = None,
    balance: float = 1_000_000.0,
    slippage_bps: float = 0.0,
    fee_model: str = "exchange",
) -> PaperTradingEngine:
    """Create an engine with a seeded order book and last price."""
    e = PaperTradingEngine(
        initial_balance=balance,
        slippage_bps=slippage_bps,
        fee_model=fee_model,
    )
    e.orderbook.update_last_price("TEST", last_price)
    if bids:
        e.orderbook.update_depth("TEST", bids, asks or [])
    return e


# ================================================================
# Market order × book integration
# ================================================================


class TestMarketBookIntegration:
    """Market fills that walk through multiple book levels."""

    @pytest.mark.asyncio
    async def test_market_buy_walks_5_ask_levels(self) -> None:
        """Market buy consumes 5 ask levels; VWAP matches walked levels."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 100, 102.0, 100, 103.0, 100, 104.0, 100, 105.0, 100),
        )
        # Total ask volume = 500
        r = await e.create_order("TEST", "buy", "market", 450)
        assert r["status"] == "filled"
        # VWAP through all 5 levels
        expected_vwap = (100 * 101 + 100 * 102 + 100 * 103 + 100 * 104 + 50 * 105) / 450
        assert abs(r["filled_price"] - expected_vwap) < 0.01
        assert r["filled_quantity"] == 450

        # Position should show the VWAP as entry price
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].entry_price - expected_vwap) < 0.01
        assert abs(e.open_positions[0].quantity - 450) < 0.001

    @pytest.mark.asyncio
    async def test_market_sell_walks_5_bid_levels(self) -> None:
        """Market sell consumes 5 bid levels."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 100, 98.0, 100, 97.0, 100, 96.0, 100, 95.0, 100),
            asks=_levels(101.0, 500),
        )
        r = await e.create_order("TEST", "sell", "market", 350)
        assert r["status"] == "filled"
        expected_vwap = (100 * 99 + 100 * 98 + 100 * 97 + 50 * 96) / 350
        assert abs(r["filled_price"] - expected_vwap) < 0.01

        # Short position opens
        assert len(e.open_positions) == 1
        assert e.open_positions[0].side.value == "short"
        assert abs(e.open_positions[0].entry_price - expected_vwap) < 0.01

    @pytest.mark.asyncio
    async def test_multiple_consecutive_buys_deplete_book(self) -> None:
        """Consecutive buys deplete ask levels, then fall back to last-price."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 50, 102.0, 50),  # only 100 total liquidity
            balance=200_000.0,
        )
        # First buy: 60 units — consumes 50 @ 101 + 10 @ 102
        r1 = await e.create_order("TEST", "buy", "market", 60)
        assert r1["status"] == "filled"
        vwap1 = (50 * 101.0 + 10 * 102.0) / 60
        assert abs(r1["filled_price"] - vwap1) < 0.01
        assert r1["filled_quantity"] == 60

        # Second buy: 60 units — remaining asks 40 @ 102, then 20 fallback @ 100.0
        # (book was replenished by update_last_price during first fill? No — the book
        #  still has the same levels but with reduced available volume... wait, the
        #  book doesn't decrement filled volume — simulate_fill is stateless, it
        #  walks the same levels each call.)
        # After first call, the book still has 50 @ 101 + 50 @ 102. Second call
        # walks the same levels: 50 @ 101 + 10 @ 102. Then remaining 0 since
        # 60 <= 100 total.
        r2 = await e.create_order("TEST", "buy", "market", 60)
        assert r2["status"] == "filled"
        assert abs(r2["filled_price"] - vwap1) < 0.01
        assert r2["filled_quantity"] == 60

        # Now simulate real depletion by updating depth with reduced levels
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 10),  # only 10 left
        )
        r3 = await e.create_order("TEST", "buy", "market", 50)
        assert r3["status"] == "filled"
        assert r3["filled_quantity"] == 50  # 10 @ 101 + 40 fallback @ 100.0
        vwap3 = (10 * 101.0 + 40 * 100.0) / 50
        assert abs(r3["filled_price"] - vwap3) < 0.01

    @pytest.mark.asyncio
    async def test_slippage_affects_fallback_but_not_book_walk(self) -> None:
        """Slippage bps impacts the fallback price but not the book walk VWAP."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 30),  # only 30 via book
            slippage_bps=10.0,  # 0.1 % slippage
        )
        r = await e.create_order("TEST", "buy", "market", 100)
        assert r["status"] == "filled"
        # 30 @ 101.0, 70 fallback @ 100.0 * (1 + 10/10000) = 100.10
        vwap = (30 * 101.0 + 70 * 100.10) / 100
        assert abs(r["filled_price"] - vwap) < 0.01


# ================================================================
# Limit order × book integration
# ================================================================


class TestLimitBookIntegration:
    """Limit fills that interact with order book depth."""

    @pytest.mark.asyncio
    async def test_limit_buy_triggers_from_book_level(self) -> None:
        """Limit buy at 102 fills completely from ask levels within limit."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 100, 102.0, 100, 103.0, 100),
        )

        # Place limit buy at 102 — fills 100 @ 101 + 50 @ 102 = 150
        r = await e.create_order("TEST", "buy", "limit", 150, price=102.0)
        assert r["status"] == "filled"
        assert r["filled_quantity"] == 150
        expected_vwap = (100 * 101.0 + 50 * 102.0) / 150
        assert abs(r["filled_price"] - expected_vwap) < 0.01

        # Position opened with 150 shares
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 150) < 0.001

    @pytest.mark.asyncio
    async def test_limit_sell_triggers_from_book_level(self) -> None:
        """Limit sell at 98 fills from a 98 bid level when price crosses."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 100, 98.0, 100, 97.0, 100),
            asks=_levels(101.0, 500),
        )
        # Need a LONG position first
        await e.create_order("TEST", "buy", "market", 300)
        assert abs(e.open_positions[0].quantity - 300) < 0.001

        # Place sell limit at 98 for 200 shares
        r = await e.create_order("TEST", "sell", "limit", 200, price=98.0)
        # Walks bids: 100 @ 99 + 100 @ 98 = 200
        assert r["status"] == "filled"
        expected_vwap = (100 * 99.0 + 100 * 98.0) / 200
        assert abs(r["filled_price"] - expected_vwap) < 0.01

        # Position reduced from 300 to 100
        assert abs(e.open_positions[0].quantity - 100) < 0.001

    @pytest.mark.asyncio
    async def test_limit_buy_partial_from_book_then_more_depth(self) -> None:
        """Limit buy partially fills; depth refresh adds volume, remaining fills."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(102.0, 50),  # only 50 at limit or below
        )

        # Limit buy 200 at 102 — fills 50
        r = await e.create_order("TEST", "buy", "limit", 200, price=102.0)
        assert r["status"] == "partial"
        assert r["filled_quantity"] == 50
        assert abs(e.open_positions[0].quantity - 50) < 0.001

        # Depth refreshes with more volume at 102
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(99.0, 500),
            asks=_levels(102.0, 200),  # now 200 available
        )
        # Trigger check — same price, remaining 150 should fill
        # The current price won't change because mid_price stays the same
        # (99+102)/2 = 100.5. The limit is still at 102, and the book has more.
        await e.on_price("TEST", 102.0)
        assert abs(e.open_positions[0].quantity - 200) < 0.001

    @pytest.mark.asyncio
    async def test_limit_buy_skips_fill_when_book_above_limit(self) -> None:
        """Limit buy at 100 stays open when cheapest ask is 101."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 100),
        )

        r = await e.create_order("TEST", "buy", "limit", 100, price=100.0)
        assert r["status"] == "open"
        assert len(e.open_positions) == 0

        # Even on_price at 100 shouldn't fill because mid_price is still
        # (99+101)/2 = 100, and the check is price <= order.price (100 <= 100).
        # mid_price WILL be 100.0. The limit trigger check:
        #   price <= order.price → 100.0 <= 100.0 → True
        # BUT simulate_fill with limit_price=100.0 walks asks [[101.0, 100]]:
        #   101.0 > 100.0 → break → filled_qty=0
        # So the order will be checked, but fill will return 0 qty, so nothing happens.
        await e.on_price("TEST", 100.0)
        assert len(e.open_positions) == 0  # still not filled

        # Bring 100.0 into the ask level
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(99.0, 500),
            asks=_levels(100.0, 100),
        )
        await e.on_price("TEST", 100.0)
        assert len(e.open_positions) == 1  # now fills

    @pytest.mark.asyncio
    async def test_limit_fill_honors_limit_price_not_better(self) -> None:
        """Limit buy VWAP is capped at limit price, not below book VWAP."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 100, 102.0, 50),  # VWAP would be (100*101+50*102)/150
        )

        # Limit buy at 101.50 for 150
        r = await e.create_order("TEST", "buy", "limit", 150, price=101.50)
        # Book walk: 100 @ 101 (101 <= 101.50 ✓), then 50 @ 102 (102 > 101.50!) → break
        # So only 100 fill
        assert r["status"] == "partial"
        assert r["filled_quantity"] == 100
        assert r["filled_price"] == 101.0
        assert abs(e.open_positions[0].quantity - 100) < 0.001


# ================================================================
# Stop order × book integration
# ================================================================


class TestStopBookIntegration:
    """Stop orders that trigger and then fill through the order book."""

    @pytest.mark.asyncio
    async def test_stop_buy_walks_deep_book(self) -> None:
        """Stop triggers as market, then walks 10 ask levels for fill."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(
                *sum(([101.0 + i * 0.5, 100] for i in range(10)), [])
            ),  # 10 levels: 101.0 -> 105.5
        )

        # Stop buy at 110 (above current mid ~100.5, so won't trigger yet)
        r = await e.create_order("TEST", "buy", "stop", 500, stop_price=110.0)
        assert r["status"] == "open"

        # Trigger by moving mid above 110
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(110.0, 500),
            asks=_levels(111.0, 100, 111.5, 100, 112.0, 100, 112.5, 100, 113.0, 100),
        )
        await e.on_price("TEST", 110.0)

        # Stop triggered → market order → walks asks
        assert len(e.open_positions) == 1
        # VWAP through book: 5 levels * 100 each = 500
        expected_vwap = (100 * 111.0 + 100 * 111.5 + 100 * 112.0 + 100 * 112.5 + 100 * 113.0) / 500
        assert abs(e.open_positions[0].entry_price - expected_vwap) < 0.01
        assert abs(e.open_positions[0].quantity - 500) < 0.001

    @pytest.mark.asyncio
    async def test_stop_sell_walks_deep_book(self) -> None:
        """Sell stop (position protection) walks bid levels after trigger."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(98.0, 100, 97.5, 100, 97.0, 100, 96.5, 100, 96.0, 100),
            asks=_levels(101.0, 500),
            balance=50_000.0,
        )
        # Enter long 300 @ ~100
        await e.create_order("TEST", "buy", "market", 300)
        bal_after_buy = e.balance

        # Stop sell at 97 — mid is (98+101)/2 = 99.5, 97 < 99.5, won't trigger
        r = await e.create_order("TEST", "sell", "stop", 300, stop_price=97.0)
        assert r["status"] == "open"

        # Trigger: drop mid below 97
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(96.0, 100, 95.5, 100, 95.0, 100),
            asks=_levels(97.0, 500),
        )
        await e.on_price("TEST", 96.0)

        # Position closed (stop triggered, filled via market)
        assert len(e.open_positions) == 0
        assert len(e.closed_trades) == 1

    @pytest.mark.asyncio
    async def test_stop_buy_triggers_from_mid_price_change(self) -> None:
        """Stop triggers when mid price crosses stop level via depth refresh."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(100.0, 500),
            asks=_levels(102.0, 500),  # mid = 101
        )

        # Stop buy at 101 — mid is 101, price >= 101, so it triggers immediately!
        # Use 102 to avoid immediate trigger
        r = await e.create_order("TEST", "buy", "stop", 200, stop_price=102.0)
        assert r["status"] == "open"

        # Mid price moves up by depth change: new asks start at 103
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(102.0, 500),  # mid = (102+103)/2 = 102.5
            asks=_levels(103.0, 200),
        )
        await e.on_price("TEST", 102.5)
        # Mid = (102+103)/2 = 102.5 >= 102 → triggers
        assert len(e.open_positions) == 1
        # Fills at 103 (only ask level)
        assert abs(e.open_positions[0].entry_price - 103.0) < 0.01

    @pytest.mark.asyncio
    async def test_stop_limit_triggers_and_fills_from_book(self) -> None:
        """Stop-limit: triggers at stop, fills as limit at book level."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(102.0, 100, 103.0, 100),  # asks at 102, 103
        )

        # Stop-limit buy: stop=105, limit=102
        r = await e.create_order(
            "TEST", "buy", "stop_limit", 150,
            stop_price=105.0, price=102.0,
        )
        assert r["status"] == "open"

        # Trigger: move mid above 105
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(105.0, 500),
            asks=_levels(106.0, 500),
        )
        await e.on_price("TEST", 105.0)

        # Now it's a limit order at 102. Mid is (105+106)/2 = 105.5.
        # BUY limit trigger: price (mid) <= limit (102)? 105.5 <= 102? NO.
        # So it stays open as limit.
        assert len(e.open_positions) == 0

        # Mid drops to 102: update depth
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(101.0, 500),
            asks=_levels(102.0, 100, 103.0, 100),
        )
        await e.on_price("TEST", 102.0)
        # Now mid = (101+102)/2 = 101.5 <= 102, limit triggers
        # Walks asks: 100 @ 102 (within limit), then 102 > 102? no... actually
        # with price-based fill, it fills what it can within limit price.
        # simulate_fill with limit_price=102.0: walk asks [[102, 100], [103, 100]]
        # 102 <= 102 ✓, fill 100. Then 103 > 102 → break.
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 100) < 0.001
        assert abs(e.open_positions[0].entry_price - 102.0) < 0.01


# ================================================================
# Position management × book integration
# ================================================================


class TestPositionBookIntegration:
    """Position entry/exit and flips that walk the order book."""

    @pytest.mark.asyncio
    async def test_enter_and_exit_walk_book_both_sides(self) -> None:
        """Enter via buy (walks asks), exit via sell (walks bids)."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 200, 98.0, 200),
            asks=_levels(101.0, 200, 102.0, 200),
        )

        # Enter long 300 — walks 2 ask levels
        r1 = await e.create_order("TEST", "buy", "market", 300)
        entry_vwap = (200 * 101.0 + 100 * 102.0) / 300
        assert abs(r1["filled_price"] - entry_vwap) < 0.01

        # Exit 300 — walks 2 bid levels
        r2 = await e.create_order("TEST", "sell", "market", 300)
        exit_vwap = (200 * 99.0 + 100 * 98.0) / 300

        assert len(e.open_positions) == 0
        t = e.closed_trades[0]
        # PnL = (exit_price - entry_price) * qty
        expected_pnl = (exit_vwap - entry_vwap) * 300
        assert abs(t.pnl - expected_pnl) < 0.5  # small rounding

    @pytest.mark.asyncio
    async def test_position_flip_through_book(self) -> None:
        """Flip: close long through bid levels, open short at different price."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 100, 98.0, 100, 97.0, 100),
            asks=_levels(101.0, 100, 102.0, 100, 103.0, 100),
            balance=200_000.0,
        )

        # Enter long 150
        await e.create_order("TEST", "buy", "market", 150)

        # Flip to short: sell 250 (close 150 long, open 100 short)
        r = await e.create_order("TEST", "sell", "market", 250)
        # The sell walks bids: 100 @ 99, 100 @ 98, 50 @ 97 = 250
        expected_sell_vwap = (100 * 99.0 + 100 * 98.0 + 50 * 97.0) / 250
        assert abs(r["filled_price"] - expected_sell_vwap) < 0.01

        # Position should be short 100
        assert len(e.open_positions) == 1
        p = e.open_positions[0]
        assert p.side.value == "short"
        assert abs(p.quantity - 100) < 0.001

        # Closed trade: long 150 closed
        assert len(e.closed_trades) == 1

    @pytest.mark.asyncio
    async def test_spread_cost_round_trip(self) -> None:
        """Enter and exit at same last_price, but spread means loss from crossing it."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 500),
            fee_model="none",  # isolate spread cost
        )

        # Enter long 100 at 101.0 (top ask)
        r1 = await e.create_order("TEST", "buy", "market", 100)
        assert abs(r1["filled_price"] - 101.0) < 0.01

        bal_after_buy = e.balance

        # Exit at 99.0 (top bid) — same last_price but crossed spread
        r2 = await e.create_order("TEST", "sell", "market", 100)
        assert abs(r2["filled_price"] - 99.0) < 0.01

        # PnL should be negative due to spread: (99 - 101) * 100 = -200
        t = e.closed_trades[0]
        assert abs(t.pnl - (-200.0)) < 1.0
        assert len(e.open_positions) == 0

    @pytest.mark.asyncio
    async def test_position_reduce_from_book_partial(self) -> None:
        """Reduce a large position by selling into limited bid depth."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 50, 98.0, 50),  # only 100 total bid liquidity
            asks=_levels(101.0, 500),
            balance=200_000.0,
        )

        # Enter long 500
        await e.create_order("TEST", "buy", "market", 500)

        # Sell 120 — only 100 available in book, 20 falls back
        r = await e.create_order("TEST", "sell", "market", 120)
        assert r["filled_quantity"] == 120  # 100 book + 20 fallback
        vwap = (50 * 99.0 + 50 * 98.0 + 20 * 100.0) / 120
        assert abs(r["filled_price"] - vwap) < 0.01

        # Position reduced from 500 to 380
        assert abs(e.open_positions[0].quantity - 380) < 0.001


# ================================================================
# Dynamic book changes (changing depth between ticks)
# ================================================================


class TestDynamicBookIntegration:
    """Depth changes between price updates affect subsequent order fills."""

    @pytest.mark.asyncio
    async def test_depth_refresh_between_staged_limit_fills(self) -> None:
        """Book changes between staged limit fills — new depth at different price."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 50),  # only 50
        )

        # Limit buy 200 at 102 — fills 50
        await e.create_order("TEST", "buy", "limit", 200, price=102.0)
        assert abs(e.open_positions[0].quantity - 50) < 0.001

        # Book refreshes: now 102.0 is the ask (better than 101)
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(99.0, 500),
            asks=_levels(100.0, 100),  # better price! Should fill immediately
        )
        await e.on_price("TEST", 102.0)
        # Mid = (99+100)/2 = 99.5 <= 102, triggers. Walks asks: 100 @ 100.0
        # remaining 150? No — 50 already filled, remaining = 150.
        # But only 100 available. Partial fill.
        assert abs(e.open_positions[0].quantity - 150) < 0.001

        # More depth at 102
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(99.0, 500),
            asks=_levels(102.0, 100),
        )
        await e.on_price("TEST", 102.0)
        # Mid = (99+102)/2 = 100.5 <= 102. Walks asks: 50 @ 102.
        assert abs(e.open_positions[0].quantity - 200) < 0.001

    @pytest.mark.asyncio
    async def test_stop_triggers_after_book_moves(self) -> None:
        """Stop doesn't trigger initially, then triggers after depth changes."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(100.0, 500),
            asks=_levels(102.0, 500),  # mid = 101
        )

        # Stop buy at 105 — mid=101, 101 < 105, won't trigger
        await e.create_order("TEST", "buy", "stop", 100, stop_price=105.0)
        assert len(e.open_orders) == 1

        # Depth shifts up
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(106.0, 500),
            asks=_levels(108.0, 200),  # mid = 107, >= 105 → triggers
        )
        await e.on_price("TEST", 106.0)
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 100) < 0.001

    @pytest.mark.asyncio
    async def test_competing_limit_and_stop_with_book_movement(self) -> None:
        """Limit buy below and stop buy above — book moves through both."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 500),  # mid = 100
            balance=200_000.0,
        )

        # Limit buy at 100 (matches bid level so it can fill when mid drops)
        r1 = await e.create_order("TEST", "buy", "limit", 50, price=100.0)
        assert r1["status"] == "open"

        # Stop buy at 101
        r2 = await e.create_order("TEST", "buy", "stop", 50, stop_price=101.0)
        assert r2["status"] == "open"

        # Book tightens — mid moves from 100 to 99.5
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(99.0, 500),
            asks=_levels(100.0, 500),  # mid = 99.5, <= 100? Yes! Limit triggers!
        )
        await e.on_price("TEST", 99.5)
        # mid = 99.5. Limit: 99.5 <= 100? ✓ → fills 50 from ask @ 100
        # Stop: 99.5 >= 101? No.
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 50) < 0.001
        assert len(e.open_orders) == 1  # stop still open

        # Book rises — mid = 102
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(101.5, 500),
            asks=_levels(102.5, 500),  # mid = 102, >= 101 → stop triggers
        )
        await e.on_price("TEST", 102.0)
        # mid = 102. Stop: 102 >= 101 ✓ → triggers
        # Stop fills at ask 102.5
        assert abs(e.open_positions[0].quantity - 100) < 0.001  # 50 + 50
        assert len(e.open_orders) == 0

    @pytest.mark.asyncio
    async def test_book_change_does_not_affect_filled_orders(self) -> None:
        """After a market fill, changing book doesn't revert or modify filled state."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 100),
        )

        r = await e.create_order("TEST", "buy", "market", 100)
        assert r["status"] == "filled"
        assert abs(e.open_positions[0].quantity - 100) < 0.001

        # Drastic book change
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(1.0, 500),
            asks=_levels(1_000.0, 500),
        )
        # Position should still be 100
        assert abs(e.open_positions[0].quantity - 100) < 0.001
        assert e.open_positions[0].side.value == "long"

        # Stats unchanged (total_trades only counts closed positions)
        assert e.stats["total_trades"] == 0

    @pytest.mark.asyncio
    async def test_multiple_stops_trigger_as_book_crosses_levels(self) -> None:
        """Book moves through multiple stop levels, triggering one per tick."""
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(100.0, 500),
            asks=_levels(102.0, 500),  # mid = 101
            balance=200_000.0,
        )

        # Two stop buys at different levels
        await e.create_order("TEST", "buy", "stop", 50, stop_price=103.0)
        await e.create_order("TEST", "buy", "stop", 50, stop_price=105.0)
        assert len(e.open_orders) == 2

        # Book shifts up: mid = 104 (triggers first stop at 103)
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(103.0, 500),
            asks=_levels(105.0, 100),
        )
        await e.on_price("TEST", 103.0)
        # mid = (103+105)/2 = 104. 104 >= 103 → triggers stop 1
        # 104 >= 105? No → stop 2 stays open
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 50) < 0.001

        # Book shifts up more: mid = 106 (triggers second stop at 105)
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(105.0, 500),
            asks=_levels(107.0, 100),
        )
        await e.on_price("TEST", 105.0)
        # mid = (105+107)/2 = 106. 106 >= 103 ✓ but stop already filled
        # 106 >= 105 ✓ → triggers stop 2
        assert abs(e.open_positions[0].quantity - 100) < 0.001
        assert len(e.open_orders) == 0


# ================================================================
# Integration benchmark (engine + book)
# ================================================================


class TestIntegrationBenchmark:
    """Benchmark PaperTradingEngine + OrderBookSimulator together.

    These tests measure end-to-end performance of the full engine
    pipeline — ``create_order`` → ``_execute_market`` → ``simulate_fill``
    → position management — with deep books, concurrent orders, and
    rapid depth changes.

    Time budgets are generous to avoid flakiness across CI machines
    while still catching performance regressions.
    """

    _TIME_PER_CALL = 5e-6  # 5 µs baseline per lightweight op
    _WIDE_BUDGET = 0.5     # 500 ms ceiling for any single benchmark

    @staticmethod
    def _deep_engine(
        n_levels: int = 200,
        spread: float = 2.0,
        step: float = 0.5,
        base_vol: float = 100.0,
        balance: float = 10_000_000.0,
    ) -> PaperTradingEngine:
        """Build an engine seeded with *n_levels* of depth on each side.

        Uses a custom :class:`OrderBookSimulator` with ``max_levels``
        matching *n_levels* so the full depth is available.
        Bids descend from 100.0, asks ascend from 102.0 + spread.
        Volume tapers linearly from *base_vol* at the top level
        to 10 % at the bottom.
        """
        ob = OrderBookSimulator(max_levels=n_levels)
        e = PaperTradingEngine(
            orderbook=ob,
            initial_balance=balance,
            slippage_bps=0.0,
            fee_model="exchange",
        )
        bids = []
        asks = []
        for i in range(n_levels):
            taper = 1.0 - 0.9 * i / n_levels  # 1.0 … 0.1
            vol = base_vol * taper
            bids.append([100.0 - i * step, vol])
            asks.append([100.0 + spread + i * step, vol])
        e.orderbook.update_last_price("TEST", 100.0)
        e.orderbook.update_depth("TEST", bids, asks)
        return e

    # ----------------------------------------------------------------
    # Deep book fills (200+ levels) through the full engine pipeline
    # ----------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_market_buy_walks_200_ask_levels(self) -> None:
        """Market buy through engine walks 200 ask levels; VWAP & position correct."""
        e = self._deep_engine(200)
        asks = e.orderbook._asks.get("TEST", [])
        total_ask_vol = sum(a[1] for a in asks)
        assert len(asks) == 200, f"expected 200 ask levels, got {len(asks)}"
        qty = total_ask_vol // 2

        import time
        t0 = time.perf_counter()
        r = await e.create_order("TEST", "buy", "market", qty)
        elapsed = time.perf_counter() - t0

        assert r["status"] == "filled"
        assert r["filled_quantity"] == qty
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - qty) < 0.001
        assert elapsed < self._WIDE_BUDGET, f"took {elapsed:.3f}s (budget {self._WIDE_BUDGET}s)"

    @pytest.mark.asyncio
    async def test_market_sell_walks_200_bid_levels(self) -> None:
        """Market sell through engine walks 200 bid levels; position correct."""
        e = self._deep_engine(200)
        bids = e.orderbook._bids.get("TEST", [])
        total_bid_vol = sum(b[1] for b in bids)
        assert len(bids) == 200, f"expected 200 bid levels, got {len(bids)}"

        # Enter long first, then sell
        entry_qty = total_bid_vol // 4
        await e.create_order("TEST", "buy", "market", entry_qty)

        qty = total_bid_vol // 2
        import time
        t0 = time.perf_counter()
        r = await e.create_order("TEST", "sell", "market", qty)
        elapsed = time.perf_counter() - t0

        assert r["status"] == "filled"
        assert elapsed < self._WIDE_BUDGET, f"took {elapsed:.3f}s (budget {self._WIDE_BUDGET}s)"

    @pytest.mark.asyncio
    async def test_stop_buy_triggers_and_walks_200_levels(self) -> None:
        """Stop → market conversion through engine then walks 200 ask levels."""
        e = self._deep_engine(200, balance=50_000_000.0)  # large balance for deep stop
        asks = e.orderbook._asks.get("TEST", [])
        total_ask_vol_approx = sum(a[1] for a in asks)
        # Use a modest qty that won't exceed balance but still walks many levels
        qty = int(total_ask_vol_approx * 0.1)  # ~10 % of book

        # Place stop buy at 105 — won't trigger yet (mid ~101)
        r = await e.create_order("TEST", "buy", "stop", qty, stop_price=105.0)
        assert r["status"] == "open", f"stop order rejected: {r}"
        assert len(e.open_orders) == 1

        # Trigger via depth shift
        n = 200
        bids = [[105.0 - i * 0.5, 10_000.0] for i in range(n)]
        asks = [[106.0 + i * 0.5, 10_000.0] for i in range(n)]
        e.orderbook.update_depth("TEST", bids, asks)

        import time
        t0 = time.perf_counter()
        await e.on_price("TEST", 105.0)
        elapsed = time.perf_counter() - t0

        # Should have triggered and filled
        assert len(e.open_positions) == 1, f"expected 1 position, got {len(e.open_positions)}"
        assert e.open_positions[0].quantity > 0
        assert elapsed < self._WIDE_BUDGET, f"took {elapsed:.3f}s (budget {self._WIDE_BUDGET}s)"

    @pytest.mark.asyncio
    async def test_500_market_orders_through_engine(self) -> None:
        """500 consecutive market orders (buy+sell alternating) through full pipeline."""
        e = self._deep_engine(100, balance=50_000_000.0)
        n = 500

        import time
        t0 = time.perf_counter()
        for i in range(n):
            side = "buy" if i % 2 == 0 else "sell"
            r = await e.create_order("TEST", side, "market", 500.0)
            if i % 2 == 1:
                # After a sell, position may close or flip. That's fine.
                pass
        elapsed = time.perf_counter() - t0
        per_call = elapsed / n

        # Budget: 200 µs per market order through full async pipeline
        assert per_call < self._TIME_PER_CALL * 40, (
            f"avg {per_call*1e6:.1f} µs/call (budget {self._TIME_PER_CALL*40*1e6:.0f} µs)"
        )

    # ----------------------------------------------------------------
    # Concurrent limit / stop order triggers
    # ----------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_200_concurrent_limit_orders_check_triggers(self) -> None:
        """200 limit orders at various prices — trigger check on price change."""
        e = self._deep_engine(50, balance=5_000_000.0)
        n = 200

        # Mid is ~101. Place 200 limit buys at 100.0-101.99.
        # During creation: mid=101, 101 <= 100? No → none trigger ✓
        for i in range(n):
            lim_price = 100.0 + i * 0.01  # 100.0 … 101.99
            await e.create_order("TEST", "buy", "limit", 100.0, price=lim_price)

        assert len(e.open_orders) == n

        # Mid drops to 99.5 (bid=99, ask=100). Limits at 100+ trigger:
        # mid=99.5 <= 100 ✓. simulate_fill(100): ask=100, 100 <= 100 ✓ → fills!
        # The trigger condition is mid <= limit_price, but the fill condition
        # is ask <= limit_price. We need ask <= limit_price for a fill, so
        # limit_price must be >= the cheapest ask (not just >= mid).
        e.orderbook.update_depth(
            "TEST",
            bids=[[99.0, 500]],
            asks=[[100.0, 500]],  # mid = 99.5
        )

        import time
        t0 = time.perf_counter()
        await e.on_price("TEST", 99.5)
        elapsed = time.perf_counter() - t0

        # Only one limit should fill per tick (break after first trigger)
        filled = [o for o in e._orders.values() if o.status.value == "filled"]
        assert len(filled) >= 1, "expected at least 1 limit to fill"
        assert elapsed < self._WIDE_BUDGET, f"took {elapsed:.3f}s (budget {self._WIDE_BUDGET}s)"

    @pytest.mark.asyncio
    async def test_200_concurrent_stop_orders_check_triggers(self) -> None:
        """200 stop orders at staggered prices — trigger check on price change."""
        e = self._deep_engine(50)
        n = 200

        # Mid is ~101. Place 200 stop buys above mid at 102-103.99
        for i in range(1, n + 1):
            stop_price = 102.0 + i * 0.01  # 102.01 … 103.99
            await e.create_order("TEST", "buy", "stop", 100.0, stop_price=stop_price)

        assert len(e.open_orders) == n

        # Shift depth so mid = 104 — triggers all 200 stops but only one per tick
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(103.0, 500),
            asks=_levels(105.0, 500),  # mid = 104
        )

        import time
        t0 = time.perf_counter()
        await e.on_price("TEST", 104.0)
        elapsed = time.perf_counter() - t0

        # At least one stopped and filled
        assert len(e.open_positions) >= 1
        assert elapsed < self._WIDE_BUDGET, f"took {elapsed:.3f}s (budget {self._WIDE_BUDGET}s)"

    @pytest.mark.asyncio
    async def test_mixed_500_limit_and_stop_triggers(self) -> None:
        """250 limit + 250 stop orders — both checked on each tick."""
        e = self._deep_engine(50)

        # 250 limit buys at 99.5 … 101.98 (many below mid, some above)
        for i in range(250):
            lim_price = 99.5 + i * 0.01
            await e.create_order("TEST", "buy", "limit", 100.0, price=lim_price)

        # 250 stop buys at 101.5 … 103.98
        for i in range(250):
            stop_price = 101.5 + i * 0.01
            await e.create_order("TEST", "buy", "stop", 100.0, stop_price=stop_price)

        assert len(e.open_orders) == 500

        # Mid shifts to 102 — triggers both some limits and some stops
        # limits: 99.5…102 (mid=102 >= limit) → triggers (
        # actually BUY limit triggers when mid <= limit. So limits at 99.5-101.98
        # with mid=102 → 102 <= limit? Only if limit >= 102. So only limits >= 102
        # will trigger. That's limits from 102.0 to 101.98... none.
        # Actually limits at 99.5 + i*0.01: i=250 → 99.5+2.5=102.0. So limits at
        # 102.0+ (the last few) would trigger.
        # Wait i goes 0 to 249. 99.5 + 249*0.01 = 99.5 + 2.49 = 101.99.
        # So no limits trigger at mid=102. Hmm.
        # Let me just trigger at mid=103 instead.

        # Actually wait: for BUY limit: triggered when mid_price <= limit_price.
        # So if mid=102, limits at 102+ would trigger. But our max limit is 101.99.
        # None trigger. That's fine — the benchmark is about checking the loop,
        # not about filling. But let me make it more interesting by triggering
        # at a higher mid so some limits trigger.

        # Mid = 104:
        # Limits at >= 104 trigger. Our max limit is 101.99, none trigger.
        # Stops at 101.5+ trigger when mid >= stop. With mid=104, all
        # stops at 101.5-103.98 trigger (but only one per tick).

        e.orderbook.update_depth(
            "TEST",
            bids=_levels(103.0, 500),
            asks=_levels(105.0, 500),  # mid = 104
        )

        import time
        t0 = time.perf_counter()
        await e.on_price("TEST", 104.0)
        elapsed = time.perf_counter() - t0

        # At least one stop triggered and filled
        assert len(e.open_positions) >= 1
        # All 500 orders should still be checked per tick
        assert elapsed < self._WIDE_BUDGET, f"took {elapsed:.3f}s (budget {self._WIDE_BUDGET}s)"

    # ----------------------------------------------------------------
    # Rapid depth changes
    # ----------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_rapid_depth_changes_1000_updates(self) -> None:
        """1000 depth updates to the engine — orders remain stable."""
        e = self._deep_engine(50)

        # Place some orders
        for i in range(10):
            await e.create_order("TEST", "buy", "limit", 100.0, price=100.0 + i * 0.5)

        n = 1_000

        import time
        t0 = time.perf_counter()
        for tick in range(n):
            base = 100.0 + tick * 0.01
            bids = [[base - 1.0, 5_000], [base - 1.5, 5_000]]
            asks = [[base + 1.0, 5_000], [base + 1.5, 5_000]]
            e.orderbook.update_depth("TEST", bids, asks)
        elapsed = time.perf_counter() - t0
        per_update = elapsed / n

        assert per_update < 0.0001, (
            f"update_depth avg {per_update*1e6:.1f} µs (budget 100 µs)"
        )

        # Orders should still be there
        assert len(e.open_orders) == 10

    @pytest.mark.asyncio
    async def test_rapid_depth_changes_with_market_orders(self) -> None:
        """Interleave depth updates and market orders — 1000 of each."""
        e = self._deep_engine(50)
        n = 1_000

        import time
        t0 = time.perf_counter()
        for tick in range(n):
            base = 100.0 + tick * 0.01
            # Refresh depth
            bids = [[base - 1.0, 5_000], [base - 1.5, 5_000]]
            asks = [[base + 1.0, 5_000], [base + 1.5, 5_000]]
            e.orderbook.update_depth("TEST", bids, asks)
            # Place order
            side = "buy" if tick % 2 == 0 else "sell"
            await e.create_order("TEST", side, "market", 500.0)
        elapsed = time.perf_counter() - t0

        assert elapsed < 2.0, f"rapid mixed workload took {elapsed:.2f}s (budget 2 s)"

    @pytest.mark.asyncio
    async def test_full_workload_depth_orders_triggers(self) -> None:
        """Simulate a realistic tick loop: depth refresh, on_price, and orders."""
        e = self._deep_engine(100)

        # Pre-place some limit and stop orders
        for i in range(20):
            await e.create_order("TEST", "buy", "limit", 100.0, price=99.0 + i * 0.1)
            await e.create_order(
                "TEST", "buy", "stop", 100.0,
                stop_price=102.0 + i * 0.1,
            )

        n = 500

        import time
        t0 = time.perf_counter()
        for tick in range(n):
            base = 100.0 + (tick % 100) * 0.05  # drift through a range

            # Every tick: update depth with a small perturbation
            n_levels = 20 + (tick % 10)
            bids = [[base - 0.5 - i * 0.5, 5_000.0] for i in range(n_levels)]
            asks = [[base + 0.5 + i * 0.5, 5_000.0] for i in range(n_levels)]
            e.orderbook.update_depth("TEST", bids, asks)

            # Every tick: push a price update (triggers SL/TP + order checks)
            price = base + (tick % 10) * 0.1
            await e.on_price("TEST", price)

            # Every 50th tick: place a random order
            if tick % 50 == 0 and tick >= 50:
                side = "buy" if tick % 100 == 0 else "sell"
                r = await e.create_order("TEST", side, "market", 200.0)

        elapsed = time.perf_counter() - t0
        per_tick = elapsed / n

        # 500 ticks with depth refresh, on_price checks, and periodic orders
        assert elapsed < 5.0, f"full workload took {elapsed:.2f}s (budget 5 s)"


# ================================================================
# Event emission with book fills
# ================================================================


class TestEventBookIntegration:
    """Verify events emitted during book-walking fills carry correct data (5 tests)."""

    @pytest.mark.asyncio
    async def test_deep_book_fill_emits_correct_events(self) -> None:
        """Market buy walking 3 levels emits order_filled with correct VWAP."""
        events, handler = captured_events()
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 50, 102.0, 50, 103.0, 50),
        )
        e.set_event_handler(handler)

        r = await e.create_order("TEST", "buy", "market", 100)
        expected_vwap = (50 * 101.0 + 50 * 102.0) / 100

        # Check order_filled event
        filled_events = [ev for ev in events if ev["type"] == "paper_order_filled"]
        assert len(filled_events) == 1
        data = filled_events[0]["data"]
        assert abs(data["filled_price"] - expected_vwap) < 0.01
        assert data["filled_quantity"] == 100
        assert data["status"] == "filled"

        # Check position_opened event
        pos_events = [ev for ev in events if ev["type"] == "paper_position_opened"]
        assert len(pos_events) == 1
        pos_data = pos_events[0]["data"]
        assert abs(pos_data["entry_price"] - expected_vwap) < 0.01
        assert abs(pos_data["quantity"] - 100) < 0.001

    @pytest.mark.asyncio
    async def test_partial_limit_fill_event_from_book(self) -> None:
        """Partial limit fill emits correct filled_quantity in event."""
        events, handler = captured_events()
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(102.0, 50),  # only 50
        )
        e.set_event_handler(handler)

        await e.create_order("TEST", "buy", "limit", 100, price=102.0)

        filled_events = [ev for ev in events if ev["type"] == "paper_order_filled"]
        assert len(filled_events) == 1
        data = filled_events[0]["data"]
        assert data["filled_quantity"] == 50
        assert data["status"] == "partial"
        assert abs(data["filled_price"] - 102.0) < 0.01

        # Position opened event should show 50
        pos_events = [ev for ev in events if ev["type"] == "paper_position_opened"]
        assert len(pos_events) == 1
        assert abs(pos_events[0]["data"]["quantity"] - 50) < 0.001

    @pytest.mark.asyncio
    async def test_event_filled_price_matches_position_entry(self) -> None:
        """Event filled_price and position entry_price agree after deep book fill."""
        events, handler = captured_events()
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 100, 102.0, 100, 103.0, 100),
        )
        e.set_event_handler(handler)

        await e.create_order("TEST", "buy", "market", 200)
        expected_vwap = (100 * 101.0 + 100 * 102.0) / 200

        filled_events = [ev for ev in events if ev["type"] == "paper_order_filled"]
        pos_events = [ev for ev in events if ev["type"] == "paper_position_opened"]

        event_price = filled_events[0]["data"]["filled_price"]
        pos_price = pos_events[0]["data"]["entry_price"]

        assert abs(event_price - expected_vwap) < 0.01
        assert abs(pos_price - expected_vwap) < 0.01
        assert abs(event_price - pos_price) < 0.001  # same value

    @pytest.mark.asyncio
    async def test_consecutive_fills_from_book_emit_separate_events(self) -> None:
        """Two market buys each emit their own fill and position-update events."""
        events, handler = captured_events()
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 500),
        )
        e.set_event_handler(handler)

        # Buy 1 — walks 101.0
        await e.create_order("TEST", "buy", "market", 100)
        assert len([ev for ev in events if ev["type"] == "paper_order_filled"]) == 1

        events.clear()

        # Buy 2 — walks 101.0 again (book unchanged)
        await e.create_order("TEST", "buy", "market", 100)
        filled = [ev for ev in events if ev["type"] == "paper_order_filled"]
        assert len(filled) == 1
        data = filled[0]["data"]
        assert abs(data["filled_price"] - 101.0) < 0.01
        assert data["filled_quantity"] == 100

        # No new position_opened — should be position_updated (increased)
        pos_opened = [ev for ev in events if ev["type"] == "paper_position_opened"]
        assert len(pos_opened) == 0

    @pytest.mark.asyncio
    async def test_stop_trigger_via_book_emits_market_order_event(self) -> None:
        """Stop → market fill through book emits order_filled (not separate trigger event)."""
        events, handler = captured_events()
        e = _engine_with_book(
            last_price=100.0,
            bids=_levels(99.0, 500),
            asks=_levels(101.0, 100),
        )
        e.set_event_handler(handler)

        await e.create_order("TEST", "buy", "stop", 100, stop_price=105.0)

        # Trigger
        events.clear()
        e.orderbook.update_depth(
            "TEST",
            bids=_levels(105.0, 500),
            asks=_levels(106.0, 100),
        )
        await e.on_price("TEST", 105.0)

        filled = [ev for ev in events if ev["type"] == "paper_order_filled"]
        assert len(filled) >= 1
        data = filled[0]["data"]
        assert data["filled_quantity"] == 100
        assert abs(data["filled_price"] - 106.0) < 0.01  # ask level
        assert data["order_type"] == "market"  # converted from stop
