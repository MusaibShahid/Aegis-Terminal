import { memo, useEffect, useRef } from "react";
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp, type LineStyle } from "lightweight-charts";
import type { Candle, OscillatorConfig } from "../types";

interface Props {
  candles: Candle[];
  oscillator: OscillatorConfig;
  height: number;
  width?: number;
}

const OSC_LABELS: Record<string, string> = {
  volume: "Volume",
  rsi: "RSI",
  macd: "MACD",
  stochastic: "Stoch",
  cci: "CCI",
  williams_r: "W%R",
  atr: "ATR",
  obv: "OBV",
  cmf: "CMF",
};

export const OscillatorPanel = memo(function OscillatorPanel({ candles, oscillator, height, width }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const initializedRef = useRef(false);

  const heightRef = useRef(height);
  heightRef.current = height;

  // ResizeObserver — set up once, never recreated on candles/oscillator changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      const c = chartRef.current;
      if (!c) return;
      for (const e of entries) {
        c.applyOptions({ width: e.contentRect.width, height: heightRef.current });
      }
    });
    ro.observe(container);

    return () => ro.disconnect();
  }, []);

  // Chart & oscillator rendering
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth || 400,
      height,
      layout: {
        background: { color: "#0d0f1a" },
        textColor: "#3d4059",
        fontSize: 9,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.02)" },
        horzLines: { color: "rgba(255,255,255,0.025)" },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: "rgba(59,130,246,0.2)", width: 1, style: 2 as LineStyle, labelBackgroundColor: "#161928" },
        horzLine: { color: "rgba(59,130,246,0.2)", width: 1, style: 2 as LineStyle, labelBackgroundColor: "#161928" },
      },
      timeScale: {
        visible: false,
        borderColor: "rgba(255,255,255,0.04)",
      },
      rightPriceScale: {
        visible: true,
        borderColor: "rgba(255,255,255,0.04)",
        scaleMargins: { top: 0.08, bottom: 0.1 },
      },
      handleScroll: false,
      handleScale: false,
    });

    chartRef.current = chart;
    initializedRef.current = true;

    const { type, params } = oscillator;
    const data = computeOscillatorData(candles, type, params);

    switch (type) {
      case "volume":
        renderVolume(chart, candles, data);
        break;
      case "rsi":
        renderRSI(chart, data);
        break;
      case "macd":
        renderMACD(chart, data);
        break;
      case "stochastic":
        renderStochastic(chart, data);
        break;
      case "cci":
        renderWithLevels(chart, data, 100, -100);
        break;
      case "williams_r":
        renderWithLevels(chart, data, -20, -80);
        break;
      case "atr":
        renderSingleLine(chart, data, "#f97316");
        break;
      case "obv":
        renderSingleLine(chart, data, "#a855f7");
        break;
      case "cmf":
        renderWithLevels(chart, data, 0.1, -0.1);
        break;
    }

    return () => {
      chart.remove();
      chartRef.current = null;
      initializedRef.current = false;
    };
  }, [candles, oscillator, height]);

  // Update width when prop changes
  useEffect(() => {
    if (chartRef.current && width) {
      chartRef.current.applyOptions({ width });
    }
  }, [width]);

  return (
    <div className="relative w-full h-full">
      {/* Oscillator type label */}
      <div className="absolute top-0.5 left-1.5 z-10 flex items-center gap-1.5">
        <span className="text-[8px] font-mono uppercase tracking-wider text-accent-blue/70 font-semibold bg-surface/60 px-1 py-0.5 rounded">
          {OSC_LABELS[oscillator.type] || oscillator.type}
        </span>
        {Object.keys(oscillator.params).length > 0 && (
          <span className="text-[7px] text-text-muted font-mono hidden sm:inline">
            {Object.entries(oscillator.params).map(([k, v]) => `${k}:${v}`).join(" ")}
          </span>
        )}
      </div>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
});

// ─── Oscillator Computations ───────────────────────────────────────────────

type OscData = number[];

function computeOscillatorData(candles: Candle[], type: string, params: Record<string, number>): OscData {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  switch (type) {
    case "volume":
      return volumes;

    case "rsi": {
      const period = params.period || 14;
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

    case "macd": {
      const fast = params.fast || 12;
      const slow = params.slow || 26;
      const signal = params.signal || 9;
      const fastEma = ema(closes, fast);
      const slowEma = ema(closes, slow);
      const macdLine = fastEma.map((f, i) => f != null && slowEma[i] != null ? f - slowEma[i] : null);
      const signalLine = ema(macdLine.filter((x): x is number => x !== null), signal);
      const result: number[] = [];
      let si = 0;
      for (let i = 0; i < macdLine.length; i++) {
        const ml = macdLine[i];
        if (ml == null) result.push(0);
        else if (si < signalLine.length) { const sv = signalLine[si]; if (sv != null) { result.push(ml - sv); si++; } else result.push(0); }
        else result.push(0);
      }
      return result;
    }

    case "stochastic": {
      const period = params.k_period || 14;
      const dPeriod = params.d_period || 3;
      const k: number[] = [];
      for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) { k.push(50); continue; }
        const high = Math.max(...candles.slice(i - period + 1, i + 1).map((c) => c.high));
        const low = Math.min(...candles.slice(i - period + 1, i + 1).map((c) => c.low));
        k.push(high === low ? 50 : ((closes[i] - low) / (high - low)) * 100);
      }
      // Use D as smoothed version
      const d = sma(k, dPeriod);
      return d.map((v, i) => v ?? k[i]);
    }

    case "cci": {
      const period = params.period || 20;
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
      const period = params.period || 14;
      const r: number[] = [];
      for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) { r.push(0); continue; }
        const high = Math.max(...candles.slice(i - period + 1, i + 1).map((c) => c.high));
        const low = Math.min(...candles.slice(i - period + 1, i + 1).map((c) => c.low));
        r.push(high === low ? -50 : ((high - closes[i]) / (high - low)) * -100);
      }
      return r;
    }

    case "atr": {
      const period = params.period || 14;
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
      const period = params.period || 20;
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

    default:
      return [];
  }
}

// ─── Render Functions ──────────────────────────────────────────────────────

function renderVolume(chart: IChartApi, candles: Candle[], data: OscData) {
  const histogram = chart.addHistogramSeries({
    color: "#4d7cff55",
    priceFormat: { type: "volume" },
    priceScaleId: "right",
  });
  histogram.setData(
    candles.map((c, i) => ({
      time: (c.time / 1000) as UTCTimestamp,
      value: data[i],
      color: c.close >= c.open ? "rgba(0,217,124,0.5)" : "rgba(255,71,87,0.5)",
    }))
  );
  histogram.priceScale().applyOptions({
    scaleMargins: { top: 0.25, bottom: 0 },
  });
}

function renderRSI(chart: IChartApi, data: OscData) {
  const times = getTimesFromData(data.length);

  // Overbought/oversold zones using line series at 70 and 30
  const upperLine = chart.addLineSeries({
    color: "rgba(255,71,87,0.3)",
    lineWidth: 1,
    lineStyle: 2 as LineStyle,
    lastValueVisible: false,
    priceFormat: { type: "custom", formatter: () => "" },
  });
  upperLine.setData(times.map((t, i) => ({ time: t, value: 70 })));

  const lowerLine = chart.addLineSeries({
    color: "rgba(0,217,124,0.3)",
    lineWidth: 1,
    lineStyle: 2 as LineStyle,
    lastValueVisible: false,
    priceFormat: { type: "custom", formatter: () => "" },
  });
  lowerLine.setData(times.map((t, i) => ({ time: t, value: 30 })));

  // Main RSI line
  const line = chart.addLineSeries({
    color: "#a78bfa",
    lineWidth: 1,
    lastValueVisible: true,
    priceFormat: { type: "price", precision: 1, minMove: 0.1 },
  });
  line.setData(times.map((t, i) => ({ time: t, value: data[i] })));

  chart.priceScale("right").applyOptions({
    scaleMargins: { top: 0.08, bottom: 0.1 },
  });
}

function renderMACD(chart: IChartApi, data: OscData) {
  const times = getTimesFromData(data.length);

  // Histogram
  const histogram = chart.addHistogramSeries({
    priceFormat: { type: "price", precision: 4 },
    priceScaleId: "right",
  });
  histogram.setData(
    times.map((t, i) => ({
      time: t,
      value: data[i],
      color: data[i] >= 0 ? "rgba(0,217,124,0.5)" : "rgba(255,71,87,0.5)",
    }))
  );
  histogram.priceScale().applyOptions({
    scaleMargins: { top: 0.3, bottom: 0 },
  });

  // Zero line
  const zeroLine = chart.addLineSeries({
    color: "rgba(255,255,255,0.1)",
    lineWidth: 1,
    lineStyle: 2 as LineStyle,
    lastValueVisible: false,
    priceFormat: { type: "custom", formatter: () => "" },
  });
  zeroLine.setData(times.map((t) => ({ time: t, value: 0 })));
}

function renderStochastic(chart: IChartApi, data: OscData) {
  const times = getTimesFromData(data.length);

  // Overbought/oversold levels
  const upper = chart.addLineSeries({
    color: "rgba(255,71,87,0.25)",
    lineWidth: 1,
    lineStyle: 2 as LineStyle,
    lastValueVisible: false,
    priceFormat: { type: "custom", formatter: () => "" },
  });
  upper.setData(times.map((t) => ({ time: t, value: 80 })));

  const lower = chart.addLineSeries({
    color: "rgba(0,217,124,0.25)",
    lineWidth: 1,
    lineStyle: 2 as LineStyle,
    lastValueVisible: false,
    priceFormat: { type: "custom", formatter: () => "" },
  });
  lower.setData(times.map((t) => ({ time: t, value: 20 })));

  // Main %K line
  const kLine = chart.addLineSeries({
    color: "#4d7cff",
    lineWidth: 1,
    lastValueVisible: true,
    priceFormat: { type: "price", precision: 1, minMove: 0.1 },
  });
  kLine.setData(times.map((t, i) => ({ time: t, value: data[i] })));

  chart.priceScale("right").applyOptions({
    scaleMargins: { top: 0.08, bottom: 0.1 },
  });
}

function renderWithLevels(chart: IChartApi, data: OscData, upperLevel: number, lowerLevel: number) {
  const times = getTimesFromData(data.length);

  // Level lines
  const upper = chart.addLineSeries({
    color: "rgba(255,71,87,0.25)",
    lineWidth: 1,
    lineStyle: 2 as LineStyle,
    lastValueVisible: false,
    priceFormat: { type: "custom", formatter: () => "" },
  });
  upper.setData(times.map((t) => ({ time: t, value: upperLevel })));

  const lower = chart.addLineSeries({
    color: "rgba(0,217,124,0.25)",
    lineWidth: 1,
    lineStyle: 2 as LineStyle,
    lastValueVisible: false,
    priceFormat: { type: "custom", formatter: () => "" },
  });
  lower.setData(times.map((t) => ({ time: t, value: lowerLevel })));

  // Zero line
  const zero = chart.addLineSeries({
    color: "rgba(255,255,255,0.08)",
    lineWidth: 1,
    lineStyle: 2 as LineStyle,
    lastValueVisible: false,
    priceFormat: { type: "custom", formatter: () => "" },
  });
  zero.setData(times.map((t) => ({ time: t, value: 0 })));

  // Main line
  const line = chart.addLineSeries({
    color: "#06b6d4",
    lineWidth: 1,
    lastValueVisible: true,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
  });
  line.setData(times.map((t, i) => ({ time: t, value: data[i] })));

  chart.priceScale("right").applyOptions({
    scaleMargins: { top: 0.08, bottom: 0.1 },
  });
}

function renderSingleLine(chart: IChartApi, data: OscData, color: string) {
  const times = getTimesFromData(data.length);

  const line = chart.addLineSeries({
    color,
    lineWidth: 1,
    lastValueVisible: true,
    priceFormat: { type: "price", precision: 2, minMove: 0.01 },
  });
  line.setData(times.map((t, i) => ({ time: t, value: data[i] })));

  chart.priceScale("right").applyOptions({
    scaleMargins: { top: 0.08, bottom: 0.1 },
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getTimesFromData(length: number): UTCTimestamp[] {
  // Generate synthetic timestamps based on index (timeScale is hidden)
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length }, (_, i) => (now - (length - i)) as UTCTimestamp);
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
      const prev = r[r.length - 1];
      r.push(prev !== null && prev !== undefined ? (data[i] - prev) * m + prev : data[i]);
    }
  }
  return r;
}

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
