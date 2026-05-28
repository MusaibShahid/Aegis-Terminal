"""Unit tests for OrderBookSimulator — fill simulation edge cases.

Covers:
- Basic buy/sell fills from order book levels
- Partial fill when book lacks liquidity
- Full fill matching exact book volume
- Limit price capping (buy fills stopped, sell fills stopped)
- VWAP correction through multiple levels
- Fallback slippage model (no depth data)
- No price data at all
- Zero-volume levels filtered from book
- Buy/sell symmetry (buy uses asks, sell uses bids)
- Very small/large quantities
"""

from __future__ import annotations

from tests.conftest import BP_ORDERBOOK as BP
from tests.conftest import book_with_last, book_with_levels, levels
from execution.orderbook import OrderBookSimulator


# ================================================================
# Book-level fills
# ================================================================


class TestBookFills:
    def test_buy_fills_at_ask(self) -> None:
        ob = book_with_levels(
            asks=[[101.0, 100], [102.0, 200]],
        )
        r = ob.simulate_fill("AAPL", "buy", 10)
        assert r["filled_qty"] == 10
        assert r["filled_price"] == 101.0  # top ask
        assert r["fully_filled"] is True
        assert r["liquidity"] == "orderbook"

    def test_sell_fills_at_bid(self) -> None:
        ob = book_with_levels(
            bids=[[99.0, 100], [98.0, 200]],
        )
        r = ob.simulate_fill("AAPL", "sell", 10)
        assert r["filled_qty"] == 10
        assert r["filled_price"] == 99.0  # top bid
        assert r["fully_filled"] is True

    def test_buy_through_multiple_ask_levels(self) -> None:
        """Walk through multiple levels when top level lacks liquidity."""
        ob = book_with_levels(
            asks=[[101.0, 50], [102.0, 50], [103.0, 100]],
        )
        r = ob.simulate_fill("AAPL", "buy", 120)
        # VWAP: (50*101 + 50*102 + 20*103) / 120 = (5050+5100+2060)/120 = 12210/120 = 101.75
        expected_vwap = (50 * 101.0 + 50 * 102.0 + 20 * 103.0) / 120
        assert r["filled_qty"] == 120
        assert abs(r["filled_price"] - expected_vwap) < 0.001
        assert r["fully_filled"] is True

    def test_sell_through_multiple_bid_levels(self) -> None:
        ob = book_with_levels(
            bids=[[100.0, 50], [99.0, 50], [98.0, 100]],
        )
        r = ob.simulate_fill("AAPL", "sell", 120)
        # VWAP: (50*100 + 50*99 + 20*98) / 120 = (5000+4950+1960)/120 = 11910/120 = 99.25
        expected_vwap = (50 * 100.0 + 50 * 99.0 + 20 * 98.0) / 120
        assert r["filled_qty"] == 120
        assert abs(r["filled_price"] - expected_vwap) < 0.001
        assert r["fully_filled"] is True


# ================================================================
# Partial fills
# ================================================================


class TestPartialFills:
    def test_partial_fill_buy_falls_back_when_liquidity_exhausted(self) -> None:
        """Market order (no limit_price) falls back to last_price when book runs out."""
        ob = book_with_levels(
            asks=[[101.0, 50]],
        )
        r = ob.simulate_fill("AAPL", "buy", 100)
        # 50 from book @ 101.0, last_price = (99+101)/2 = 100.0, falls back: 50 @ 100.0
        assert r["filled_qty"] == 100  # fully filled via book + fallback
        # Fallback uses default slippage_bps=1.0, so last_price=100.0 * (1+1/10000) = 100.01
        expected_vwap = (50 * 101.0 + 50 * 100.01) / 100  # 100.505
        assert abs(r["filled_price"] - expected_vwap) < 0.001
        assert r["fully_filled"] is True
        assert r["liquidity"] == "orderbook"

    def test_partial_fill_buy_with_limit(self) -> None:
        """Limit order should NOT use fallback — remains partial."""
        ob = book_with_levels(
            asks=[[101.0, 50]],
        )
        r = ob.simulate_fill("AAPL", "buy", 100, limit_price=102.0)
        assert r["filled_qty"] == 50  # only 50 within limit
        assert r["filled_price"] == 101.0
        assert r["fully_filled"] is False
        assert r["liquidity"] == "orderbook"

    def test_partial_fill_sell_falls_back_when_liquidity_exhausted(self) -> None:
        """Market sell order (no limit_price) falls back to last_price when book runs out."""
        ob = book_with_levels(
            bids=[[99.0, 30]],
        )
        r = ob.simulate_fill("AAPL", "sell", 100)
        # 30 from book @ 99.0, last_price = (99+101)/2 = 100.0, falls back: 70 @ 100.0
        assert r["filled_qty"] == 100  # fully filled via book + fallback
        # Fallback uses default slippage_bps=1.0, so last_price=100.0 / (1+1/10000) ≈ 99.990001
        expected_vwap = (30 * 99.0 + 70 * 99.990001) / 100  # ≈ 99.693
        assert abs(r["filled_price"] - expected_vwap) < 0.001
        assert r["fully_filled"] is True

    def test_exact_fill_matches_book_volume(self) -> None:
        ob = book_with_levels(
            asks=[[101.0, 100]],
        )
        r = ob.simulate_fill("AAPL", "buy", 100)
        assert r["filled_qty"] == 100
        assert r["fully_filled"] is True

    def test_buy_falls_back_when_no_asks_on_side(self) -> None:
        """Buying when no asks available falls back to last-price model."""
        ob = book_with_levels(
            bids=[[99.0, 100]],  # only bids, no asks
            asks=[],              # empty asks
        )
        r = ob.simulate_fill("AAPL", "buy", 10)
        # Empty asks triggers fallback to last_price=100.0
        assert r["filled_qty"] == 10
        assert r["fully_filled"] is True
        assert r["liquidity"] == "estimated"


# ================================================================
# Limit price capping
# ================================================================


class TestLimitPrice:
    def test_buy_limit_caps_at_price(self) -> None:
        """Buy with limit_price — should not fill above the limit."""
        ob = book_with_levels(
            asks=[[101.0, 100], [102.0, 100]],
        )
        r = ob.simulate_fill("AAPL", "buy", 150, limit_price=101.50)
        # 100 @ 101.0, then 50 @ 102.0 would exceed limit, so only 100 fills
        assert r["filled_qty"] == 100  # only fills from 101.0 level
        assert r["filled_price"] == 101.0
        assert r["fully_filled"] is False

    def test_sell_limit_caps_at_price(self) -> None:
        """Sell with limit_price — should not fill below the limit."""
        ob = book_with_levels(
            bids=[[99.0, 100], [98.0, 100]],
        )
        r = ob.simulate_fill("AAPL", "sell", 150, limit_price=98.50)
        # 100 @ 99.0, then 50 @ 98.0 would be below limit, so only 100 fills
        assert r["filled_qty"] == 100
        assert r["filled_price"] == 99.0
        assert r["fully_filled"] is False

    def test_limit_price_above_market_no_restriction(self) -> None:
        """Buy limit above best ask — fill unconstrained."""
        ob = book_with_levels(
            asks=[[101.0, 100]],
        )
        r = ob.simulate_fill("AAPL", "buy", 100, limit_price=105.0)
        assert r["filled_qty"] == 100
        assert r["filled_price"] == 101.0
        assert r["fully_filled"] is True

    def test_limit_price_below_market_no_fill(self) -> None:
        """Buy limit below best ask — no fill at all."""
        ob = book_with_levels(
            asks=[[101.0, 100]],
        )
        r = ob.simulate_fill("AAPL", "buy", 100, limit_price=100.0)
        assert r["filled_qty"] == 0
        assert r["fully_filled"] is False


# ================================================================
# Fallback slippage model (no depth data)
# ================================================================


class TestFallbackSlippage:
    def test_buy_fallback_with_slippage(self) -> None:
        ob = book_with_last(100.0)
        r = ob.simulate_fill("AAPL", "buy", 10, slippage_bps=10.0)  # 0.1 %
        expected_price = 100.0 * (1 + 10.0 / 10000)  # 100.10
        assert abs(r["filled_price"] - expected_price) < 0.001
        assert r["filled_qty"] == 10
        assert r["fully_filled"] is True
        assert r["liquidity"] == "estimated"

    def test_sell_fallback_with_slippage(self) -> None:
        ob = book_with_last(100.0)
        r = ob.simulate_fill("AAPL", "sell", 10, slippage_bps=10.0)
        expected_price = 100.0 / (1 + 10.0 / 10000)  # ≈ 99.90
        assert abs(r["filled_price"] - expected_price) < 0.001
        assert r["fully_filled"] is True

    def test_fallback_zero_slippage(self) -> None:
        """With 0 bps slippage, fallback should return last price unchanged."""
        ob = book_with_last(150.0)
        r = ob.simulate_fill("AAPL", "buy", 5, slippage_bps=0.0)
        assert r["filled_price"] == 150.0
        assert r["filled_qty"] == 5
        assert r["fully_filled"] is True

    def test_fallback_without_last_price_errors(self) -> None:
        """No price data at all should return an error."""
        ob = OrderBookSimulator()
        r = ob.simulate_fill("UNKNOWN", "buy", 10)
        assert r["filled_qty"] == 0
        assert r["liquidity"] == "unknown"
        assert "error" in r
        assert r["error"] == "no_price_data"

    def test_fallback_multiple_symbols_independent(self) -> None:
        """Each symbol has its own last price."""
        ob = OrderBookSimulator()
        ob.update_last_price("BTCUSDT", 50_000.0)
        ob.update_last_price("ETHUSDT", 3_000.0)

        r1 = ob.simulate_fill("BTCUSDT", "buy", 1, slippage_bps=0.0)
        assert r1["filled_price"] == 50_000.0

        r2 = ob.simulate_fill("ETHUSDT", "sell", 1, slippage_bps=0.0)
        assert r2["filled_price"] == 3_000.0


# ================================================================
# Edge cases
# ================================================================


class TestEdgeCases:
    def test_zero_quantity(self) -> None:
        ob = book_with_last(100.0)
        r = ob.simulate_fill("AAPL", "buy", 0)
        # Fallback returns quantity=0 (full fill of 0)
        assert r["filled_qty"] == 0
        assert r["fully_filled"] is True

    def test_negative_quantity(self) -> None:
        ob = book_with_last(100.0)
        r = ob.simulate_fill("AAPL", "buy", -5)
        # Fallback returns negative quantity? Let's see... quantity is used as-is
        assert r["filled_qty"] == -5  # not validated downstream
        assert r["fully_filled"] is True

    def test_symbol_is_upper_cased(self) -> None:
        ob = book_with_last(100.0)
        r_lower = ob.simulate_fill("aapl", "buy", 10, slippage_bps=0.0)
        r_upper = ob.simulate_fill("AAPL", "buy", 10, slippage_bps=0.0)
        assert r_lower["filled_price"] == r_upper["filled_price"]

    def test_side_is_case_insensitive(self) -> None:
        ob = book_with_levels(
            asks=[[101.0, 100]],
        )
        r_mixed = ob.simulate_fill("AAPL", "Buy", 10)
        r_lower = ob.simulate_fill("AAPL", "buy", 10)
        assert r_mixed["filled_price"] == r_lower["filled_price"]

    def test_book_slippage_is_computed(self) -> None:
        """When walking through levels, slippage is reported relative to best level."""
        ob = book_with_levels(
            asks=[[101.0, 50], [103.0, 50]],
        )
        r = ob.simulate_fill("AAPL", "buy", 100)  # 50@101 + 50@103
        # avg = (50*101 + 50*103)/100 = 102.0
        # slippage = (102 - 101) / 101 * 10000 ≈ 99.01 bps
        expected_slippage = (102.0 - 101.0) / 101.0 * 10000
        assert abs(r["slippage_bps"] - expected_slippage) < 0.01
        assert r["liquidity"] == "orderbook"

    def test_book_with_only_bids_no_asks_for_sell(self) -> None:
        """Sell should work with only bids present."""
        ob = book_with_levels(
            bids=[[99.0, 100]],
            asks=[],  # no asks — doesn't matter for sell
        )
        r = ob.simulate_fill("AAPL", "sell", 50)
        assert r["filled_qty"] == 50
        assert r["filled_price"] == 99.0

    def test_book_with_only_asks_no_bids_for_buy(self) -> None:
        """Buy should work with only asks present."""
        ob = book_with_levels(
            bids=[],
            asks=[[101.0, 100]],
        )
        r = ob.simulate_fill("AAPL", "buy", 50)
        assert r["filled_qty"] == 50
        assert r["filled_price"] == 101.0

    def test_zero_volume_levels_filtered_by_update_depth(self) -> None:
        """Zero-volume levels should be removed when updating depth."""
        ob = book_with_levels(
            asks=[[101.0, 0], [102.0, 100]],  # first level has 0 vol
        )
        r = ob.simulate_fill("AAPL", "buy", 100)
        # Zero-vol level filtered, so we go straight to 102.0
        assert r["filled_price"] == 102.0
        assert r["filled_qty"] == 100

    def test_large_quantity_no_book_data_falls_back(self) -> None:
        """Large order with only last_price should use fallback (handles huge qty)."""
        ob = book_with_last(100.0)
        r = ob.simulate_fill("AAPL", "buy", 1_000_000.0, slippage_bps=5.0)
        expected_price = 100.0 * (1 + 5.0 / 10000)
        assert abs(r["filled_price"] - expected_price) < 0.001
        assert r["fully_filled"] is True

    def test_mid_price_from_book(self) -> None:
        """mid_price should return the midpoint of best bid/ask when depth is set."""
        ob = book_with_levels(
            bids=[[99.50, 100]],
            asks=[[100.50, 100]],
            last_price=0.0,  # lower than mid, should still use book
        )
        mid = ob.mid_price("AAPL")
        assert abs(mid - 100.0) < 0.01  # (99.5 + 100.5) / 2

    def test_mid_price_falls_back_to_last(self) -> None:
        """mid_price should return last_price when no depth."""
        ob = book_with_last(150.0)
        mid = ob.mid_price("AAPL")
        assert mid == 150.0

    def test_spread_computed_correctly(self) -> None:
        ob = book_with_levels(
            bids=[[99.0, 100]],
            asks=[[101.0, 100]],
        )
        sp = ob.spread("AAPL")
        expected = (101.0 - 99.0) / 99.0  # 0.0202...
        assert abs(sp - expected) < 0.001

    def test_spread_none_when_no_book(self) -> None:
        ob = book_with_last(100.0)
        assert ob.spread("AAPL") is None

    def test_get_snapshot_returns_none_when_no_book(self) -> None:
        ob = book_with_last(100.0)
        assert ob.get_snapshot("AAPL") is None

    def test_get_snapshot_structure(self) -> None:
        ob = book_with_levels(
            bids=[[99.0, 100], [98.0, 200]],
            asks=[[101.0, 150], [102.0, 250]],
        )
        snap = ob.get_snapshot("AAPL", levels=2)
        assert snap is not None
        assert snap["symbol"] == "AAPL"
        assert snap["bid"] == 99.0
        assert snap["ask"] == 101.0
        assert snap["bid_volume"] == 300  # 100 + 200
        assert snap["ask_volume"] == 400  # 150 + 250

    def test_clear_single_symbol(self) -> None:
        ob = book_with_levels()
        ob.clear("AAPL")
        assert ob.mid_price("AAPL") is None

    def test_clear_all_symbols(self) -> None:
        ob = book_with_levels()
        ob.update_last_price("BTCUSDT", 50_000.0)
        ob.clear()
        assert ob.mid_price("AAPL") is None
        assert ob.mid_price("BTCUSDT") is None


# ================================================================
# Deep book benchmark (100+ levels)
# ================================================================


class TestDeepBookBenchmark:
    """Benchmark simulate_fill and update_depth with deep order books.

    These tests build books with 200 bid and 200 ask levels and verify
    that fill operations complete within a reasonable time budget.
    """

    # Reasonable per-call time budget on modern hardware (seconds)
    _TIME_PER_CALL = 5e-6  # 5 µs per call (10k calls ≈ 50 ms)
    _WIDE_BUDGET = 0.5  # absolute ceiling for any single benchmark (500 ms)

    @staticmethod
    def _deep_book(
        n_levels: int = 200,
        spread: float = 2.0,
        step: float = 0.5,
        base_vol: float = 10_000.0,
    ) -> OrderBookSimulator:
        """Build an OrderBookSimulator with *n_levels* of depth on each side.

        Bids descend from 100.0, asks ascend from 102.0.  Volume tapers
        linearly from *base_vol* at the top level to 10 % at the bottom.
        """
        ob = OrderBookSimulator(max_levels=n_levels)
        bids = []
        asks = []
        for i in range(n_levels):
            taper = 1.0 - 0.9 * i / n_levels  # 1.0 … 0.1
            vol = base_vol * taper
            bids.append([100.0 - i * step, vol])
            asks.append([100.0 + spread + i * step, vol])
        ob.update_depth("DEEP", bids, asks)
        return ob

    def test_buy_walks_200_levels(self) -> None:
        """Buy order that walks all 200 ask levels — VWAP correctness."""
        ob = self._deep_book(200)
        # Total ask volume
        total_vol = sum(a[1] for a in ob._asks["DEEP"])
        expected_qty = total_vol

        import time
        t0 = time.perf_counter()
        r = ob.simulate_fill("DEEP", "buy", total_vol)
        elapsed = time.perf_counter() - t0

        assert r["filled_qty"] == expected_qty
        assert r["fully_filled"] is True
        assert r["liquidity"] == "orderbook"
        assert elapsed < self._WIDE_BUDGET, f"buy deep fill took {elapsed:.3f}s"

    def test_sell_walks_200_levels(self) -> None:
        """Sell order that walks all 200 bid levels."""
        ob = self._deep_book(200)
        total_vol = sum(b[1] for b in ob._bids["DEEP"])

        import time
        t0 = time.perf_counter()
        r = ob.simulate_fill("DEEP", "sell", total_vol)
        elapsed = time.perf_counter() - t0

        assert r["filled_qty"] == total_vol
        assert r["fully_filled"] is True
        assert elapsed < self._WIDE_BUDGET

    def test_10k_random_fills(self) -> None:
        """10 000 fills (buy + sell, various sizes) to stress-test the loop."""
        ob = self._deep_book(200)
        n = 10_000

        import time
        t0 = time.perf_counter()
        for i in range(n):
            side = "buy" if i % 2 == 0 else "sell"
            size = (i % 100 + 1) * 100.0
            ob.simulate_fill("DEEP", side, size)
        elapsed = time.perf_counter() - t0
        per_call = elapsed / n

        assert per_call < self._TIME_PER_CALL * 5, (
            f"avg {per_call*1e6:.1f} µs/call (budget {self._TIME_PER_CALL*5*1e6:.0f} µs)"
        )

    def test_limit_price_skim_top_10_levels(self) -> None:
        """Limit buy that only fills top 10 of 200 ask levels (price cap check)."""
        ob = self._deep_book(200)
        # Limit price at the top-10 ask level
        limit_price = 100.0 + 2.0 + 9 * 0.5  # 106.5
        expected_qty = sum(a[1] for a in ob._asks["DEEP"][:10])

        import time
        t0 = time.perf_counter()
        r = ob.simulate_fill("DEEP", "buy", 1_000_000, limit_price=limit_price)
        elapsed = time.perf_counter() - t0

        assert r["filled_qty"] == expected_qty
        assert r["fully_filled"] is False
        assert elapsed < self._WIDE_BUDGET

    def test_update_depth_200_levels(self) -> None:
        """Building a 200-level book via update_depth is fast."""
        n = 200
        ob = OrderBookSimulator(max_levels=n)

        bids = [[100.0 - i * 0.5, 10_000.0] for i in range(n)]
        asks = [[102.0 + i * 0.5, 10_000.0] for i in range(n)]

        import time
        t0 = time.perf_counter()
        for _ in range(100):
            ob.update_depth("DEEP", bids, asks)
        elapsed = time.perf_counter() - t0
        per_call = elapsed / 100

        assert per_call < 0.002, f"update_depth avg {per_call*1e3:.1f} ms (budget 2 ms)"

    def test_mixed_workload(self) -> None:
        """Interleave update_depth and simulate_fill like a real-time engine would."""
        ob = self._deep_book(100)
        import time

        t0 = time.perf_counter()

        # Simulate 1 000 ticks
        for tick in range(1_000):
            # Every 100th tick, refresh depth
            if tick % 100 == 0:
                n = 100
                base = 100.0 + tick * 0.01
                bids = [[base - 1.0 - i * 0.5, 5_000.0] for i in range(n)]
                asks = [[base + 1.0 + i * 0.5, 5_000.0] for i in range(n)]
                ob.update_depth("DEEP", bids, asks)

            # Every tick, fill on both sides
            ob.simulate_fill("DEEP", "buy", 500.0)
            ob.simulate_fill("DEEP", "sell", 300.0)

        elapsed = time.perf_counter() - t0
        per_tick = elapsed / 1_000

        # 2 000 fills + 10 depth refreshes in under 2 seconds
        assert elapsed < 2.0, f"mixed workload took {elapsed:.2f}s (budget 2 s)"
