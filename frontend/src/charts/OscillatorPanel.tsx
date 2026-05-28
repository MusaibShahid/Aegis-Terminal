import { useMemo } from "react";
import type { Candle, IndicatorOscillator } from "../types";

interface Props {
  candles: Candle[];
  oscillator: IndicatorOscillator;
  height: number;
}

export function OscillatorPanel({ candles, oscillator, height }: Props) {
  const values = useMemo(() => {
    if (!candles.length) return [];
    return computeOscillator(candles, oscillator.type, oscillator.params);
  }, [candles, oscillator.type, oscillator.params]);

  const max = Math.max(...values, 1);
  const min = Math.min(...values, -1);
  const range = Math.max(max - min, 1);

  return (
    <div className="bg-surface/20" style={{ height }}>
      <div className="flex items-center px-2 py-0.5 text-[9px] text-gray-600 font-mono">
        <span className="uppercase">{oscillator.type}</span>
      </div>
      <div className="h-[calc(100%-16px)] flex items-end gap-[1px] px-1 pb-1">
        {values.map((v, i) => {
          const normalized = ((v - min) / range) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0" style={{ height: "100%" }}>
              <div
                className={`w-full rounded-t-sm transition-all duration-100 ${
                  v >= 0 ? "bg-accent-green/40" : "bg-accent-red/40"
                }`}
                style={{ height: `${Math.max(normalized, 2)}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function computeOscillator(candles: Candle[], type: string, _params?: Record<string, number>): number[] {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  switch (type) {
    case "volume":
      return volumes;

    case "rsi": {
      const period = _params?.period || 14;
      const r: number[] = [];
      let avgG = 0, avgL = 0;
      for (let i = 0; i < closes.length; i++) {
        if (i < period) {
          if (i > 0) { const c = closes[i] - closes[i - 1]; if (c > 0) avgG += c; else avgL += Math.abs(c); }
          r.push(50); continue;
        }
        if (i === period) { avgG /= period; avgL /= period; }
        else { const c = closes[i] - closes[i - 1]; avgG = (avgG * (period - 1) + Math.max(c, 0)) / period; avgL = (avgL * (period - 1) + Math.max(-c, 0)) / period; }
        const rs = avgL === 0 ? 100 : avgG / avgL;
        r.push(100 - 100 / (1 + rs));
      }
      return r;
    }

    case "stochastic": {
      const period = _params?.period || 14;
      const r: number[] = [];
      for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) { r.push(50); continue; }
        const high = Math.max(...candles.slice(i - period + 1, i + 1).map((c) => c.high));
        const low = Math.min(...candles.slice(i - period + 1, i + 1).map((c) => c.low));
        const k = high === low ? 50 : ((closes[i] - low) / (high - low)) * 100;
        r.push(k);
      }
      return r;
    }

    case "macd": {
      const fast = _params?.fast || 12;
      const slow = _params?.slow || 26;
      const signal = _params?.signal || 9;
      const fastEma = ema(closes, fast);
      const slowEma = ema(closes, slow);
      const macdLine = fastEma.map((f, i) => f != null && slowEma[i] != null ? f - slowEma[i] : null);
      const signalLine = ema(macdLine.filter((x): x is number => x !== null), signal);
      const histogram: number[] = [];
      let si = 0;
      for (let i = 0; i < macdLine.length; i++) {
        if (macdLine[i] == null) histogram.push(0);
        else if (si < signalLine.length) { histogram.push(macdLine[i] - signalLine[si]); si++; }
        else histogram.push(0);
      }
      return histogram;
    }

    case "obv": {
      const obv: number[] = [0];
      for (let i = 1; i < closes.length; i++) {
        if (closes[i] > closes[i - 1]) obv.push(obv[i - 1] + volumes[i]);
        else if (closes[i] < closes[i - 1]) obv.push(obv[i - 1] - volumes[i]);
        else obv.push(obv[i - 1]);
      }
      return obv;
    }

    case "cmf": {
      const period = _params?.period || 20;
      const r: number[] = [];
      for (let i = 0; i < closes.length; i++) {
        if (i < period) { r.push(0); continue; }
        let mfv = 0, vol = 0;
        for (let j = i - period + 1; j <= i; j++) {
          const c = candles[j];
          const mfm = c.high === c.low ? 0 : ((c.close - c.low) - (c.high - c.close)) / (c.high - c.low);
          mfv += mfm * c.volume;
          vol += c.volume;
        }
        r.push(vol > 0 ? mfv / vol : 0);
      }
      return r;
    }

    case "atr": {
      const period = _params?.period || 14;
      const r: number[] = [];
      let atr = 0;
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const tr = i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close));
        if (i < period) { atr += tr; r.push(0); continue; }
        if (i === period) { atr /= period; } else { atr = (atr * (period - 1) + tr) / period; }
        r.push(atr);
      }
      return r;
    }

    case "cci": {
      const period = _params?.period || 20;
      const r: number[] = [];
      for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) { r.push(0); continue; }
        const tp = candles.slice(i - period + 1, i + 1).map((c) => (c.high + c.low + c.close) / 3);
        const avgTp = tp.reduce((a, b) => a + b, 0) / period;
        const mad = tp.reduce((a, b) => a + Math.abs(b - avgTp), 0) / period;
        r.push(mad === 0 ? 0 : (tp[tp.length - 1] - avgTp) / (0.015 * mad));
      }
      return r;
    }

    case "williams_r": {
      const period = _params?.period || 14;
      const r: number[] = [];
      for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) { r.push(0); continue; }
        const high = Math.max(...candles.slice(i - period + 1, i + 1).map((c) => c.high));
        const low = Math.min(...candles.slice(i - period + 1, i + 1).map((c) => c.low));
        r.push(high === low ? -50 : ((high - closes[i]) / (high - low)) * -100);
      }
      return r;
    }

    default:
      return [];
  }
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
