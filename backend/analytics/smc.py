from __future__ import annotations

from typing import Any


def find_swing_points(candles: list[dict], lookback: int = 5) -> dict[str, list[dict]]:
    highs = [c.get("high", 0) for c in candles]
    lows = [c.get("low", 0) for c in candles]

    swing_highs = []
    swing_lows = []

    for i in range(lookback, len(candles) - lookback):
        if all(highs[i] >= highs[j] for j in range(i - lookback, i + lookback + 1) if j != i):
            swing_highs.append({"index": i, "price": highs[i], "time": candles[i].get("time")})
        if all(lows[i] <= lows[j] for j in range(i - lookback, i + lookback + 1) if j != i):
            swing_lows.append({"index": i, "price": lows[i], "time": candles[i].get("time")})

    return {"swing_highs": swing_highs, "swing_lows": swing_lows}


def detect_bos(candles: list[dict], swing_points: dict) -> list[dict]:
    results = []
    highs = swing_points.get("swing_highs", [])
    lows = swing_points.get("swing_lows", [])

    if len(highs) >= 2:
        for i in range(1, len(highs)):
            if highs[i]["price"] > highs[i - 1]["price"]:
                results.append({
                    "type": "bos_up",
                    "time": highs[i]["time"],
                    "price": highs[i]["price"],
                    "break_level": highs[i - 1]["price"],
                })

    if len(lows) >= 2:
        for i in range(1, len(lows)):
            if lows[i]["price"] < lows[i - 1]["price"]:
                results.append({
                    "type": "bos_down",
                    "time": lows[i]["time"],
                    "price": lows[i]["price"],
                    "break_level": lows[i - 1]["price"],
                })

    return results


def detect_choch(candles: list[dict], swing_points: dict) -> list[dict]:
    results = []
    highs = swing_points.get("swing_highs", [])
    lows = swing_points.get("swing_lows", [])

    if len(highs) >= 2 and len(lows) >= 2:
        last_h = highs[-1]
        prev_h = highs[-2]
        last_l = lows[-1]
        prev_l = lows[-2]

        if last_h["price"] < prev_h["price"] and last_l["price"] < prev_l["price"]:
            results.append({"type": "choch_down", "time": last_l["time"], "price": last_l["price"]})
        elif last_h["price"] > prev_h["price"] and last_l["price"] > prev_l["price"]:
            results.append({"type": "choch_up", "time": last_h["time"], "price": last_h["price"]})

    return results


def detect_fvg(candles: list[dict]) -> list[dict]:
    results = []
    for i in range(1, len(candles) - 1):
        prev = candles[i - 1]
        curr = candles[i]
        next_c = candles[i + 1]

        if curr["low"] > prev["high"]:
            gap_top = curr["low"]
            gap_bot = prev["high"]
            if gap_top > gap_bot:
                results.append({
                    "type": "fvg_up",
                    "time": curr["time"],
                    "gap_high": gap_top,
                    "gap_low": gap_bot,
                    "midpoint": round((gap_top + gap_bot) / 2, 2),
                })

        if curr["high"] < prev["low"]:
            gap_top = prev["low"]
            gap_bot = curr["high"]
            if gap_top > gap_bot:
                results.append({
                    "type": "fvg_down",
                    "time": curr["time"],
                    "gap_high": gap_top,
                    "gap_low": gap_bot,
                    "midpoint": round((gap_top + gap_bot) / 2, 2),
                })

    return results


def detect_order_blocks(candles: list[dict], swing_points: dict) -> list[dict]:
    results = []
    lows = swing_points.get("swing_lows", [])
    highs = swing_points.get("swing_highs", [])

    for sl in lows[-10:]:
        idx = sl["index"]
        if idx > 0 and idx < len(candles):
            ob_candle = candles[idx - 1]
            results.append({
                "type": "order_block_buy",
                "time": ob_candle["time"],
                "high": ob_candle["high"],
                "low": ob_candle["low"],
                "is_bullish": ob_candle["close"] > ob_candle["open"],
            })

    for sh in highs[-10:]:
        idx = sh["index"]
        if idx > 0 and idx < len(candles):
            ob_candle = candles[idx - 1]
            results.append({
                "type": "order_block_sell",
                "time": ob_candle["time"],
                "high": ob_candle["high"],
                "low": ob_candle["low"],
                "is_bullish": ob_candle["close"] > ob_candle["open"],
            })

    return results


def detect_liquidity_sweeps(candles: list[dict], swing_points: dict) -> list[dict]:
    results = []
    highs = swing_points.get("swing_highs", [])
    lows = swing_points.get("swing_lows", [])

    for sh in highs[-5:]:
        idx = sh["index"]
        if idx + 1 < len(candles):
            if candles[idx + 1]["close"] < candles[idx]["low"]:
                results.append({
                    "type": "liquidity_sweep_sell",
                    "time": candles[idx + 1]["time"],
                    "swept_high": sh["price"],
                    "price": candles[idx + 1]["close"],
                })

    for sl in lows[-5:]:
        idx = sl["index"]
        if idx + 1 < len(candles):
            if candles[idx + 1]["close"] > candles[idx]["high"]:
                results.append({
                    "type": "liquidity_sweep_buy",
                    "time": candles[idx + 1]["time"],
                    "swept_low": sl["price"],
                    "price": candles[idx + 1]["close"],
                })

    return results
