from __future__ import annotations

from typing import Any

from indicators.calculator import ema, rsi, macd, bollinger_bands, atr


def compute_entry_sl_tp(
    candles: list[dict[str, Any]], symbol: str
) -> dict[str, Any]:
    if not candles or len(candles) < 20:
        return {
            "summary": "Insufficient data.",
            "signals": [],
            "entry": None,
            "stop_loss": None,
            "take_profit": None,
            "confidence": 0,
            "direction": "neutral",
            "rr": None,
        }

    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    vols = [c["volume"] for c in candles]
    latest = candles[-1]
    price = latest["close"]

    # Indicators
    short_ema = ema(closes, 9)
    long_ema = ema(closes, 21)
    rsi_vals = rsi(closes, 14)
    macd_vals = macd(closes)
    bb = bollinger_bands(closes, 20, 2)
    atr_vals = atr(highs, lows, closes, 14)

    rsi_now = rsi_vals[-1] if rsi_vals[-1] is not None else 50
    ema9 = short_ema[-1] if short_ema[-1] is not None else price
    ema21 = long_ema[-1] if long_ema[-1] is not None else price
    bb_upper = bb[-1]["upper"] if bb[-1]["upper"] is not None else price * 1.02
    bb_lower = bb[-1]["lower"] if bb[-1]["lower"] is not None else price * 0.98
    bb_mid = bb[-1]["middle"] if bb[-1]["middle"] is not None else price

    atr_val = atr_vals[-1] if atr_vals[-1] is not None else 0

    # Volume surge
    avg_vol = sum(vols[-20:]) / max(1, min(20, len(vols)))
    vol_surge = vols[-1] > avg_vol * 1.5 if avg_vol > 0 else False

    # Determine direction
    trend_up = ema9 > ema21
    rsi_bullish = rsi_now > 50
    macd_bullish = False
    if len(macd_vals) >= 2 and macd_vals[-1] and macd_vals[-2]:
        m1, m2 = macd_vals[-1], macd_vals[-2]
        if m1["macd"] and m2["macd"] and m1["signal"] and m2["signal"]:
            macd_bullish = m2["macd"] <= m2["signal"] and m1["macd"] > m1["signal"]

    # Score direction (0-100, >60 = long, <40 = short)
    bull_score = 0
    bear_score = 0
    if trend_up:
        bull_score += 25
    else:
        bear_score += 25

    if rsi_bullish:
        bull_score += 15
    else:
        bear_score += 15

    if macd_bullish:
        bull_score += 15
    elif macd_vals[-1] and macd_vals[-2]:
        if (m2 := macd_vals[-2]) and (m1 := macd_vals[-1]):
            if m1["macd"] and m2["macd"] and m1["signal"] and m2["signal"]:
                if m2["macd"] >= m2["signal"] and m1["macd"] < m1["signal"]:
                    bear_score += 15

    if price < bb_lower * 1.01:
        bull_score += 15  # oversold bounce zone
    elif price > bb_upper * 0.99:
        bear_score += 15  # overbought rejection zone

    if vol_surge and trend_up:
        bull_score += 10
    elif vol_surge:
        bear_score += 10

    # Recent candle direction
    body = abs(latest["close"] - latest["open"])
    if body > 0:
        if latest["close"] > latest["open"]:
            bull_score += 10
        else:
            bear_score += 10

    total = bull_score + bear_score
    direction = "long" if bull_score > bear_score else "short" if bear_score > bull_score else "neutral"
    confidence = round(max(bull_score, bear_score) / (total or 1) * 100, 1)

    # Compute entry, SL, TP
    entry = None
    stop_loss = None
    take_profit = None
    rr = None

    if direction == "long" and atr_val > 0:
        entry = round(price, 5)
        stop_loss = round(price - atr_val * 1.5, 5)
        take_profit = round(price + atr_val * 3, 5)
        risk = entry - stop_loss
        reward = take_profit - entry
        rr = round(reward / risk, 2) if risk > 0 else None
    elif direction == "short" and atr_val > 0:
        entry = round(price, 5)
        stop_loss = round(price + atr_val * 1.5, 5)
        take_profit = round(price - atr_val * 3, 5)
        risk = stop_loss - entry
        reward = entry - take_profit
        rr = round(reward / risk, 2) if risk > 0 else None

    signals = []
    if direction == "long":
        signals.append({"type": "bullish", "text": f"Trend, RSI, and momentum favor longs. Entry ~${entry}."})
    elif direction == "short":
        signals.append({"type": "bearish", "text": f"Trend, RSI, and momentum favor shorts. Entry ~${entry}."})
    else:
        signals.append({"type": "info", "text": "Mixed signals. Wait for clearer setup."})

    if confidence > 70:
        signals.append({"type": "info", "text": f"High confidence setup ({confidence}%)."})
    elif confidence > 50:
        signals.append({"type": "info", "text": f"Moderate confidence ({confidence}%). Use smaller size."})
    else:
        signals.append({"type": "warning", "text": f"Low confidence ({confidence}%). Avoid or use strict risk management."})

    if rr and rr > 2:
        signals.append({"type": "bullish", "text": f"Favorable R:R of 1:{rr}."})
    elif rr and rr < 1:
        signals.append({"type": "warning", "text": f"Poor R:R of 1:{rr}. Consider waiting for better entry."})

    summary_parts = []
    summary_parts.append(f"{symbol} setup: {direction.upper()} with {confidence}% confidence.")
    if entry:
        summary_parts.append(f"Entry ${entry}, SL ${stop_loss}, TP ${take_profit} (R:R 1:{rr}).")
    else:
        summary_parts.append("No clear entry at this time.")

    return {
        "summary": " ".join(summary_parts),
        "signals": signals,
        "direction": direction,
        "confidence": confidence,
        "entry": entry,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "rr": rr,
        "atr": round(atr_val, 5),
        "rsi": round(rsi_now, 1),
    }
