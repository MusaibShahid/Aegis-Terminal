from __future__ import annotations

from typing import Any

from indicators.calculator import ema, rsi, macd


def analyze_market(candles: list[dict[str, Any]], symbol: str) -> dict[str, Any]:
    if not candles or len(candles) < 30:
        return {"summary": "Insufficient data for analysis.", "signals": [], "risk": "unknown"}

    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    vols = [c["volume"] for c in candles]
    latest = candles[-1]

    current_price = latest["close"]
    prev_price = candles[-2]["close"]
    change_pct = ((current_price - prev_price) / prev_price) * 100

    # Trend
    short_ema = ema(closes, 9)
    long_ema = ema(closes, 21)
    trend = "neutral"
    if short_ema[-1] is not None and long_ema[-1] is not None:
        if short_ema[-1] > long_ema[-1]:
            trend = "uptrend"
        else:
            trend = "downtrend"

    # RSI
    rsi_vals = rsi(closes, 14)
    rsi_val = rsi_vals[-1] if rsi_vals[-1] is not None else 50
    rsi_signal = "neutral"
    if rsi_val > 70:
        rsi_signal = "overbought"
    elif rsi_val < 30:
        rsi_signal = "oversold"

    # MACD
    macd_vals = macd(closes)
    macd_signal = "neutral"
    if macd_vals[-1] and macd_vals[-2]:
        m1 = macd_vals[-1]
        m2 = macd_vals[-2]
        if m1["macd"] is not None and m2["macd"] is not None and m1["signal"] is not None and m2["signal"] is not None:
            if m2["macd"] <= m2["signal"] and m1["macd"] > m1["signal"]:
                macd_signal = "bullish_cross"
            elif m2["macd"] >= m2["signal"] and m1["macd"] < m1["signal"]:
                macd_signal = "bearish_cross"

    # Volume analysis
    avg_vol = sum(vols[-20:]) / min(20, len(vols))
    vol_surge = vols[-1] > avg_vol * 1.5 if avg_vol > 0 else False

    # Volatility (ATR-based)
    tr_values = []
    for i in range(1, min(15, len(candles))):
        tr = max(
            highs[-i] - lows[-i],
            abs(highs[-i] - closes[-i - 1]),
            abs(lows[-i] - closes[-i - 1]),
        )
        tr_values.append(tr)
    atr_val = sum(tr_values) / len(tr_values) if tr_values else 0
    volatility = "normal"
    if atr_val > current_price * 0.02:
        volatility = "high"
    elif atr_val < current_price * 0.005:
        volatility = "low"

    # Build signals
    signals = []
    if trend == "uptrend" and change_pct > 0:
        signals.append({"type": "bullish", "text": f"Price in uptrend (+{change_pct:.2f}%), momentum favors longs."})
    elif trend == "downtrend" and change_pct < 0:
        signals.append({"type": "bearish", "text": f"Price in downtrend ({change_pct:.2f}%), momentum favors shorts."})

    if rsi_signal == "overbought":
        signals.append({"type": "warning", "text": f"RSI at {rsi_val:.1f} (overbought). Possible reversal or pullback."})
    elif rsi_signal == "oversold":
        signals.append({"type": "info", "text": f"RSI at {rsi_val:.1f} (oversold). Possible bounce opportunity."})

    if macd_signal == "bullish_cross":
        signals.append({"type": "bullish", "text": "MACD bullish cross detected. Momentum shifting up."})
    elif macd_signal == "bearish_cross":
        signals.append({"type": "bearish", "text": "MACD bearish cross detected. Momentum shifting down."})

    if vol_surge:
        signals.append({"type": "info", "text": "Volume surge detected. Increased activity in the market."})

    if volatility == "high":
        signals.append({"type": "warning", "text": "High volatility. Consider wider stops."})
        risk = "high"
    elif volatility == "low":
        risk = "low"
    else:
        risk = "moderate"

    # Summary
    summary_parts = []
    summary_parts.append(f"{symbol} is in a {trend} with {volatility} volatility.")
    summary_parts.append(f"Price: ${current_price:,.2f} ({change_pct:+.2f}%).")
    summary_parts.append(f"RSI: {rsi_val:.1f} ({rsi_signal}).")
    if macd_signal != "neutral":
        summary_parts.append(f"MACD: {macd_signal.replace('_', ' ')}.")

    return {
        "summary": " ".join(summary_parts),
        "signals": signals,
        "trend": trend,
        "rsi": round(rsi_val, 1),
        "volatility": volatility,
        "risk": risk,
        "change_pct": round(change_pct, 2),
    }
