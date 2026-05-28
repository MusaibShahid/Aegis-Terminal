"""
Shared pytest fixtures, helpers, and tolerance constants for backend tests.

Available fixtures
------------------
- ``paper_engine`` — basic PaperTradingEngine with default settings.

Available factory functions & helpers
--------------------------------------
- ``levels(*pairs)`` — convert (price, vol, price, vol, …) to nested-list format.
- ``book_with_last(price)`` — OrderBookSimulator with only a last price.
- ``book_with_levels(bids, asks, last_price)`` — OrderBookSimulator with depth.
- ``engine_with_price(...)`` — PaperTradingEngine with a seeded last price.
- ``captured_events()`` — (list, handler) pair that accumulates emitted events.
"""

from __future__ import annotations

from typing import Any

import pytest

from execution.orderbook import OrderBookSimulator
from execution.paper_trading import PaperTradingEngine


# ---------------------------------------------------------------------------
# Tolerance constants
# ---------------------------------------------------------------------------

# Tight tolerance for order-book floating-point assertions
BP_ORDERBOOK: float = 1e-8

# Wider tolerance for paper-trading balance assertions (fee rounding)
BP_BALANCE: float = 0.01


# ---------------------------------------------------------------------------
# Helpers — plain functions (not fixtures), importable from conftest
# ---------------------------------------------------------------------------


def levels(*pairs: float) -> list[list[float]]:
    """Convert ``(price, vol, price, vol, …)`` into nested-list format.

    >>> levels(99.0, 100, 98.0, 200)
    [[99.0, 100], [98.0, 200]]
    """
    it = iter(pairs)
    return [[p, v] for p, v in zip(it, it)]


def book_with_last(price: float = 100.0) -> OrderBookSimulator:
    """Return an ``OrderBookSimulator`` seeded with *only* a last price (no depth)."""
    ob = OrderBookSimulator()
    ob.update_last_price("AAPL", price)
    return ob


def book_with_levels(
    bids: list[list[float]] | None = None,
    asks: list[list[float]] | None = None,
    last_price: float = 100.0,
) -> OrderBookSimulator:
    """Return an ``OrderBookSimulator`` with depth and last price set.

    Defaults to one bid level at 99.0 and one ask level at 101.0 if
    nothing is provided, giving a ~2 % spread.
    """
    ob = OrderBookSimulator()
    ob.update_last_price("AAPL", last_price)
    ob.update_depth(
        "AAPL",
        bids=bids if bids is not None else [[99.0, 100]],
        asks=asks if asks is not None else [[101.0, 100]],
    )
    return ob


def engine_with_price(
    price: float = 50_000.0,
    balance: float = 10_000.0,
    slippage_bps: float = 0.0,
    fee_model: str = "exchange",
    taker_fee_bps: float = 10.0,
    maker_fee_bps: float = 5.0,
) -> PaperTradingEngine:
    """Create a ``PaperTradingEngine`` and seed a last price.

    All keyword arguments default to the same values as the helper used
    throughout ``test_paper_trading.py``.
    """
    e = PaperTradingEngine(
        initial_balance=balance,
        slippage_bps=slippage_bps,
        fee_model=fee_model,
        taker_fee_bps=taker_fee_bps,
        maker_fee_bps=maker_fee_bps,
    )
    e.orderbook.update_last_price("BTCUSDT", price)
    return e


# ---------------------------------------------------------------------------
# Fixtures — automatically available to all test files in the directory
# ---------------------------------------------------------------------------


@pytest.fixture
def paper_engine() -> PaperTradingEngine:
    """Return a ``PaperTradingEngine`` with default settings and *no* price data."""
    return PaperTradingEngine()


def captured_events() -> tuple[list[dict[str, Any]], Any]:
    """Return ``(events_list, handler)`` that accumulates every emitted event.

    Usage
    -----
    .. code:: python

        events, handler = captured_events()
        engine.set_event_handler(handler)
        await engine.create_order(...)
        assert events[0][\"type\"] == \"paper_order_filled\"
    """
    events: list[dict[str, Any]] = []

    async def handler(msg: dict[str, Any]) -> None:
        events.append(msg)

    return events, handler
