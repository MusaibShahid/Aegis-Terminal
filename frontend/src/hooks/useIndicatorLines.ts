import { useMemo } from "react";
import type { Candle, IndicatorOverlay, IndicatorOscillator } from "../types";

export type IndicatorLine = { id: string; data: { time: number; value: number }[]; color: string };

function sma(data: number[], period: number): (number | null)[] {
  const r: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { r.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    r.push(sum / period);
  }
  return r;
}

function ema(data: number[], period: number): (number | null)[] {
  const r: (number | null)[] = [];
  const m = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { r.push(null); continue; }
    if (i === period - 1) {
      let s = 0;
      for (let j = 0; j <= i; j++) s += data[j];
      r.push(s / period);
    } else {
      r.push((data[i] - r[r.length - 1]!) * m + r[r.length - 1]!);
    }
  }
  return r;
}

function wma(data: number[], period: number): (number | null)[] {
  const r: (number | null)[] = [];
  const weightSum = period * (period + 1) / 2;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { r.push(null); continue; }
    let wsum = 0;
    for (let j = 0; j < period; j++) wsum += data[i - period + 1 + j] * (j + 1);
    r.push(wsum / weightSum);
  }
  return r;
}

function hma(data: number[], period: number): (number | null)[] {
  const half = Math.max(1, Math.floor(period / 2));
  const sqrtPer = Math.max(1, Math.floor(Math.sqrt(period)));
  const wmaHalf = wma(data, half);
  const wmaFull = wma(data, period);
  const diff: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (wmaHalf[i] !== null && wmaFull[i] !== null) {
      diff.push(2 * wmaHalf[i]! - wmaFull[i]!);
    } else {
      diff.push(0);
    }
  }
  return wma(diff, sqrtPer);
}

function rsi(data: number[], period: number): (number | null)[] {
  const r: (number | null)[] = [];
  let avgG = 0, avgL = 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      if (i > 0) { const c = data[i] - data[i - 1]; if (c > 0) avgG += c; else avgL += Math.abs(c); }
      r.push(null); continue;
    }
    if (i === period) { avgG /= period; avgL /= period; }
    else { const c = data[i] - data[i - 1]; avgG = (avgG * (period - 1) + Math.max(c, 0)) / period; avgL = (avgL * (period - 1) + Math.max(-c, 0)) / period; }
    const rs = avgL === 0 ? 100 : avgG / avgL;
    r.push(100 - 100 / (1 + rs));
  }
  return r;
}

// ─── Supertrend ────────────────────────────────────────────────────────────

type SuperTrendResult = { trend: number[]; upper: (number | null)[]; lower: (number | null)[] };

function supertrend(highs: number[], lows: number[], closes: number[], period: number, multiplier: number): SuperTrendResult {
  const atrVals = atr(highs, lows, closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  const trend: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      upper.push(null);
      lower.push(null);
      trend.push(1);
      continue;
    }

    const atr = atrVals[i] ?? 0;
    const hl2 = (highs[i] + lows[i]) / 2;
    const prevUpper = upper[i - 1] ?? hl2 + multiplier * atr;
    const prevLower = lower[i - 1] ?? hl2 - multiplier * atr;

    const up = hl2 + multiplier * atr;
    const dn = hl2 - multiplier * atr;

    upper.push(closes[i - 1] > prevUpper ? Math.max(up, prevUpper) : up);
    lower.push(closes[i - 1] < prevLower ? Math.min(dn, prevLower) : dn);

    const prevTrend = trend[i - 1] ?? 1;
    if (closes[i] > lower[i]!) {
      trend.push(prevTrend === -1 ? 1 : prevTrend);
    } else {
      trend.push(prevTrend === 1 ? -1 : prevTrend);
    }
  }

  return { trend, upper, lower };
}

// ─── ATR ───────────────────────────────────────────────────────────────────

function atr(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const r: number[] = [];
  let atrVal = 0;
  for (let i = 0; i < highs.length; i++) {
    const tr = i === 0 ? highs[i] - lows[i] : Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    if (i < period) { atrVal += tr; r.push(0); continue; }
    if (i === period) { atrVal /= period; } else { atrVal = (atrVal * (period - 1) + tr) / period; }
    r.push(atrVal);
  }
  return r;
}

// ─── ADX ───────────────────────────────────────────────────────────────────

function adx(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const r: number[] = [];
  const trVals: number[] = [];
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];

  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    trVals.push(tr);
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  trVals.unshift(highs[0] - lows[0]); // first TR

  for (let i = 0; i < highs.length; i++) {
    if (i < period) { r.push(0); continue; }
    let sumTR = 0, sumPlus = 0, sumMinus = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumTR += trVals[j];
      sumPlus += plusDM[j];
      sumMinus += minusDM[j];
    }
    const plusDI = sumTR > 0 ? 100 * sumPlus / sumTR : 0;
    const minusDI = sumTR > 0 ? 100 * sumMinus / sumTR : 0;
    const dx = (plusDI + minusDI) > 0 ? 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI) : 0;
    if (i < period + period - 1) { r.push(dx); continue; }
    // Smooth DX into ADX
    if (i === period + period - 1) {
      let sumDX = 0;
      for (let j = i - period + 1; j <= i; j++) sumDX += r[j] ?? dx;
      r.push(sumDX / period);
    } else {
      r.push(((r[i - 1] ?? dx) * (period - 1) + dx) / period);
    }
  }
  return r;
}

// ─── CRT (Candle Range Theory) ─────────────────────────────────────────────

interface CRTResult {
  levels: { time: number; price: number; type: string; strength: number }[];
}

function crtLevels(candles: Candle[], lookback: number): CRTResult {
  const levels: CRTResult["levels"] = [];

  for (let i = Math.max(1, candles.length - lookback); i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];

    // Turtle Soup (Liquidity Sweep): price breaks previous candle low/high then reverses
    if (c.low < prev.low && c.close > prev.low) {
      levels.push({ time: c.time, price: prev.low, type: "turtle_soup_buy", strength: 2 });
    }
    if (c.high > prev.high && c.close < prev.high) {
      levels.push({ time: c.time, price: prev.high, type: "turtle_soup_sell", strength: 2 });
    }

    // OTE (Optimal Trade Entry) zones — Fibonacci retracement levels
    const range = prev.high - prev.low;
    if (c.low <= prev.low + range * 0.618 || c.high >= prev.high - range * 0.618) {
      const oteLow = prev.low + range * 0.618;
      const oteHigh = prev.high - range * 0.618;
      levels.push({ time: c.time, price: oteLow, type: "ote_buy", strength: 1 });
      levels.push({ time: c.time, price: oteHigh, type: "ote_sell", strength: 1 });
    }
  }

  return { levels };
}

const COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#06b6d4", "#f97316"];

export function useIndicatorLines(
  candles: Candle[],
  indicators: (IndicatorOverlay | IndicatorOscillator)[]
): IndicatorLine[] {
  return useMemo(() => {
    if (!candles.length || !indicators.length) return [];
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const vols = candles.map((c) => c.volume);

    const lines: IndicatorLine[] = [];
    let ci = 0;

    for (const ind of indicators) {
      const color = COLORS[ci % COLORS.length];
      ci++;

      if (ind.type === "sma") {
        const period = ind.params.period || 14;
        const vals = sma(closes, period);
        lines.push({ id: ind.id, data: vals.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color });
      } else if (ind.type === "ema") {
        const period = ind.params.period || 14;
        const vals = ema(closes, period);
        lines.push({ id: ind.id, data: vals.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color });
      } else if (ind.type === "wma" || ind.type === "hma") {
        const period = ind.params.period || 14;
        const vals = ind.type === "wma" ? wma(closes, period) : hma(closes, period);
        lines.push({ id: ind.id, data: vals.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color });
      } else if (ind.type === "vwap") {
        let cumPv = 0, cumVol = 0;
        const vals: (number | null)[] = [];
        for (let i = 0; i < candles.length; i++) {
          const tp = (highs[i] + lows[i] + closes[i]) / 3;
          cumPv += tp * vols[i];
          cumVol += vols[i];
          vals.push(cumVol > 0 ? cumPv / cumVol : null);
        }
        lines.push({ id: ind.id, data: vals.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color });
      } else if (ind.type === "bollinger") {
        const period = ind.params.period || 20;
        const stdM = ind.params.std || 2;
        const middle = sma(closes, period);
        const upper: (number | null)[] = [];
        const lower: (number | null)[] = [];
        for (let i = 0; i < closes.length; i++) {
          if (i < period - 1 || middle[i] === null) { upper.push(null); lower.push(null); continue; }
          let variance = 0;
          for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - middle[i]!) ** 2;
          variance /= period;
          const std = Math.sqrt(variance);
          upper.push(middle[i]! + stdM * std);
          lower.push(middle[i]! - stdM * std);
        }
        lines.push({ id: `${ind.id}_upper`, data: upper.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color: "#ef4444" });
        lines.push({ id: `${ind.id}_middle`, data: middle.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color });
        lines.push({ id: `${ind.id}_lower`, data: lower.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color: "#22c55e" });
      } else if (ind.type === "keltner") {
        const period = ind.params.period || 20;
        const atrMult = ind.params.atr_mult || 1.5;
        const middle = ema(closes, period);
        const atrVals = atr(highs, lows, closes, period);
        const upper: (number | null)[] = [];
        const lower: (number | null)[] = [];
        for (let i = 0; i < closes.length; i++) {
          if (middle[i] === null) { upper.push(null); lower.push(null); continue; }
          upper.push(middle[i]! + atrVals[i] * atrMult);
          lower.push(middle[i]! - atrVals[i] * atrMult);
        }
        lines.push({ id: `${ind.id}_upper`, data: upper.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color: "#ef4444" });
        lines.push({ id: `${ind.id}_middle`, data: middle.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color });
        lines.push({ id: `${ind.id}_lower`, data: lower.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color: "#22c55e" });
      } else if (ind.type === "rsi") {
        const period = ind.params.period || 14;
        const vals = rsi(closes, period);
        const data = vals.map((v, i) => ({ time: candles[i].time, value: v ?? 50 })).filter((_d, i) => vals[i] !== null);
        if (data.length) lines.push({ id: ind.id, data, color });
      } else if (ind.type === "supertrend") {
        const period = ind.params.period || 10;
        const multiplier = ind.params.multiplier || 3;
        const st = supertrend(highs, lows, closes, period, multiplier);
        // SuperTrend line (follows the trend direction)
        const stLine: { time: number; value: number }[] = [];
        for (let i = 0; i < closes.length; i++) {
          if (st.trend[i] === 1 && st.lower[i] !== null) {
            stLine.push({ time: candles[i].time, value: st.lower[i]! });
          } else if (st.trend[i] === -1 && st.upper[i] !== null) {
            stLine.push({ time: candles[i].time, value: st.upper[i]! });
          }
        }
        if (stLine.length) lines.push({ id: ind.id, data: stLine, color });
      } else if (ind.type === "adx") {
        const period = ind.params.period || 14;
        const vals = adx(highs, lows, closes, period);
        const data = vals.map((v, i) => ({ time: candles[i].time, value: v })).filter((d) => d.value !== 0);
        if (data.length) lines.push({ id: ind.id, data, color: "#f97316" });
      } else if (ind.type === "ichimoku") {
        const tenkan = ind.params.tenkan || 9;
        const kijun = ind.params.kijun || 26;
        const spanB = ind.params.span_b || 52;
        const displacement = ind.params.displacement || 26;
        const tenkanVals: (number | null)[] = [];
        const kijunVals: (number | null)[] = [];
        const spanAVals: (number | null)[] = [];
        const spanBVals: (number | null)[] = [];
        // Use running max/min for performance (O(n) instead of O(n*period))
        function rollingHL(data: number[], period: number): { h: number[]; l: number[] } {
          const h: number[] = [];
          const l: number[] = [];
          for (let i = 0; i < data.length; i++) {
            if (i < period - 1) { h.push(0); l.push(0); continue; }
            let hi = data[i], lo = data[i];
            for (let j = i - period + 1; j <= i; j++) {
              if (data[j] > hi) hi = data[j];
              if (data[j] < lo) lo = data[j];
            }
            h.push(hi);
            l.push(lo);
          }
          return { h, l };
        }
        const tenkanHL = rollingHL(highs, tenkan);
        const tenkanLL = rollingHL(lows, tenkan);
        const kijunHL = rollingHL(highs, kijun);
        const kijunLL = rollingHL(lows, kijun);
        for (let i = 0; i < closes.length; i++) {
          tenkanVals.push(i < tenkan - 1 ? null : (tenkanHL.h[i] + tenkanLL.l[i]) / 2);
          kijunVals.push(i < kijun - 1 ? null : (kijunHL.h[i] + kijunLL.l[i]) / 2);
        }
        // Span A (displaced forward)
        for (let i = 0; i < closes.length; i++) {
          const idx = i - displacement;
          if (idx >= 0 && tenkanVals[idx] !== null && kijunVals[idx] !== null) {
            spanAVals.push((tenkanVals[idx]! + kijunVals[idx]!) / 2);
          } else {
            spanAVals.push(null);
          }
        }
        // Span B (displaced forward)
        const spanBHL = rollingHL(highs, spanB);
        const spanBLL = rollingHL(lows, spanB);
        for (let i = 0; i < closes.length; i++) {
          const idx = i - displacement;
          if (idx >= spanB - 1 && idx < closes.length) {
            spanBVals.push((spanBHL.h[idx] + spanBLL.l[idx]) / 2);
          } else {
            spanBVals.push(null);
          }
        }
        lines.push({ id: `${ind.id}_tenkan`, data: tenkanVals.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color: "#3b82f6" });
        lines.push({ id: `${ind.id}_kijun`, data: kijunVals.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color: "#ef4444" });
        lines.push({ id: `${ind.id}_spanA`, data: spanAVals.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color: "#22c55e" });
        lines.push({ id: `${ind.id}_spanB`, data: spanBVals.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color: "#f97316" });
      } else if (ind.type === "parabolic_sar") {
        const step = ind.params.step || 0.02;
        const maxStep = ind.params.max_step || 0.2;
        const psar: (number | null)[] = [lows[0]];
        let af = step;
        let uptrend = closes.length > 1 ? closes[1] > closes[0] : true;
        let ep = uptrend ? highs[0] : lows[0];
        for (let i = 1; i < closes.length; i++) {
          const prev = psar[i - 1]!;
          if (uptrend) {
            psar.push(prev + af * (ep - prev));
            if (highs[i] > ep) { ep = highs[i]; af = Math.min(af + step, maxStep); }
            if (lows[i] < psar[i]!) { uptrend = false; af = step; ep = lows[i]; psar[i] = ep; }
          } else {
            psar.push(prev + af * (ep - prev));
            if (lows[i] < ep) { ep = lows[i]; af = Math.min(af + step, maxStep); }
            if (highs[i] > psar[i]!) { uptrend = true; af = step; ep = highs[i]; psar[i] = ep; }
          }
        }
        lines.push({ id: ind.id, data: psar.map((v, i) => ({ time: candles[i].time, value: v ?? 0 })).filter((d) => d.value !== 0), color });
      } else if (ind.type === "crt") {
        const lookback = ind.params.lookback || 50;
        const result = crtLevels(candles, lookback);
        // CRT levels rendered as horizontal lines
        const crtMap = new Map<string, { time: number; value: number }[]>();
        for (const lvl of result.levels) {
          const key = `${lvl.type}_${lvl.price.toFixed(2)}`;
          if (!crtMap.has(key)) crtMap.set(key, []);
          crtMap.get(key)!.push({ time: lvl.time, value: lvl.price });
        }
        const typeColors: Record<string, string> = {
          turtle_soup_buy: "#22c55e",
          turtle_soup_sell: "#ef4444",
          ote_buy: "#a855f7",
          ote_sell: "#f97316",
        };
        crtMap.forEach((data, key) => {
          const type = key.split("_").slice(0, -1).join("_");
          lines.push({ id: `${ind.id}_${key}`, data, color: typeColors[type] || color });
        });
      }
    }
    return lines;
  }, [candles, indicators]);
}
