"""Shared candle-history fetch utility with smart fallback chain.

Fallback order:
  1. MT5       — for mt5-sourced instruments (XAUUSD, XAGUSD, forex, etc.)
  2. Binance   — for crypto / binance-sourced instruments
  3. MT5 agg   — aggregate higher timeframes from MT5 1m data
  4. Mock data — synthetic candles as ultimate fallback

Usage:
    from data_engine.fetch import fetch_history_candles

    candles, source = await fetch_history_candles(
        symbol="XAUUSDT",
        interval="1h",
        limit=500,
        mt5_bridge=some_mt5_bridge_instance,
    )
"""

from __future__ import annotations

from typing import Any

import structlog

from aggregation.candle_aggregator import validate_candle
from connectors.binance import BinanceConnector
from instruments.registry import get_by_symbol
from utils.mock_data import generate_candles

logger = structlog.get_logger()


def validate_candles(
    candles: list[dict[str, Any]],
    symbol: str,
    interval: str,
) -> list[dict[str, Any]]:
    """Stamp symbol + interval on each candle and drop invalid entries.

    Returns a new list containing only valid candles.
    """
    validated: list[dict[str, Any]] = []
    for c in candles:
        c["interval"] = interval
        c["symbol"] = symbol
        errs = validate_candle(c)
        if errs:
            logger.warning(
                "fetch_candle_invalid",
                symbol=symbol,
                interval=interval,
                time=c.get("time"),
                errors=errs,
            )
            continue
        validated.append(c)
    return validated


async def fetch_history_candles(
    symbol: str,
    interval: str,
    limit: int,
    mt5_bridge: Any | None = None,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch historical candles using the smart fallback chain.

    Parameters
    ----------
    symbol : str
        Canonical symbol (e.g. ``\"BTCUSDT\"``, ``\"XAUUSDT\"``).
        Will be uppercased internally.
    interval : str
        Candle interval (e.g. ``\"1m\"``, ``\"1h\"``, ``\"1d\"``).
    limit : int
        Maximum number of candles requested (capped at 1000).
    mt5_bridge : MT5Bridge, optional
        MT5 bridge instance. If ``None`` the MT5 steps are skipped.

    Returns
    -------
    tuple[list[dict], str]
        ``(candles, source)`` where *candles* are validated OHLCV dicts
        (each stamped with ``symbol`` and ``interval``) and *source* is
        one of ``\"mt5\"``, ``\"binance\"``, ``\"mt5_agg\"``, ``\"mock\"``.
    """
    sym = symbol.upper()
    capped = min(limit, 1000)

    # 1. Prefer MT5 for mt5-sourced symbols
    if mt5_bridge:
        mt5_candles = await mt5_bridge.get_history(sym, interval, min(capped, 500))
        if mt5_candles:
            validated = validate_candles(mt5_candles, sym, interval)
            if validated:
                logger.info("fetch_data_source", symbol=sym, source="mt5")
                return validated, "mt5"
            logger.warning("fetch_mt5_all_invalid", symbol=sym, interval=interval)

    # 2. Check instrument source — skip Binance for mt5-only symbols
    inst = get_by_symbol(sym)
    source = inst.get("source") if inst else None

    if source is None or source == "binance":
        try:
            candles = await BinanceConnector.fetch_klines(sym, interval, capped)
            validated = validate_candles(candles, sym, interval)
            if validated:
                logger.info("fetch_data_source", symbol=sym, source="binance")
                return validated, "binance"
        except Exception as exc:
            logger.warning("fetch_binance_fallback", symbol=sym, error=str(exc))
    else:
        logger.info("fetch_skip_binance", symbol=sym, source=source)

    # 3. Aggregate higher TF from MT5 1m candles
    if mt5_bridge and interval != "1m":
        try:
            mt5_1m = await mt5_bridge.get_history(sym, "1m", min(capped * 2, 1000))
            if mt5_1m:
                from aggregation.candle_aggregator import (
                    INTERVAL_SECONDS,
                    align_timestamp,
                )

                target_sec = INTERVAL_SECONDS.get(interval, 3600)
                agg: dict[int, dict[str, Any]] = {}
                for c in sorted(mt5_1m, key=lambda x: x.get("time", 0)):
                    bucket = align_timestamp(c["time"], target_sec)
                    if bucket in agg:
                        e = agg[bucket]
                        e["high"] = max(e["high"], c["high"])
                        e["low"] = min(e["low"], c["low"])
                        e["close"] = c["close"]
                        e["volume"] += c.get("volume", 0)
                    else:
                        agg[bucket] = {
                            "time": bucket,
                            "open": c["open"],
                            "high": c["high"],
                            "low": c["low"],
                            "close": c["close"],
                            "volume": c.get("volume", 0),
                        }
                aggregated = list(agg.values())
                validated = validate_candles(aggregated, sym, interval)
                if validated:
                    logger.info("fetch_data_source", symbol=sym, source="mt5_agg")
                    return validated[-capped:], "mt5_agg"
        except Exception as exc:
            logger.warning("fetch_mt5_agg_failed", symbol=sym, error=str(exc))

    # 4. Ultimate fallback: mock data
    candles = generate_candles(sym, interval, capped)
    logger.warning("fetch_data_source", symbol=sym, source="mock")
    return candles, "mock"
