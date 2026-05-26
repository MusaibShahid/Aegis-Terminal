from __future__ import annotations

import math
from typing import Any


def sma(data: list[float], period: int) -> list[float | None]:
    result: list[float | None] = []
    for i in range(len(data)):
        if i < period - 1:
            result.append(None)
        else:
            result.append(sum(data[i - period + 1 : i + 1]) / period)
    return result


def ema(data: list[float], period: int) -> list[float | None]:
    result: list[float | None] = []
    multiplier = 2 / (period + 1)
    for i in range(len(data)):
        if i < period - 1:
            result.append(None)
        elif i == period - 1:
            result.append(sum(data[: i + 1]) / period)
        else:
            val = (data[i] - result[-1]) * multiplier + result[-1]
            result.append(val)
    return result


def wma(data: list[float], period: int) -> list[float | None]:
    result: list[float | None] = []
    weight_sum = period * (period + 1) / 2
    for i in range(len(data)):
        if i < period - 1:
            result.append(None)
        else:
            wsum = sum(data[i - period + 1 + j] * (j + 1) for j in range(period))
            result.append(wsum / weight_sum)
    return result


def hma(data: list[float], period: int) -> list[float | None]:
    half = period // 2
    sqrt_per = int(math.sqrt(period))

    wma_half = wma(data, half)
    wma_full = wma(data, period)

    diff: list[float] = []
    for i in range(len(data)):
        if wma_half[i] is not None and wma_full[i] is not None:
            diff.append(2 * wma_half[i] - wma_full[i])
        else:
            diff.append(0.0)

    result: list[float | None] = []
    for i in range(len(diff)):
        if i < sqrt_per - 1:
            result.append(None)
        else:
            vals = diff[i - sqrt_per + 1 : i + 1]
            result.append(sum(vals) / sqrt_per)
    return result


def rsi(data: list[float], period: int = 14) -> list[float | None]:
    result: list[float | None] = []
    avg_gain, avg_loss = 0.0, 0.0
    for i in range(len(data)):
        if i < period:
            if i > 0:
                change = data[i] - data[i - 1]
                if change > 0:
                    avg_gain += change
                else:
                    avg_loss += abs(change)
            result.append(None)
            continue
        if i == period:
            avg_gain /= period
            avg_loss /= period
        else:
            change = data[i] - data[i - 1]
            avg_gain = (avg_gain * (period - 1) + max(change, 0)) / period
            avg_loss = (avg_loss * (period - 1) + max(-change, 0)) / period
        rs = avg_gain / avg_loss if avg_loss != 0 else 100
        result.append(100 - (100 / (1 + rs)))
    return result


def macd(data: list[float], fast: int = 12, slow: int = 26, signal: int = 9) -> list[dict[str, float | None]]:
    fast_ema = ema(data, fast)
    slow_ema = ema(data, slow)
    macd_line: list[float | None] = []
    for i in range(len(data)):
        if fast_ema[i] is not None and slow_ema[i] is not None:
            macd_line.append(fast_ema[i] - slow_ema[i])
        else:
            macd_line.append(None)

    valid = [v for v in macd_line if v is not None]
    sig = ema(valid, signal) if valid else []
    si = 0
    result: list[dict[str, float | None]] = []
    for i in range(len(macd_line)):
        if macd_line[i] is not None and si < len(sig) and sig[si] is not None:
            result.append({"macd": macd_line[i], "signal": sig[si], "histogram": macd_line[i] - sig[si]})
            si += 1
        else:
            result.append({"macd": None, "signal": None, "histogram": None})
    return result


def stochastic(
    high: list[float], low: list[float], close: list[float], period: int = 14, smooth_k: int = 3, smooth_d: int = 3
) -> list[dict[str, float | None]]:
    raw_k: list[float | None] = []
    for i in range(len(close)):
        if i < period - 1:
            raw_k.append(None)
        else:
            hh = max(high[i - period + 1 : i + 1])
            ll = min(low[i - period + 1 : i + 1])
            raw_k.append(((close[i] - ll) / (hh - ll) * 100) if (hh - ll) != 0 else 50)

    k_vals = [v for v in raw_k if v is not None]
    k_line = ema([0] * (smooth_k - 1) + k_vals, smooth_k) if k_vals else []
    d_line = ema([v for v in k_line if v is not None], smooth_d) if k_line else []

    ki, di = 0, 0
    result: list[dict[str, float | None]] = []
    for i in range(len(raw_k)):
        if raw_k[i] is not None:
            k = k_line[ki] if ki < len(k_line) else None
            d = d_line[di] if di < len(d_line) else None
            result.append({"k": k, "d": d})
            ki += 1
            if k is not None:
                di += 1
        else:
            result.append({"k": None, "d": None})
    return result


def cci(high: list[float], low: list[float], close: list[float], period: int = 20) -> list[float | None]:
    result: list[float | None] = []
    for i in range(len(close)):
        if i < period - 1:
            result.append(None)
        else:
            tp = [(high[j] + low[j] + close[j]) / 3 for j in range(i - period + 1, i + 1)]
            mean_tp = sum(tp) / period
            mad = sum(abs(t - mean_tp) for t in tp) / period
            result.append((tp[-1] - mean_tp) / (0.015 * mad) if mad != 0 else 0)
    return result


def williams_r(high: list[float], low: list[float], close: list[float], period: int = 14) -> list[float | None]:
    result: list[float | None] = []
    for i in range(len(close)):
        if i < period - 1:
            result.append(None)
        else:
            hh = max(high[i - period + 1 : i + 1])
            ll = min(low[i - period + 1 : i + 1])
            result.append(((hh - close[i]) / (hh - ll)) * -100 if (hh - ll) != 0 else -50)
    return result


def atr(high: list[float], low: list[float], close: list[float], period: int = 14) -> list[float | None]:
    result: list[float | None] = []
    tr_values: list[float] = []
    for i in range(len(high)):
        if i == 0:
            result.append(None)
            continue
        tr = max(high[i] - low[i], abs(high[i] - close[i - 1]), abs(low[i] - close[i - 1]))
        tr_values.append(tr)
        if i < period:
            result.append(None)
        elif i == period:
            result.append(sum(tr_values) / period)
        else:
            val = (result[-1] * (period - 1) + tr) / period if result[-1] is not None else None
            result.append(val)
    return result


def bollinger_bands(
    data: list[float], period: int = 20, std_mult: float = 2.0
) -> list[dict[str, float | None]]:
    result: list[dict[str, float | None]] = []
    for i in range(len(data)):
        if i < period - 1:
            result.append({"upper": None, "middle": None, "lower": None})
        else:
            window = data[i - period + 1 : i + 1]
            middle = sum(window) / period
            variance = sum((x - middle) ** 2 for x in window) / period
            std = variance ** 0.5
            result.append({
                "upper": middle + std_mult * std,
                "middle": middle,
                "lower": middle - std_mult * std,
            })
    return result


def keltner_channels(
    high: list[float], low: list[float], close: list[float], period: int = 20, atr_mult: float = 1.5
) -> list[dict[str, float | None]]:
    ema_vals = ema(close, period)
    atr_vals = atr(high, low, close, period)
    result: list[dict[str, float | None]] = []
    for i in range(len(close)):
        e = ema_vals[i]
        a = atr_vals[i] if i < len(atr_vals) else None
        if e is not None and a is not None:
            result.append({"upper": e + atr_mult * a, "middle": e, "lower": e - atr_mult * a})
        else:
            result.append({"upper": None, "middle": None, "lower": None})
    return result


def parabolic_sar(high: list[float], low: list[float], accel_start: float = 0.02, accel_max: float = 0.2) -> list[float | None]:
    result: list[float | None] = [None]
    if len(high) < 2:
        return result

    is_up = high[1] > high[0]
    sar = low[0] if is_up else high[0]
    ep = high[0] if is_up else low[0]
    af = accel_start

    for i in range(1, len(high)):
        sar = sar + af * (ep - sar)

        if is_up:
            sar = min(sar, low[i - 1], low[i - 2] if i >= 2 else low[i - 1])
            if high[i] > ep:
                ep = high[i]
                af = min(af + accel_start, accel_max)
            if sar > low[i]:
                is_up = False
                sar = ep
                ep = low[i]
                af = accel_start
        else:
            sar = max(sar, high[i - 1], high[i - 2] if i >= 2 else high[i - 1])
            if low[i] < ep:
                ep = low[i]
                af = min(af + accel_start, accel_max)
            if sar < high[i]:
                is_up = True
                sar = ep
                ep = high[i]
                af = accel_start

        result.append(round(sar, 2))

    return result


def vwap(
    high: list[float], low: list[float], close: list[float], volume: list[float]
) -> list[float | None]:
    result: list[float | None] = []
    cum_pv = 0.0
    cum_vol = 0.0
    for i in range(len(close)):
        typical = (high[i] + low[i] + close[i]) / 3
        cum_pv += typical * volume[i]
        cum_vol += volume[i]
        result.append(cum_pv / cum_vol if cum_vol > 0 else None)
    return result
