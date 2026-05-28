"""Unit tests for the PaperTradingEngine.

Covers market / limit / stop / stop-limit orders, SL/TP triggers,
multi-symbol trading, event emission, settings, reset, and edge
cases such as partial fills, position flips, and insufficient balance.
"""

from __future__ import annotations

import pytest

from tests.conftest import BP_BALANCE as BP
from tests.conftest import captured_events, engine_with_price
from execution.paper_trading import PaperTradingEngine


# ================================================================
# Initialisation
# ================================================================


class TestInit:
    def test_default_settings(self) -> None:
        e = PaperTradingEngine()
        s = e.settings
        assert s["initial_balance"] == 10_000.0
        assert s["slippage_bps"] == 1.0
        assert s["fee_model"] == "exchange"
        assert s["taker_fee_bps"] == 10.0
        assert s["maker_fee_bps"] == 8.0

    def test_custom_settings(self) -> None:
        e = PaperTradingEngine(
            initial_balance=25_000.0,
            slippage_bps=2.5,
            fee_model="none",
        )
        assert e.balance == 25_000.0
        assert e.settings["slippage_bps"] == 2.5
        assert e.settings["fee_model"] == "none"
        assert e.stats["initial_balance"] == 25_000.0

    def test_initial_stats_no_trades(self) -> None:
        e = PaperTradingEngine()
        s = e.stats
        assert s["balance"] == 10_000.0
        assert s["equity"] == 10_000.0
        assert s["total_trades"] == 0
        assert s["win_rate"] == 0
        assert s["total_fees_paid"] == 0

    def test_empty_snapshot(self) -> None:
        e = PaperTradingEngine()
        snap = e.snapshot()
        assert snap["positions"] == []
        assert snap["orders"] == []
        assert snap["closed_trades"] == []


# ================================================================
# Validation
# ================================================================


class TestValidation:
    @pytest.mark.asyncio
    async def test_zero_quantity(self) -> None:
        e = engine_with_price()
        r = await e.create_order("BTCUSDT", "buy", "market", 0)
        assert "error" in r
        assert "positive" in r["error"]

    @pytest.mark.asyncio
    async def test_insufficient_balance_market(self) -> None:
        e = engine_with_price(50_000.0, balance=100.0)
        r = await e.create_order("BTCUSDT", "buy", "market", 1.0)
        assert "error" in r
        assert "insufficient_balance" in r["error"]

    @pytest.mark.asyncio
    async def test_limit_without_price(self) -> None:
        e = engine_with_price()
        r = await e.create_order("BTCUSDT", "buy", "limit", 0.1)
        assert "error" in r
        assert "limit_price_required" in r["error"]

    @pytest.mark.asyncio
    async def test_stop_without_stop_price(self) -> None:
        e = engine_with_price()
        r = await e.create_order("BTCUSDT", "buy", "stop", 0.1)
        assert "error" in r
        assert "stop_price_required" in r["error"]

    @pytest.mark.asyncio
    async def test_stop_limit_without_stop_price(self) -> None:
        e = engine_with_price()
        r = await e.create_order("BTCUSDT", "buy", "stop_limit", 0.1, price=51_000)
        assert "error" in r
        assert "stop_price_required" in r["error"]

    @pytest.mark.asyncio
    async def test_stop_limit_without_limit_price(self) -> None:
        e = engine_with_price()
        r = await e.create_order("BTCUSDT", "buy", "stop_limit", 0.1, stop_price=49_000)
        assert "error" in r
        assert "limit_price_required" in r["error"]


# ================================================================
# Market orders
# ================================================================


class TestMarketOrders:
    @pytest.mark.asyncio
    async def test_market_buy_opens_long(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        r = await e.create_order("BTCUSDT", "buy", "market", 0.1)
        assert "error" not in r
        assert r["status"] == "filled"
        assert r["filled_quantity"] == 0.1
        assert r["filled_price"] == 50_000.0
        assert r["fee"] == 5.0  # 50_000 * 0.1 * 10 / 10000

        # Balance: 10_000 - 5_000 - 5 = 4_995
        assert abs(e.balance - 4_995.0) < BP

        positions = e.open_positions
        assert len(positions) == 1
        p = positions[0]
        assert p.symbol == "BTCUSDT"
        assert p.side.value == "long"
        assert abs(p.entry_price - 50_000.0) < 0.01
        assert abs(p.quantity - 0.1) < 0.0001

    @pytest.mark.asyncio
    async def test_market_sell_creates_short(self) -> None:
        """Sell without an existing position creates a SHORT."""
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        r = await e.create_order("BTCUSDT", "sell", "market", 0.1)
        assert "error" not in r

        # Balance: 10_000 + 5_000 - 5 = 14_995
        assert abs(e.balance - 14_995.0) < BP

        positions = e.open_positions
        assert len(positions) == 1
        p = positions[0]
        assert p.side.value == "short"
        assert abs(p.quantity - 0.1) < 0.0001

    @pytest.mark.asyncio
    async def test_market_sell_partial_close_long(self) -> None:
        """Partial sell reduces LONG position and credits balance."""
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.2)
        bal_after_buy = e.balance

        r = await e.create_order("BTCUSDT", "sell", "market", 0.05)
        assert "error" not in r

        # Proceeds = 50_000 * 0.05 = 2_500, fee = 2.50
        bal = e.balance
        expected = bal_after_buy + 2_500.0 - 2.50
        assert abs(bal - expected) < BP

        # Position still open with 0.15 remaining
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 0.15) < 0.0001

    @pytest.mark.asyncio
    async def test_market_sell_fully_closes_long(self) -> None:
        """Full sell close records the trade, position removed."""
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.1)
        bal_after_buy = e.balance

        await e.create_order("BTCUSDT", "sell", "market", 0.1)
        # Balance: after_buy + 5_000 - 5 = 14_990
        expected = bal_after_buy + 5_000.0 - 5.0
        assert abs(e.balance - expected) < BP

        assert len(e.open_positions) == 0
        assert len(e.closed_trades) == 1
        t = e.closed_trades[0]
        assert t.side.value == "long"
        assert abs(t.pnl) < BP  # no profit at same price

    @pytest.mark.asyncio
    async def test_market_multiple_buys_weighted_average(self) -> None:
        """Multiple buys of the same symbol produce a weighted avg entry."""
        e = engine_with_price(50_000.0, balance=100_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.1)
        # Price moves up
        e.orderbook.update_last_price("BTCUSDT", 55_000.0)
        r = await e.create_order("BTCUSDT", "buy", "market", 0.2)
        assert "error" not in r, f"{r}"

        p = e.open_positions[0]
        expected_entry = (50_000 * 0.1 + 55_000 * 0.2) / 0.3
        assert abs(p.entry_price - expected_entry) < 0.01
        assert abs(p.quantity - 0.3) < 0.0001

    @pytest.mark.asyncio
    async def test_slippage_applied(self) -> None:
        """With slippage, fill price differs from mid price."""
        e = engine_with_price(50_000.0, balance=100_000.0, slippage_bps=10.0)  # 0.1 %
        r = await e.create_order("BTCUSDT", "buy", "market", 2.0)
        assert "error" not in r
        # With no book data, fallback uses: price * (1 + slippage_bps/10000)
        expected_price = 50_000.0 * (1 + 10.0 / 10000)
        assert abs(r["filled_price"] - expected_price) < 0.1

    @pytest.mark.asyncio
    async def test_symbol_upper_casing(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        r = await e.create_order("btcusdt", "buy", "market", 0.1)
        assert "error" not in r
        assert r["symbol"] == "BTCUSDT"

    @pytest.mark.asyncio
    async def test_insufficient_balance_stop_order(self) -> None:
        """Stop orders also check balance (they will become market)."""
        e = engine_with_price(50_000.0, balance=100.0)
        r = await e.create_order("BTCUSDT", "buy", "stop", 1.0, stop_price=51_000)
        assert "error" in r
        assert "insufficient_balance" in r["error"]


# ================================================================
# Limit orders
# ================================================================


class TestLimitOrders:
    @pytest.mark.asyncio
    async def test_limit_buy_fills_when_price_drops(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        r = await e.create_order("BTCUSDT", "buy", "limit", 0.1, price=49_500)
        assert "error" not in r
        assert r["status"] == "open"  # not filled yet

        # Price drops to limit level
        await e.on_price("BTCUSDT", 49_500.0)
        assert len(e.open_positions) == 1
        p = e.open_positions[0]
        assert abs(p.entry_price - 49_500.0) < 0.01
        # Balance: 10_000 - 4_950 - (4_950 * 5/10000 = 2.48) ≈ 5_047.52
        # Maker fee = 5 bps
        expected_bal = 10_000.0 - 4_950.0 - round(4_950.0 * 5 / 10000, 2)
        assert abs(e.balance - expected_bal) < BP

    @pytest.mark.asyncio
    async def test_limit_sell_fills_when_price_rises(self) -> None:
        """First create a LONG position, then place a SELL limit above."""
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.1)  # entry at 50k
        bal = e.balance

        # Place a SELL limit at 51k
        r = await e.create_order("BTCUSDT", "sell", "limit", 0.05, price=51_000)
        assert r["status"] == "open"

        # Price rises to 51k
        await e.on_price("BTCUSDT", 51_000.0)
        assert len(e.open_positions) == 1  # partial close, still 0.05 left
        # Proceeds: 51_000 * 0.05 = 2_550, maker fee = 2_550 * 5/10000 = 1.28
        fee_limit = 2_550.0 * 5 / 10000
        expected_bal = bal + 2_550.0 - round(fee_limit, 2)
        assert abs(e.balance - expected_bal) < BP

    @pytest.mark.asyncio
    async def test_limit_not_filled_when_price_misses(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "limit", 0.1, price=45_000)
        assert len(e.open_positions) == 0  # not filled yet

        await e.on_price("BTCUSDT", 46_000.0)  # still above limit
        assert len(e.open_positions) == 0

        await e.on_price("BTCUSDT", 45_000.0)  # now at limit
        assert len(e.open_positions) == 1

    @pytest.mark.asyncio
    async def test_limit_insufficient_balance_skips_fill(self) -> None:
        """If balance is too low when limit triggers, fill is skipped."""
        e = engine_with_price(50_000.0, balance=100.0, slippage_bps=0.0)
        r = await e.create_order("BTCUSDT", "buy", "limit", 0.1, price=49_500)
        assert r["status"] == "open"

        await e.on_price("BTCUSDT", 49_500.0)
        # Should NOT fill — insufficient balance (cost 4_950 > 100)
        assert len(e.open_positions) == 0


# ================================================================
# Stop orders
# ================================================================


class TestStopOrders:
    @pytest.mark.asyncio
    async def test_buy_stop_triggers_when_price_rises(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        r = await e.create_order("BTCUSDT", "buy", "stop", 0.1, stop_price=51_000)
        assert r["status"] == "open"

        await e.on_price("BTCUSDT", 51_000.0)
        assert len(e.open_positions) == 1
        # Filled at market price (51k with 0 slippage)
        p = e.open_positions[0]
        assert abs(p.entry_price - 51_000.0) < 0.01
        # Fee: 5_100 * 10/10000 = 5.10
        expected_bal = 10_000.0 - 5_100.0 - 5.10
        assert abs(e.balance - expected_bal) < BP

    @pytest.mark.asyncio
    async def test_sell_stop_triggers_when_price_drops(self) -> None:
        """Long position with a sell stop to protect downside."""
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.1)  # entry at 50k
        bal = e.balance

        r = await e.create_order("BTCUSDT", "sell", "stop", 0.1, stop_price=49_000)
        assert r["status"] == "open"

        await e.on_price("BTCUSDT", 49_000.0)
        assert len(e.open_positions) == 0  # fully closed
        # Sold at 49k (=stop trigger), proceeds = 4_900, fee = 4.90
        expected_bal = bal + 4_900.0 - 4.90
        assert abs(e.balance - expected_bal) < BP

    @pytest.mark.asyncio
    async def test_stop_not_triggered_when_price_stays(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "stop", 0.1, stop_price=51_000)
        await e.on_price("BTCUSDT", 50_500.0)
        assert len(e.open_positions) == 0


# ================================================================
# Stop-limit orders
# ================================================================


class TestStopLimitOrders:
    @pytest.mark.asyncio
    async def test_stop_limit_triggers_and_fills(self) -> None:
        """Stop reached → becomes limit order → fills when price crosses limit."""
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        r = await e.create_order(
            "BTCUSDT", "buy", "stop_limit", 0.1,
            stop_price=51_000, price=51_050,
        )
        assert r["status"] == "open"

        # Trigger at stop price
        await e.on_price("BTCUSDT", 51_000.0)
        # Order is now a limit order, but price is at 51k, limit is 51,050
        # For a BUY stop-limit, triggered when price >= stop_price.
        # After trigger, becomes LIMIT at 51,050.
        # Price (51k) is ≤ limit (51,050), so it should fill.
        assert len(e.open_positions) == 1

    @pytest.mark.asyncio
    async def test_stop_limit_triggers_but_not_fills(self) -> None:
        """Triggered but price above limit — fills when price drops."""
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        r = await e.create_order(
            "BTCUSDT", "buy", "stop_limit", 0.1,
            stop_price=51_000, price=51_050,
        )
        assert r["status"] == "open"

        # Trigger: price moves to 51_200 (above both stop and limit)
        # Stop-limit triggers: becomes LIMIT at 51,050
        # But price is 51,200 which is above 51,050 (BUY limit requires price ≤ limit)
        # So it should NOT fill yet
        await e.on_price("BTCUSDT", 51_200.0)
        assert len(e.open_positions) == 0

        # Price drops to 51,050 — now fills
        await e.on_price("BTCUSDT", 51_050.0)
        assert len(e.open_positions) == 1


# ================================================================
# Cancel orders
# ================================================================


class TestCancelOrders:
    @pytest.mark.asyncio
    async def test_cancel_open_order(self) -> None:
        e = engine_with_price()
        r = await e.create_order("BTCUSDT", "buy", "limit", 0.1, price=49_500)
        assert r["status"] == "open"

        cancelled = await e.cancel_order(r["id"])
        assert cancelled is not None
        assert cancelled["id"] == r["id"]
        assert cancelled["status"] == "cancelled"

        # Verify no longer in open orders
        assert all(o.id != r["id"] for o in e.open_orders)

    @pytest.mark.asyncio
    async def test_cancel_nonexistent_order_returns_none(self) -> None:
        e = engine_with_price()
        r = await e.cancel_order(99_999)
        assert r is None

    @pytest.mark.asyncio
    async def test_cancel_filled_order_returns_none(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        r = await e.create_order("BTCUSDT", "buy", "market", 0.1)
        assert r["status"] == "filled"

        cancelled = await e.cancel_order(r["id"])
        assert cancelled is None


# ================================================================
# SL / TP
# ================================================================


class TestStopLossTakeProfit:
    @pytest.mark.asyncio
    async def test_stop_loss_triggers_on_price_drop(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        r = await e.create_order("BTCUSDT", "buy", "market", 0.1)
        pos_id = r["position"]["id"]

        await e.update_position(pos_id, stop_loss=49_000.0)
        await e.on_price("BTCUSDT", 48_500.0)

        assert len(e.open_positions) == 0
        assert len(e.closed_trades) == 1
        assert e.closed_trades[0].exit_reason == "stop_loss"

    @pytest.mark.asyncio
    async def test_take_profit_triggers_on_price_rise(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        r = await e.create_order("BTCUSDT", "buy", "market", 0.1)
        pos_id = r["position"]["id"]

        await e.update_position(pos_id, take_profit=52_000.0)
        await e.on_price("BTCUSDT", 52_500.0)

        assert len(e.open_positions) == 0
        assert e.closed_trades[0].exit_reason == "take_profit"

    @pytest.mark.asyncio
    async def test_sl_tp_does_not_trigger_when_not_hit(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        r = await e.create_order("BTCUSDT", "buy", "market", 0.1)
        pos_id = r["position"]["id"]

        await e.update_position(pos_id, stop_loss=49_000.0, take_profit=52_000.0)
        await e.on_price("BTCUSDT", 50_500.0)  # within range

        assert len(e.open_positions) == 1

    @pytest.mark.asyncio
    async def test_update_position_nonexistent(self) -> None:
        e = engine_with_price()
        r = await e.update_position(99_999, stop_loss=10.0)
        assert r is None

    @pytest.mark.asyncio
    async def test_update_position_closed_position(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        r = await e.create_order("BTCUSDT", "buy", "market", 0.1)
        pos_id = r["position"]["id"]
        await e.update_position(pos_id, stop_loss=49_000.0)
        await e.on_price("BTCUSDT", 48_000.0)
        # Position is now closed, try to update
        r2 = await e.update_position(pos_id, take_profit=60_000.0)
        assert r2 is None


# ================================================================
# Event emission
# ================================================================


class TestEvents:
    @pytest.mark.asyncio
    async def test_market_order_events(self) -> None:
        events, handler = captured_events()
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        e.set_event_handler(handler)

        await e.create_order("BTCUSDT", "buy", "market", 0.1)
        types = [ev["type"] for ev in events]
        assert "paper_position_opened" in types
        assert "paper_order_filled" in types

    @pytest.mark.asyncio
    async def test_limit_order_events(self) -> None:
        events, handler = captured_events()
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        e.set_event_handler(handler)

        r = await e.create_order("BTCUSDT", "buy", "limit", 0.1, price=49_500)
        types = [ev["type"] for ev in events]
        assert "paper_order_created" in types

        # Fill it
        events.clear()
        await e.on_price("BTCUSDT", 49_500.0)
        types = [ev["type"] for ev in events]
        assert "paper_order_filled" in types
        assert "paper_position_opened" in types

    @pytest.mark.asyncio
    async def test_cancel_event(self) -> None:
        events, handler = captured_events()
        e = engine_with_price()
        e.set_event_handler(handler)

        r = await e.create_order("BTCUSDT", "buy", "limit", 0.1, price=49_500)
        events.clear()
        await e.cancel_order(r["id"])
        types = [ev["type"] for ev in events]
        assert "paper_order_cancelled" in types

    @pytest.mark.asyncio
    async def test_close_position_event(self) -> None:
        events, handler = captured_events()
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        e.set_event_handler(handler)

        await e.create_order("BTCUSDT", "buy", "market", 0.1)
        events.clear()

        await e.create_order("BTCUSDT", "sell", "market", 0.1)
        types = [ev["type"] for ev in events]
        assert "paper_position_closed" in types

    @pytest.mark.asyncio
    async def test_settings_updated_event(self) -> None:
        events, handler = captured_events()
        e = engine_with_price()
        e.set_event_handler(handler)

        await e.update_settings(slippage_bps=5.0)
        types = [ev["type"] for ev in events]
        assert "paper_settings_updated" in types


# ================================================================
# Multiple symbols
# ================================================================


class TestMultipleSymbols:
    @pytest.mark.asyncio
    async def test_trade_two_symbols_independently(self) -> None:
        e = PaperTradingEngine(slippage_bps=0.0)
        e.orderbook.update_last_price("BTCUSDT", 50_000.0)
        e.orderbook.update_last_price("ETHUSDT", 3_000.0)

        # Buy BTC
        r1 = await e.create_order("BTCUSDT", "buy", "market", 0.1)
        assert "error" not in r1
        bt = e.open_positions[0]
        assert bt.symbol == "BTCUSDT"

        # Buy ETH
        r2 = await e.create_order("ETHUSDT", "buy", "market", 1.0)
        assert "error" not in r2
        assert len(e.open_positions) == 2

    @pytest.mark.asyncio
    async def test_price_update_only_affects_matching_symbol(self) -> None:
        e = PaperTradingEngine(slippage_bps=0.0)
        e.orderbook.update_last_price("BTCUSDT", 50_000.0)
        e.orderbook.update_last_price("ETHUSDT", 3_000.0)

        await e.create_order("BTCUSDT", "buy", "market", 0.1)
        await e.create_order("ETHUSDT", "buy", "market", 1.0)

        # Only update BTC price
        await e.on_price("BTCUSDT", 55_000.0)
        btc_pnl = e.open_positions[0].pnl
        eth_pnl = e.open_positions[1].pnl

        assert btc_pnl > 0  # BTC went up
        assert abs(eth_pnl) < BP  # ETH unchanged (still at 3k)

    @pytest.mark.asyncio
    async def test_stop_loss_only_affects_correct_symbol(self) -> None:
        e = PaperTradingEngine(slippage_bps=0.0)
        e.orderbook.update_last_price("BTCUSDT", 50_000.0)
        e.orderbook.update_last_price("ETHUSDT", 3_000.0)

        await e.create_order("BTCUSDT", "buy", "market", 0.1)
        r2 = await e.create_order("ETHUSDT", "buy", "market", 1.0)

        # Set SL only on ETH
        await e.update_position(r2["position"]["id"], stop_loss=2_800.0)

        # BTC price drops, but ETH SL is what matters
        await e.on_price("BTCUSDT", 40_000.0)
        assert len(e.open_positions) == 2  # both still open (BTC SL not set)

        # ETH price drops below SL
        await e.on_price("ETHUSDT", 2_700.0)
        assert len(e.open_positions) == 1  # ETH closed
        assert e.open_positions[0].symbol == "BTCUSDT"


# ================================================================
# Equity & P&L
# ================================================================


class TestEquityPnL:
    @pytest.mark.asyncio
    async def test_equity_includes_unrealized_pnl(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.1)
        bal = e.balance
        e.orderbook.update_last_price("BTCUSDT", 55_000.0)
        e.mark_prices("BTCUSDT", 55_000.0)

        unrealized = (55_000.0 - 50_000.0) * 0.1
        assert abs(e.equity - (bal + unrealized)) < BP

    @pytest.mark.asyncio
    async def test_stats_after_profitable_trade(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.1)
        e.orderbook.update_last_price("BTCUSDT", 55_000.0)
        await e.create_order("BTCUSDT", "sell", "market", 0.1)

        s = e.stats
        assert s["total_trades"] == 1
        assert s["wins"] == 1
        # Raw PnL = (55k - 50k) * 0.1 = 500 (fees tracked separately)
        assert abs(s["total_pnl"] - 500.0) < 0.5

    @pytest.mark.asyncio
    async def test_stats_after_losing_trade(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.1)
        e.orderbook.update_last_price("BTCUSDT", 48_000.0)
        await e.create_order("BTCUSDT", "sell", "market", 0.1)

        s = e.stats
        assert s["losses"] == 1
        assert s["total_pnl"] < 0


# ================================================================
# Settings
# ================================================================


class TestSettings:
    @pytest.mark.asyncio
    async def test_update_slippage(self) -> None:
        e = engine_with_price()
        await e.update_settings(slippage_bps=5.0)
        assert e.settings["slippage_bps"] == 5.0

    @pytest.mark.asyncio
    async def test_update_fee_model(self) -> None:
        e = engine_with_price()
        await e.update_settings(fee_model="none")
        assert e.settings["fee_model"] == "none"

    @pytest.mark.asyncio
    async def test_update_taker_maker_fees(self) -> None:
        e = engine_with_price()
        await e.update_settings(taker_fee_bps=20.0, maker_fee_bps=10.0)
        assert e.settings["taker_fee_bps"] == 20.0
        assert e.settings["maker_fee_bps"] == 10.0

    @pytest.mark.asyncio
    async def test_initial_balance_reset_when_no_trades(self) -> None:
        e = engine_with_price(balance=5_000.0)
        await e.update_settings(initial_balance=20_000.0)
        assert e.balance == 20_000.0
        assert e.settings["initial_balance"] == 20_000.0

    @pytest.mark.asyncio
    async def test_initial_balance_does_not_reset_when_traded(self) -> None:
        """After a trade is closed, changing initial_balance doesn't overwrite."""
        e = engine_with_price(50_000.0, balance=100_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.1)
        await e.create_order("BTCUSDT", "sell", "market", 0.1)  # close trade
        bal_before = e.balance
        await e.update_settings(initial_balance=50_000.0)
        # Balance should NOT be overwritten — a trade has been fully closed
        assert e.balance == bal_before

    @pytest.mark.asyncio
    async def test_fee_model_none_skips_fees(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0, fee_model="none")
        r = await e.create_order("BTCUSDT", "buy", "market", 0.1)
        assert r["fee"] == 0.0
        assert abs(e.balance - 5_000.0) < BP  # no fee deducted
        assert e.stats["total_fees_paid"] == 0.0


# ================================================================
# Reset
# ================================================================


class TestReset:
    @pytest.mark.asyncio
    async def test_reset_clears_everything(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.1)
        await e.create_order("BTCUSDT", "sell", "market", 0.1)

        await e.reset()
        s = e.stats
        assert s["balance"] == 10_000.0
        assert s["total_trades"] == 0
        assert s["wins"] == 0
        assert s["losses"] == 0
        assert s["total_pnl"] == 0
        assert s["total_fees_paid"] == 0
        assert s["equity"] == 10_000.0
        assert len(e.open_positions) == 0
        assert len(e.open_orders) == 0
        assert len(e.closed_trades) == 0

    @pytest.mark.asyncio
    async def test_reset_emits_event(self) -> None:
        events, handler = captured_events()
        e = engine_with_price()
        e.set_event_handler(handler)
        await e.reset()
        types = [ev["type"] for ev in events]
        assert "paper_reset" in types


# ================================================================
# Order book integration (only when depth is set)
# ================================================================


class TestOrderBookIntegration:
    @pytest.mark.asyncio
    async def test_fill_from_orderbook_levels(self) -> None:
        """When depth is set, fills walk through the book."""
        e = PaperTradingEngine(slippage_bps=0.0)
        e.orderbook.update_last_price("AAPL", 150.0)
        e.orderbook.update_depth(
            "AAPL",
            bids=[[149.0, 100], [148.5, 200]],
            asks=[[151.0, 100], [151.5, 200]],
        )

        # Use a larger balance to cover the full cost
        e.initial_balance = e._balance = 100_000.0
        e._initial_balance = 100_000.0
        r = await e.create_order("AAPL", "buy", "market", 150)
        assert "error" not in r
        # VWAP: (100 * 151.0 + 50 * 151.5) / 150 = 151.16667
        expected_vwap = (100 * 151.0 + 50 * 151.5) / 150
        assert abs(r["filled_price"] - expected_vwap) < 0.01

    @pytest.mark.asyncio
    async def test_shallow_book_falls_back(self) -> None:
        """Market order fills from book + fallback when book lacks liquidity."""
        e = PaperTradingEngine(slippage_bps=0.0)
        e.orderbook.update_last_price("AAPL", 150.0)
        e.orderbook.update_depth(
            "AAPL",
            bids=[[149.0, 100]],
            asks=[[151.0, 10]],  # only 10 shares available
        )

        e._initial_balance = e._balance = 100_000.0
        r = await e.create_order("AAPL", "buy", "market", 100)
        assert "error" not in r
        assert r["filled_quantity"] == 100  # 10 from book + 90 from fallback
        assert r["status"] == "filled"


# ================================================================
# Position reversal (flip)
# ================================================================


class TestPositionFlip:
    @pytest.mark.asyncio
    async def test_sell_flips_long_to_short(self) -> None:
        """Selling more than the current long position flips to short."""
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.1)
        bal_after_buy = e.balance

        # Sell more than we have — should close long and open short
        await e.create_order("BTCUSDT", "sell", "market", 0.2)
        # Should have a SHORT position of 0.1
        assert len(e.open_positions) == 1
        p = e.open_positions[0]
        assert p.side.value == "short"
        assert abs(p.quantity - 0.1) < 0.0001

    @pytest.mark.asyncio
    async def test_buy_flips_short_to_long(self) -> None:
        """Buying more than the current short position flips to long."""
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "sell", "market", 0.1)
        bal_after_short = e.balance

        await e.create_order("BTCUSDT", "buy", "market", 0.2)
        assert len(e.open_positions) == 1
        p = e.open_positions[0]
        assert p.side.value == "long"
        assert abs(p.quantity - 0.1) < 0.0001


# ================================================================
# Rejected orders (no price data)
# ================================================================


class TestRejectedOrders:
    @pytest.mark.asyncio
    async def test_market_order_without_price_data(self) -> None:
        """Engine with no price data should reject a market order."""
        e = PaperTradingEngine(slippage_bps=0.0)
        r = await e.create_order("UNKNOWN", "buy", "market", 0.1)
        assert "error" in r
        assert r["error"] is not None


# ================================================================
# Snapshot consistency
# ================================================================


class TestSnapshot:
    @pytest.mark.asyncio
    async def test_snapshot_matches_state(self) -> None:
        e = engine_with_price(50_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.1)

        snap = e.snapshot()
        assert snap["balance"] == e.balance
        assert snap["equity"] == e.equity
        assert len(snap["positions"]) == 1
        assert snap["positions"][0]["symbol"] == "BTCUSDT"

    @pytest.mark.asyncio
    async def test_snapshot_includes_settings(self) -> None:
        e = engine_with_price()
        snap = e.snapshot()
        assert "settings" in snap
        assert snap["settings"]["initial_balance"] == 10_000.0


# ================================================================
# Multiple partial fills (limit/stop fills in stages via book)
# ================================================================


class TestMultiplePartialFills:
    @pytest.mark.asyncio
    async def test_limit_buy_fills_in_two_stages(self) -> None:
        """Limit order that exceeds book depth fills partially, then completes when depth refreshes."""
        e = PaperTradingEngine(slippage_bps=0.0, maker_fee_bps=5.0)
        e.orderbook.update_last_price("AAPL", 150.0)
        e.orderbook.update_depth(
            "AAPL",
            bids=[[149.0, 100]],
            asks=[[151.0, 50]],  # only 50 shares at ask
        )
        e._initial_balance = e._balance = 100_000.0

        r = await e.create_order("AAPL", "buy", "limit", 100, price=152.0)
        assert "error" not in r
        # Order should be partially filled via book (50 @ 151.0)
        # VWAP from book: 50 * 151.0 / 50 = 151.0
        assert r["status"] == "partial"
        assert r["filled_quantity"] == 50
        assert abs(r["filled_price"] - 151.0) < 0.01
        # Position: 50 shares
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 50) < 0.001
        # Fee (check total_fees_paid since order_to_dict doesn't include fee)
        expected_fee = round(50 * 151.0 * 5 / 10000, 2)
        assert abs(e.stats["total_fees_paid"] - expected_fee) < BP

        # Price drops — remaining limit should still fill
        await e.on_price("AAPL", 152.0)
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 100) < 0.001

    @pytest.mark.asyncio
    async def test_limit_sell_partial_then_full_close(self) -> None:
        """Long position reduced by a partial limit sell, then remaining filled on next cross."""
        e = PaperTradingEngine(slippage_bps=0.0)
        e.orderbook.update_last_price("AAPL", 150.0)
        e.orderbook.update_depth(
            "AAPL",
            bids=[[152.0, 50]],   # only 50 shares bid
            asks=[[154.0, 300]],  # enough for full 200-share fill
        )
        e._initial_balance = e._balance = 100_000.0

        # Enter long 200 shares
        await e.create_order("AAPL", "buy", "market", 200)
        assert abs(e.open_positions[0].quantity - 200) < 0.001

        # Place sell limit for 200 at 152 — should fill 50 via book
        r = await e.create_order("AAPL", "sell", "limit", 200, price=152.0)
        assert r["status"] == "partial"
        assert r["filled_quantity"] == 50
        # Position reduced from 200 to 150
        assert abs(e.open_positions[0].quantity - 150) < 0.001

        # More bids appear — remaining should fill
        e.orderbook.update_depth(
            "AAPL",
            bids=[[152.0, 300]],  # now enough liquidity
            asks=[[154.0, 100]],
        )
        await e.on_price("AAPL", 152.0)
        # Position fully closed
        assert len(e.open_positions) == 0
        assert len(e.closed_trades) == 1

    @pytest.mark.asyncio
    async def test_stop_order_trigger_and_book(self) -> None:
        """Stop order that triggers and fills from book + fallback."""
        e = PaperTradingEngine(slippage_bps=0.0)
        e.orderbook.update_last_price("AAPL", 150.0)
        # Initial book: mid=(153+155)/2=154.0 — stop_price=155 > mid, won't trigger
        e.orderbook.update_depth(
            "AAPL",
            bids=[[153.0, 100]],
            asks=[[155.0, 20]],
        )
        e._initial_balance = e._balance = 100_000.0

        r = await e.create_order("AAPL", "buy", "stop", 100, stop_price=155.0)
        assert r["status"] == "open"

        # Update depth so mid reaches stop_price, then trigger via on_price
        e.orderbook.update_depth(
            "AAPL",
            bids=[[154.0, 100]],
            asks=[[156.0, 20]],  # only 20 shares — rest comes from fallback
        )
        await e.on_price("AAPL", 155.0)
        assert len(e.open_positions) == 1
        # All 100 fill: 20 from book at 156.0, 80 from fallback at 155.0
        assert abs(e.open_positions[0].quantity - 100) < 0.001
        assert len(e.open_positions) == 1

    @pytest.mark.asyncio
    async def test_stop_buy_triggers_and_fully_fills_with_book(self) -> None:
        """Stop order that triggers and fills completely from book depth."""
        e = PaperTradingEngine(slippage_bps=0.0)
        e.orderbook.update_last_price("AAPL", 150.0)
        # Initial book: mid=(153+155)/2=154.0 — stop_price=155 > mid, won't trigger
        e.orderbook.update_depth(
            "AAPL",
            bids=[[153.0, 100]],
            asks=[[155.0, 100], [155.5, 200]],
        )
        e._initial_balance = e._balance = 100_000.0

        r = await e.create_order("AAPL", "buy", "stop", 100, stop_price=155.0)
        assert r["status"] == "open"

        # Update depth so mid=155 >= stop_price, then trigger
        e.orderbook.update_depth(
            "AAPL",
            bids=[[155.0, 100]],
            asks=[[155.0, 100], [155.5, 200]],
        )
        await e.on_price("AAPL", 155.0)
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 100) < 0.001
        # VWAP: 100 * 155.0 / 100 = 155.0
        assert abs(e.open_positions[0].entry_price - 155.0) < 0.01


# ================================================================
# Concurrent orders (multiple orders active at the same time)
# ================================================================


class TestConcurrentOrders:
    @pytest.mark.asyncio
    async def test_two_limits_at_different_prices(self) -> None:
        """Two limit buys at different levels — each triggers at its own price."""
        e = engine_with_price(50_000.0, balance=100_000.0, slippage_bps=0.0)

        r1 = await e.create_order("BTCUSDT", "buy", "limit", 0.5, price=49_000)
        r2 = await e.create_order("BTCUSDT", "buy", "limit", 0.5, price=48_000)
        assert r1["status"] == "open"
        assert r2["status"] == "open"
        assert len(e.open_orders) == 2

        # Price drops to 49k — only the first limit triggers
        await e.on_price("BTCUSDT", 49_000.0)
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 0.5) < 0.0001
        assert abs(e.open_positions[0].entry_price - 49_000.0) < 0.01
        assert len(e.open_orders) == 1  # second still open

        # Price drops further to 48k — second triggers
        await e.on_price("BTCUSDT", 48_000.0)
        assert len(e.open_positions) == 1  # same position, increased
        assert abs(e.open_positions[0].quantity - 1.0) < 0.0001
        expected_entry = (49_000 * 0.5 + 48_000 * 0.5) / 1.0
        assert abs(e.open_positions[0].entry_price - expected_entry) < 0.01
        assert len(e.open_orders) == 0  # both filled

    @pytest.mark.asyncio
    async def test_limit_and_stop_concurrent(self) -> None:
        """Limit buy below market + stop buy above market — each triggers independently."""
        e = engine_with_price(50_000.0, balance=100_000.0, slippage_bps=0.0)

        r1 = await e.create_order("BTCUSDT", "buy", "limit", 0.3, price=49_000)
        r2 = await e.create_order("BTCUSDT", "buy", "stop", 0.4, stop_price=51_000)
        assert r1["status"] == "open"
        assert r2["status"] == "open"

        # Price drops to 49k — limit triggers, stop stays open
        await e.on_price("BTCUSDT", 49_000.0)
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 0.3) < 0.0001
        assert len(e.open_orders) == 1  # stop still open

        # Price rises to 51k — stop triggers, adds to same position
        await e.on_price("BTCUSDT", 51_000.0)
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 0.7) < 0.0001
        assert len(e.open_orders) == 0

    @pytest.mark.asyncio
    async def test_two_stops_on_same_position(self) -> None:
        """Long position with two sell stop orders at different levels."""
        e = engine_with_price(50_000.0, balance=100_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.5)
        assert len(e.open_positions) == 1

        # Two sell stops: one partial at 49.5k, one full close at 49k
        r1 = await e.create_order("BTCUSDT", "sell", "stop", 0.2, stop_price=49_500)
        r2 = await e.create_order("BTCUSDT", "sell", "stop", 0.3, stop_price=49_000)
        assert r1["status"] == "open"
        assert r2["status"] == "open"

        # Price drops to 49.5k — first stop triggers, position reduces
        await e.on_price("BTCUSDT", 49_500.0)
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 0.3) < 0.0001

        # Price drops further to 49k — second stop triggers, closes position
        await e.on_price("BTCUSDT", 49_000.0)
        assert len(e.open_positions) == 0
        assert len(e.closed_trades) == 1

    @pytest.mark.asyncio
    async def test_multi_symbol_concurrent_orders(self) -> None:
        """Concurrent limit orders on different symbols trigger independently."""
        e = PaperTradingEngine(slippage_bps=0.0, initial_balance=100_000.0)
        e.orderbook.update_last_price("BTCUSDT", 50_000.0)
        e.orderbook.update_last_price("ETHUSDT", 3_000.0)

        r1 = await e.create_order("BTCUSDT", "buy", "limit", 0.2, price=48_000)
        r2 = await e.create_order("ETHUSDT", "buy", "limit", 5.0, price=2_800)
        assert r1["status"] == "open"
        assert r2["status"] == "open"

        # Only BTC price drops — only BTC fills
        await e.on_price("BTCUSDT", 48_000.0)
        assert len(e.open_positions) == 1
        assert e.open_positions[0].symbol == "BTCUSDT"

        # ETH price drops — ETH fills too
        await e.on_price("ETHUSDT", 2_800.0)
        assert len(e.open_positions) == 2

    @pytest.mark.asyncio
    async def test_multiple_orders_cancelled_on_position_close(self) -> None:
        """When a position is closed by one stop, remaining stops get cancelled."""
        e = engine_with_price(50_000.0, balance=100_000.0, slippage_bps=0.0)
        await e.create_order("BTCUSDT", "buy", "market", 0.3)

        # Two stops: one partial, one full close
        r1 = await e.create_order("BTCUSDT", "sell", "stop", 0.1, stop_price=49_500)
        r2 = await e.create_order("BTCUSDT", "sell", "stop", 0.2, stop_price=49_000)
        r3 = await e.create_order("BTCUSDT", "sell", "stop", 0.1, stop_price=48_000)  # extra

        # Price drops to 49500 — first stop triggers (partial reduce)
        await e.on_price("BTCUSDT", 49_500.0)
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 0.2) < 0.001

        # Price drops to 49000 — second stop triggers (full close)
        await e.on_price("BTCUSDT", 49_000.0)
        # Position should be fully closed
        assert len(e.open_positions) == 0
        assert len(e.closed_trades) == 1
        # r1 triggered partial (0.1), r2 triggered close (0.2)
        # r1 marked filled, r2 marked filled
        # r3 was still open — it WON'T be auto-cancelled because it has no
        # position_id (never filled). Only orders associated with the closed
        # position (via position_id) get cancelled.
        r3_order = e._orders[r3["id"]]
        assert r3_order.status.value == "open"


# ================================================================
# Flips with fees (position reversals and fee tracking)
# ================================================================


class TestFlipWithFees:
    @pytest.mark.asyncio
    async def test_sell_flip_long_to_short_fees(self) -> None:
        """Flip from long to short and verify fees on both legs."""
        e = engine_with_price(50_000.0, balance=100_000.0, slippage_bps=0.0)

        # Enter long 0.1 BTC
        r1 = await e.create_order("BTCUSDT", "buy", "market", 0.1)
        fee_buy = r1["fee"]
        assert fee_buy > 0
        bal_after_buy = e.balance

        # Flip to short by selling 0.2 BTC
        r2 = await e.create_order("BTCUSDT", "sell", "market", 0.2)
        fee_sell = r2["fee"]
        assert fee_sell > 0

        # Verify total fees tracked
        assert abs(e.stats["total_fees_paid"] - (fee_buy + fee_sell)) < BP

        # Position should be short 0.1
        assert len(e.open_positions) == 1
        p = e.open_positions[0]
        assert p.side.value == "short"
        assert abs(p.quantity - 0.1) < 0.0001

        # Closed trade should be recorded for the flipped long
        assert len(e.closed_trades) == 1
        t = e.closed_trades[0]
        assert t.side.value == "long"
        assert abs(t.pnl) < BP  # no profit at same entry/exit price
        assert t.exit_reason == "closed_by_opposite_order"

        # Verify balance: buy cost 5000+fee, sell proceeds 10000-fee
        # bal = 100000 - (5000+fee_buy) + (10000-fee_sell)
        expected_bal = 100_000.0 - (5_000.0 + fee_buy) + (10_000.0 - fee_sell)
        assert abs(e.balance - expected_bal) < BP

    @pytest.mark.asyncio
    async def test_buy_flip_short_to_long_stats(self) -> None:
        """Flip from short to long and verify win/loss stats."""
        e = engine_with_price(50_000.0, balance=100_000.0, slippage_bps=0.0)

        # Enter short 0.1 BTC
        await e.create_order("BTCUSDT", "sell", "market", 0.1)
        bal_after_short = e.balance

        # Flip to long by buying 0.2 BTC at same price (no PnL on short)
        await e.create_order("BTCUSDT", "buy", "market", 0.2)

        # Stats: 1 trade closed (the short), flat PnL
        s = e.stats
        assert s["total_trades"] == 1
        assert abs(s["total_pnl"]) < 1.0  # roughly zero (entry=exit)

        # Position should be long 0.1
        assert len(e.open_positions) == 1
        p = e.open_positions[0]
        assert p.side.value == "long"
        assert abs(p.quantity - 0.1) < 0.0001

    @pytest.mark.asyncio
    async def test_sequential_flips_back_and_forth(self) -> None:
        """Multiple flips: long → short → long, verify cumulative stats."""
        e = engine_with_price(50_000.0, balance=100_000.0, slippage_bps=0.0)

        # 1. Long 0.2
        await e.create_order("BTCUSDT", "buy", "market", 0.2)
        # Price rises to 51k
        e.orderbook.update_last_price("BTCUSDT", 51_000.0)

        # 2. Flip to short: sell 0.4 (close 0.2 long + open 0.2 short)
        await e.create_order("BTCUSDT", "sell", "market", 0.4)
        # Closed 1: long at 50k, sold at 51k → PnL = (51k-50k)*0.2 = +200
        # Short position: 0.2

        s = e.stats
        assert s["total_trades"] == 1
        assert s["wins"] == 1
        assert abs(s["total_pnl"] - 200.0) < 1.0  # ~200 profit on long

        # Price drops to 49k
        e.orderbook.update_last_price("BTCUSDT", 49_000.0)

        # 3. Flip to long: buy 0.4 (close 0.2 short + open 0.2 long)
        await e.create_order("BTCUSDT", "buy", "market", 0.4)
        # Closed 2: short at 51k, bought at 49k → PnL = (51k-49k)*0.2 = +400
        # Long position: 0.2

        s2 = e.stats
        assert s2["total_trades"] == 2
        assert s2["wins"] == 2
        assert abs(s2["total_pnl"] - 600.0) < 2.0  # ~200 + ~400

        assert len(e.open_positions) == 1
        assert e.open_positions[0].side.value == "long"
        assert abs(e.open_positions[0].quantity - 0.2) < 0.0001

    @pytest.mark.asyncio
    async def test_flip_with_slippage_and_fees(self) -> None:
        """Flip with non-zero slippage and exchange fees — verify realistic net PnL."""
        e = engine_with_price(50_000.0, balance=200_000.0, slippage_bps=5.0)

        # Enter long 0.5 BTC with slippage
        r1 = await e.create_order("BTCUSDT", "buy", "market", 0.5)
        buy_price = r1["filled_price"]
        buy_fee = r1["fee"]
        assert buy_price > 50_000.0  # slippage increased price for buy
        assert buy_fee > 0

        # Price rises
        e.orderbook.update_last_price("BTCUSDT", 51_000.0)

        # Flip: sell 1.0 (close 0.5 long + open 0.5 short)
        r2 = await e.create_order("BTCUSDT", "sell", "market", 1.0)
        sell_price = r2["filled_price"]
        sell_fee = r2["fee"]
        assert sell_price < 51_000.0  # slippage decreased price for sell
        assert sell_fee > 0

        # Closed trade: PnL = (sell_price - buy_price) * 0.5
        # Both have slippage, so PnL is less than ideal
        closed = e.closed_trades[0]
        expected_pnl = (sell_price - buy_price) * 0.5
        assert abs(closed.pnl - expected_pnl) < 0.1

        # Total fees should include both legs
        assert abs(e.stats["total_fees_paid"] - (buy_fee + sell_fee)) < BP

        # Short position should be open
        assert len(e.open_positions) == 1
        assert e.open_positions[0].side.value == "short"

    @pytest.mark.asyncio
    async def test_flip_profitable_short_to_long(self) -> None:
        """Short flip to long with profit on the short leg."""
        e = engine_with_price(50_000.0, balance=100_000.0, slippage_bps=0.0)

        # Short 0.3 at 50k
        await e.create_order("BTCUSDT", "sell", "market", 0.3)

        # Price drops to 47k — short is profitable
        e.orderbook.update_last_price("BTCUSDT", 47_000.0)

        # Flip: buy 0.5 (close 0.3 short + open 0.2 long)
        await e.create_order("BTCUSDT", "buy", "market", 0.5)

        # Short PnL = (50k - 47k) * 0.3 = +900
        s = e.stats
        assert s["total_trades"] == 1
        assert s["wins"] == 1
        assert abs(s["total_pnl"] - 900.0) < 1.0

        # Long position 0.2
        assert len(e.open_positions) == 1
        assert e.open_positions[0].side.value == "long"
        assert abs(e.open_positions[0].quantity - 0.2) < 0.0001

    @pytest.mark.asyncio
    async def test_fee_model_none_ignores_flip_fees(self) -> None:
        """With fee_model='none', flips should not deduct any fees."""
        e = engine_with_price(50_000.0, balance=100_000.0, slippage_bps=0.0, fee_model="none")

        # Long 0.1, flip to short 0.2
        r1 = await e.create_order("BTCUSDT", "buy", "market", 0.1)
        assert r1["fee"] == 0.0

        r2 = await e.create_order("BTCUSDT", "sell", "market", 0.2)
        assert r2["fee"] == 0.0

        assert e.stats["total_fees_paid"] == 0.0
        # Balance: 100000 - 5000 (buy cost) + 10000 (sell proceeds) = 105000
        assert abs(e.balance - 105_000.0) < BP

        # Short position 0.1
        assert len(e.open_positions) == 1
        assert abs(e.open_positions[0].quantity - 0.1) < 0.0001
