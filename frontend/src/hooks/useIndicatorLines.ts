import { useMemo } from "react";
import type { Candle, IndicatorOverlay, IndicatorOscillator } from "../types";

type IndicatorLine = { id: string; data: { time: number; value: number }[]; color: string };

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
        // Use sma as simplification for now
        const period = ind.params.period || 14;
        const vals = sma(closes, period);
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
      } else if (ind.type === "rsi") {
        const period = ind.params.period || 14;
        const vals = rsi(closes, period);
        const data = vals.map((v, i) => ({ time: candles[i].time, value: v ?? 50 })).filter((d) => d.value !== 50 || vals.some((x) => x !== null));
        if (data.length) lines.push({ id: ind.id, data, color });
      }
    }
    return lines;
  }, [candles, indicators]);
}
