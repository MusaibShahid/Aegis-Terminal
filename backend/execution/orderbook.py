from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger()


class OrderBookSimulator:
    """Lightweight order book that tracks bid/ask levels and computes
    realistic fill prices with configurable slippage.

    Maintains the top N levels from depth snapshots.  When no depth data
    is available for a symbol, falls back to a simple last-price model.
    """

    def __init__(self, max_levels: int = 20) -> None:
        self._bids: dict[str, list[list[float]]] = {}  # symbol -> [[price, vol], ...] sorted desc
        self._asks: dict[str, list[list[float]]] = {}  # symbol -> [[price, vol], ...] sorted asc
        self._last_prices: dict[str, float] = {}
        self._max_levels = max_levels

    # ------------------------------------------------------------------
    # Feed depth snapshots
    # ------------------------------------------------------------------

    def update_depth(self, symbol: str, bids: list[list[float]], asks: list[list[float]]) -> None:
        """Replace the order book levels for *symbol* with a new snapshot."""
        self._bids[symbol] = sorted(
            (b for b in bids if b[1] > 0), key=lambda x: -x[0]
        )[: self._max_levels]
        self._asks[symbol] = sorted(
            (a for a in asks if a[1] > 0), key=lambda x: x[0]
        )[: self._max_levels]

        # Update last price from top of book mid
        if self._bids[symbol] and self._asks[symbol]:
            self._last_prices[symbol] = (
                self._bids[symbol][0][0] + self._asks[symbol][0][0]
            ) / 2

    def update_last_price(self, symbol: str, price: float) -> None:
        """Update last known price from a quote or candle close."""
        self._last_prices[symbol] = price

    # ------------------------------------------------------------------
    # Price queries
    # ------------------------------------------------------------------

    def best_bid(self, symbol: str) -> float | None:
        bids = self._bids.get(symbol)
        return bids[0][0] if bids else None

    def best_ask(self, symbol: str) -> float | None:
        asks = self._asks.get(symbol)
        return asks[0][0] if asks else None

    def mid_price(self, symbol: str) -> float | None:
        bid = self.best_bid(symbol)
        ask = self.best_ask(symbol)
        if bid and ask:
            return (bid + ask) / 2
        return self._last_prices.get(symbol)

    def spread(self, symbol: str) -> float | None:
        bid = self.best_bid(symbol)
        ask = self.best_ask(symbol)
        if bid and ask and bid > 0:
            return (ask - bid) / bid
        return None

    # ------------------------------------------------------------------
    # Fill simulation
    # ------------------------------------------------------------------

    def simulate_fill(
        self,
        symbol: str,
        side: str,  # "buy" or "sell"
        quantity: float,
        *,
        limit_price: float | None = None,
        slippage_bps: float = 1.0,  # basis-point slippage (1 bps = 0.01 %)
    ) -> dict[str, Any]:
        """Simulate filling *quantity* of *symbol* on the given *side*.

        Returns a dict with ``filled_price``, ``filled_qty``, ``slippage_bps``,
        ``liquidity``, and ``fully_filled``.

        If limit_price is set, the fill will not execute beyond that price
        (partial fill possible).
        """
        symbol = symbol.upper()
        side_lower = side.lower()

        # Determine the "aggressive" side of the book
        levels = self._asks.get(symbol) if side_lower == "buy" else self._bids.get(symbol)
        best_level = self.best_ask(symbol) if side_lower == "buy" else self.best_bid(symbol)

        # Fall back to last-price + synthetic slippage when no book data
        if not levels or best_level is None:
            last = self._last_prices.get(symbol)
            if last is None:
                return {"filled_price": 0, "filled_qty": 0, "slippage_bps": 0,
                        "liquidity": "unknown", "fully_filled": False,
                        "error": "no_price_data"}
            slippage_factor = 1 + slippage_bps / 10000
            filled_price = last * (slippage_factor if side_lower == "buy" else 1 / slippage_factor)
            return {
                "filled_price": round(filled_price, 8),
                "filled_qty": quantity,
                "slippage_bps": slippage_bps,
                "liquidity": "estimated",
                "fully_filled": True,
            }

        # Volume-weighted average price through the book
        remaining = quantity
        total_cost = 0.0
        total_filled = 0.0
        max_price = limit_price if side_lower == "buy" and limit_price is not None else float("inf")
        min_price = limit_price if side_lower == "sell" and limit_price is not None else -float("inf")

        for price, vol in levels:
            if remaining <= 0:
                break
            # Check limit bounds
            if side_lower == "buy" and price > max_price:
                break
            if side_lower == "sell" and price < min_price:
                break

            fill = min(remaining, vol)
            total_cost += fill * price
            total_filled += fill
            remaining -= fill

        if total_filled == 0:
            return {"filled_price": 0, "filled_qty": 0, "slippage_bps": 0,
                    "liquidity": "none", "fully_filled": False}

        # If book liquidity was exhausted and no limit_price caps the fill,
        # fall back to last-price + synthetic slippage for the remainder.
        # Only for market orders (no limit_price) — limit orders should get
        # staged/partial fills through the book only.
        if remaining > 0 and limit_price is None:
            last = self._last_prices.get(symbol)
            if last is not None:
                slippage_factor = 1 + slippage_bps / 10000
                fallback_price = last * (slippage_factor if side_lower == "buy" else 1 / slippage_factor)
                total_cost += remaining * fallback_price
                total_filled += remaining
                remaining = 0

        avg_price = total_cost / total_filled
        ref_price = best_level
        actual_slippage = abs(avg_price - ref_price) / ref_price * 10000 if ref_price else 0

        return {
            "filled_price": round(avg_price, 8),
            "filled_qty": total_filled,
            "slippage_bps": round(actual_slippage, 2),
            "liquidity": "orderbook",
            "fully_filled": remaining <= 0,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def get_snapshot(self, symbol: str, levels: int = 10) -> dict[str, Any] | None:
        """Return a summary snapshot of the book for *symbol*."""
        bids = self._bids.get(symbol)
        asks = self._asks.get(symbol)
        if not bids or not asks:
            return None
        return {
            "symbol": symbol,
            "bid": bids[0][0] if bids else 0,
            "bid_volume": sum(b[1] for b in bids[:levels]),
            "ask": asks[0][0] if asks else 0,
            "ask_volume": sum(a[1] for a in asks[:levels]),
            "spread_bps": round((asks[0][0] - bids[0][0]) / bids[0][0] * 10000, 2) if bids[0][0] else 0,
            "bid_levels": bids[:levels],
            "ask_levels": asks[:levels],
        }

    def clear(self, symbol: str | None = None) -> None:
        if symbol:
            self._bids.pop(symbol.upper(), None)
            self._asks.pop(symbol.upper(), None)
            self._last_prices.pop(symbol.upper(), None)
        else:
            self._bids.clear()
            self._asks.clear()
            self._last_prices.clear()
