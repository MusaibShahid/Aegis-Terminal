import { useMemo, useRef, useState, useCallback, useEffect } from "react";

import { useFootprintStore } from "../stores/useFootprintStore";
import { useMarketStore } from "../stores/useMarketStore";
import type { FootprintLevel, DeltaSeries, Candle } from "../types";

interface DivergenceSignal {
  type: "bullish" | "bearish";
  price1: number;
  price2: number;
  delta1: number;
  delta2: number;
  idx1: number;
  idx2: number;
}

interface Props {
  symbol: string;
}

type DisplayMode = "bidask" | "delta" | "imbalance" | "intensity";

const DISPLAY_MODES: { value: DisplayMode; label: string; icon: string }[] = [
  { value: "bidask", label: "Bid/Ask", icon: "⇅" },
  { value: "delta", label: "Delta", icon: "Δ" },
  { value: "imbalance", label: "Imbalance", icon: "⚖" },
  { value: "intensity", label: "Intensity", icon: "▤" },
];

export function FootprintChart({ symbol }: Props) {
  const footprint = useFootprintStore((s) => s.footprint[symbol]);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("bidask");
  const [showPOC, setShowPOC] = useState(true);
  const [showValueArea, setShowValueArea] = useState(true);
  const [showSinglePrints, setShowSinglePrints] = useState(true);
  const [showCumDelta, setShowCumDelta] = useState(true);
  const [showDivergence, setShowDivergence] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLevelsLength = useRef(0);

  // Auto-scroll to latest (bottom-most) levels
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    const levels = footprint?.levels;
    if (!levels || levels.length === prevLevelsLength.current) return;
    prevLevelsLength.current = levels.length;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [footprint?.levels, autoScroll]);

  const levels = footprint?.levels ?? [];
  const maxVolume = footprint?.max_volume ?? 1;

  // Cumulative delta data
  const deltaData = useFootprintStore((s) => s.delta[symbol]);
  const deltaSeries = deltaData?.delta_series ?? [];

  // Candles for price reference (use 1m as base interval)
  const candles = useMarketStore((s) => s.candles[`${symbol}:1m`] ?? []);

  // Canvas ref for cumulative delta line chart
  const cumDeltaCanvasRef = useRef<HTMLCanvasElement>(null);

  // Derive cumulative delta trend
  const cumDeltaInfo = useMemo(() => {
    const series = deltaSeries;
    if (series.length === 0) return { current: 0, min: 0, max: 0, slope: "flat", series: [] as DeltaSeries[] };
    const values = series.map((d) => d.cumulative_delta);
    const current = values[values.length - 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    // Slope: compare last 5 points to determine trend
    const recent = series.slice(-5);
    const slope =
      recent.length < 2 ? "flat" :
      recent[recent.length - 1].cumulative_delta > recent[0].cumulative_delta
        ? "rising" :
        recent[recent.length - 1].cumulative_delta < recent[0].cumulative_delta
          ? "falling" : "flat";
    return { current, min, max, slope, series };
  }, [deltaSeries]);

  // Detect divergences between price and cumulative delta
  const divergenceSignals = useMemo((): DivergenceSignal[] => {
    const series = cumDeltaInfo.series;
    if (series.length < 10 || candles.length < 10) return [];

    // Build a map of timestamp → candle for quick lookup
    const candleMap = new Map<number, Candle>();
    for (const c of candles) {
      candleMap.set(c.time, c);
    }

    // For each delta series point, find the closest candle price
    const aligned: { ts: number; delta: number; high: number; low: number; seriesIdx: number }[] = [];
    for (let si = 0; si < series.length; si++) {
      const d = series[si];
      const candle = candleMap.get(d.timestamp);
      if (candle) {
        aligned.push({ ts: d.timestamp, delta: d.cumulative_delta, high: candle.high, low: candle.low, seriesIdx: si });
      }
    }
    if (aligned.length < 8) return [];

    const result: DivergenceSignal[] = [];

    // Find swing highs (peak in price high) and swing lows (valley in price low)
    // Use a simple lookback window of 3 bars on each side
    const windowSize = 3;

    // Price swing highs
    const priceHighs: { idx: number; price: number; delta: number; seriesIdx: number }[] = [];
    for (let i = windowSize; i < aligned.length - windowSize; i++) {
      const high = aligned[i].high;
      let isPeak = true;
      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (j === i) continue;
        if (aligned[j].high > high) { isPeak = false; break; }
      }
      if (isPeak) {
        priceHighs.push({ idx: i, price: high, delta: aligned[i].delta, seriesIdx: aligned[i].seriesIdx });
      }
    }

    // Price swing lows
    const priceLows: { idx: number; price: number; delta: number; seriesIdx: number }[] = [];
    for (let i = windowSize; i < aligned.length - windowSize; i++) {
      const low = aligned[i].low;
      let isValley = true;
      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (j === i) continue;
        if (aligned[j].low < low) { isValley = false; break; }
      }
      if (isValley) {
        priceLows.push({ idx: i, price: low, delta: aligned[i].delta, seriesIdx: aligned[i].seriesIdx });
      }
    }

    // Bearish divergence: price makes higher high, delta makes lower high
    for (let i = 1; i < priceHighs.length; i++) {
      const prev = priceHighs[i - 1];
      const curr = priceHighs[i];
      if (curr.price > prev.price && curr.delta < prev.delta) {
        result.push({
          type: "bearish",
          price1: prev.price,
          price2: curr.price,
          delta1: prev.delta,
          delta2: curr.delta,
          idx1: prev.seriesIdx,
          idx2: curr.seriesIdx,
        });
      }
    }

    // Bullish divergence: price makes lower low, delta makes higher low
    for (let i = 1; i < priceLows.length; i++) {
      const prev = priceLows[i - 1];
      const curr = priceLows[i];
      if (curr.price < prev.price && curr.delta > prev.delta) {
        result.push({
          type: "bullish",
          price1: prev.price,
          price2: curr.price,
          delta1: prev.delta,
          delta2: curr.delta,
          idx1: prev.seriesIdx,
          idx2: curr.seriesIdx,
        });
      }
    }

    return result;
  }, [cumDeltaInfo, candles]);

  // Draw cumulative delta line chart onto canvas
  useEffect(() => {
    const canvas = cumDeltaCanvasRef.current;
    if (!canvas || cumDeltaInfo.series.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const { series, min, max } = cumDeltaInfo;
    const range = Math.max(max - min, 1);
    const padding = { top: 4, bottom: 4, left: 0, right: 0 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Draw horizontal zero line
    const zeroY = padding.top + chartH * (max / range);
    ctx.strokeStyle = "rgba(107, 114, 128, 0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(w - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Build path data
    const points = series.map((d, i) => ({
      x: padding.left + (i / Math.max(series.length - 1, 1)) * chartW,
      y: padding.top + chartH * ((max - d.cumulative_delta) / range),
      val: d.cumulative_delta,
    }));

    // Fill area under line with gradient (green above zero, red below)
    const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    gradient.addColorStop(0, "rgba(34, 197, 94, 0.25)");
    gradient.addColorStop(0.45, "rgba(34, 197, 94, 0.08)");
    gradient.addColorStop(0.55, "rgba(239, 68, 68, 0.08)");
    gradient.addColorStop(1, "rgba(239, 68, 68, 0.25)");

    ctx.beginPath();
    ctx.moveTo(points[0].x, padding.top + chartH);
    for (const p of points) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw the line
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i === 0) ctx.moveTo(points[i].x, points[i].y);
      else ctx.lineTo(points[i].x, points[i].y);
    }

    // Line color based on current trend
    const lineColor =
      cumDeltaInfo.slope === "rising" ? "rgba(34, 197, 94, 0.9)" :
      cumDeltaInfo.slope === "falling" ? "rgba(239, 68, 68, 0.9)" :
      "rgba(107, 114, 128, 0.6)";

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Draw end dot
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw start dot
    const first = points[0];
    ctx.beginPath();
    ctx.arc(first.x, first.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(107, 114, 128, 0.4)";
    ctx.fill();

    // Draw divergence markers if enabled
    if (showDivergence && divergenceSignals.length > 0) {
      const activeDivs = divergenceSignals.filter(
        (d) => d.idx1 >= 0 && d.idx1 < points.length && d.idx2 >= 0 && d.idx2 < points.length
      );
      for (const div of activeDivs) {
        const ax = points[div.idx1].x;
        const ay = points[div.idx1].y;
        const bx = points[div.idx2].x;
        const by = points[div.idx2].y;

        if (div.type === "bearish") {
          // Red triangle markers at both points
          for (const [px, py] of [[ax, ay], [bx, by]]) {
            ctx.beginPath();
            ctx.moveTo(px, py - 6);
            ctx.lineTo(px - 4, py - 1);
            ctx.lineTo(px + 4, py - 1);
            ctx.closePath();
            ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
            ctx.fill();
          }
          // Connecting dashed line
          ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.setLineDash([]);
          // "D" label above the second point
          ctx.font = "bold 9px monospace";
          ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
          ctx.textAlign = "center";
          ctx.fillText("D", bx, by - 10);
        } else {
          // Green triangle markers at both points (pointing down for bullish div)
          for (const [px, py] of [[ax, ay], [bx, by]]) {
            ctx.beginPath();
            ctx.moveTo(px, py + 6);
            ctx.lineTo(px - 4, py + 1);
            ctx.lineTo(px + 4, py + 1);
            ctx.closePath();
            ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
            ctx.fill();
          }
          // Connecting dashed line
          ctx.strokeStyle = "rgba(34, 197, 94, 0.6)";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.setLineDash([]);
          // "D" label below the second point
          ctx.font = "bold 9px monospace";
          ctx.fillStyle = "rgba(34, 197, 94, 0.8)";
          ctx.textAlign = "center";
          ctx.fillText("D", bx, by + 14);
        }
      }
    }

  }, [cumDeltaInfo, showDivergence, divergenceSignals]);

  // Compute POC and value area
  const { pocPrice, vahPrice, valPrice } = useMemo(() => {
    if (levels.length === 0) return { pocPrice: null, vahPrice: null, valPrice: null };

    // POC = level with highest total volume
    let maxV = 0;
    let poc: number | null = null;
    for (const l of levels) {
      const tv = l.total_volume ?? l.bid_volume + l.ask_volume;
      if (tv > maxV) {
        maxV = tv;
        poc = l.price;
      }
    }

    // Value Area = price range containing 70% of total volume centered on POC
    const totalVol = levels.reduce((sum, l) => sum + (l.total_volume ?? l.bid_volume + l.ask_volume), 0);
    const target70 = totalVol * 0.7;
    const sorted = [...levels].sort((a, b) => a.price - b.price);
    const pocIdx = sorted.findIndex((l) => l.price === poc);

    let cumVol = (sorted[pocIdx]?.total_volume ?? sorted[pocIdx]?.bid_volume + sorted[pocIdx]?.ask_volume) || 0;
    let vahIdx = pocIdx;
    let valIdx = pocIdx;

    // Expand outwards from POC
    let up = pocIdx + 1;
    let down = pocIdx - 1;
    while (cumVol < target70 && (up < sorted.length || down >= 0)) {
      const upVol = up < sorted.length ? (sorted[up].total_volume ?? sorted[up].bid_volume + sorted[up].ask_volume) : 0;
      const downVol = down >= 0 ? (sorted[down].total_volume ?? sorted[down].bid_volume + sorted[down].ask_volume) : 0;
      if (upVol >= downVol && up < sorted.length) {
        cumVol += upVol;
        vahIdx = up;
        up++;
      } else if (down >= 0) {
        cumVol += downVol;
        valIdx = down;
        down--;
      } else {
        break;
      }
    }

    return {
      pocPrice: poc,
      vahPrice: sorted[vahIdx]?.price ?? null,
      valPrice: sorted[valIdx]?.price ?? null,
    };
  }, [levels]);

  // Display the most recent levels (up to 100)
  const visibleLevels = useMemo(() => {
    return levels.slice(-100);
  }, [levels]);

  // Max absolute delta across visible levels for histogram scaling
  const maxAbsDelta = useMemo(() => {
    let max = 0;
    for (const l of visibleLevels) {
      const d = Math.abs(l.delta ?? 0);
      if (d > max) max = d;
    }
    return Math.max(max, 0.001);
  }, [visibleLevels]);

  const getBarColor = useCallback(
    (level: FootprintLevel, isBid: boolean) => {
      if (displayMode === "delta") {
        const delta = level.delta ?? 0;
        if (delta > 0) return isBid ? "rgba(34, 197, 94, 0.85)" : "rgba(34, 197, 94, 0.25)";
        if (delta < 0) return isBid ? "rgba(239, 68, 68, 0.25)" : "rgba(239, 68, 68, 0.85)";
        return "rgba(107, 114, 128, 0.3)";
      }
      if (displayMode === "imbalance") {
        const imb = level.imbalance ?? 0;
        if (imb > 0.3) return isBid ? "rgba(34, 197, 94, 0.3)" : "rgba(34, 197, 94, 0.9)";
        if (imb < -0.3) return isBid ? "rgba(239, 68, 68, 0.9)" : "rgba(239, 68, 68, 0.3)";
        return isBid ? "rgba(59, 130, 246, 0.5)" : "rgba(59, 130, 246, 0.5)";
      }
      if (displayMode === "intensity") {
        const intensity = level.intensity ?? 0;
        const alpha = Math.max(0.1, Math.min(1, intensity));
        return isBid ? `rgba(34, 197, 94, ${alpha * 0.8})` : `rgba(239, 68, 68, ${alpha * 0.8})`;
      }
      // bidask mode
      return isBid ? "rgba(34, 197, 94, 0.7)" : "rgba(239, 68, 68, 0.7)";
    },
    [displayMode]
  );

  // Detect single prints (levels where only one side has volume)
  const isSinglePrint = useCallback((level: FootprintLevel) => {
    if (!showSinglePrints) return false;
    const bv = level.bid_volume ?? 0;
    const av = level.ask_volume ?? 0;
    const total = bv + av;
    if (total === 0) return false;
    return (bv === 0 && av > 0) || (av === 0 && bv > 0);
  }, [showSinglePrints]);

  if (levels.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted bg-surface">
        <svg className="w-8 h-8 mb-2 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
        <span className="text-[10px]">Waiting for order flow data...</span>
        <span className="text-[8px] text-text-muted mt-1">Footprint requires tick data</span>
      </div>
    );
  }

  const totalBidVol = levels.reduce((s, l) => s + (l.bid_volume ?? 0), 0);
  const totalAskVol = levels.reduce((s, l) => s + (l.ask_volume ?? 0), 0);
  const totalDelta = totalAskVol - totalBidVol;

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-surface-border/20 shrink-0">
        <div className="flex items-center gap-1">
          {DISPLAY_MODES.map((mode) => (
            <button
              key={mode.value}
              className={`text-[9px] px-1.5 py-0.5 rounded transition-all duration-150 ${
                displayMode === mode.value
                  ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/25"
                  : "text-text-muted hover:text-text-secondary border border-transparent"
              }`}
              onClick={() => setDisplayMode(mode.value)}
              title={mode.label}
            >
              <span className="mr-0.5">{mode.icon}</span>
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            className={`text-[9px] px-1 py-0.5 rounded transition-all ${showPOC ? "text-accent-yellow" : "text-text-muted"}`}
            onClick={() => setShowPOC(!showPOC)}
            title="Toggle POC"
          >
            POC
          </button>
          <button
            className={`text-[9px] px-1 py-0.5 rounded transition-all ${showValueArea ? "text-accent-blue" : "text-text-muted"}`}
            onClick={() => setShowValueArea(!showValueArea)}
            title="Toggle Value Area"
          >
            VA
          </button>
          <button
            className={`text-[9px] px-1 py-0.5 rounded transition-all ${showSinglePrints ? "text-accent-purple" : "text-text-muted"}`}
            onClick={() => setShowSinglePrints(!showSinglePrints)}
            title="Toggle Single Prints"
          >
            SP
          </button>
          <button
            className={`text-[9px] px-1 py-0.5 rounded transition-all ${showCumDelta ? "text-accent-blue" : "text-text-muted"}`}
            onClick={() => setShowCumDelta(!showCumDelta)}
            title="Toggle cumulative delta"
          >
            Δ ↓
          </button>
          <button
            className={`text-[9px] px-1 py-0.5 rounded transition-all ${showDivergence && divergenceSignals.length > 0 ? "text-accent-purple" : "text-text-muted"}`}
            onClick={() => setShowDivergence(!showDivergence)}
            title="Toggle divergence overlay"
          >
            DVG{divergenceSignals.length > 0 ? <sup className="text-[7px]">{divergenceSignals.length}</sup> : ''}
          </button>
          <button
            className={`text-[9px] px-1 py-0.5 rounded transition-all ${autoScroll ? "text-text-secondary" : "text-text-muted"}`}
            onClick={() => setAutoScroll(!autoScroll)}
            title="Auto-scroll to latest"
          >
            {autoScroll ? "⬇" : "⏸"}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 px-2 py-1 text-[9px] font-mono border-b border-surface-border/10 shrink-0">
        <span className="flex items-center gap-1">
          <span className="text-accent-green">▲</span>
          <span className="text-text-secondary">Bid:</span>
          <span className="text-accent-green tabular-nums">{totalBidVol.toFixed(2)}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-accent-red">▼</span>
          <span className="text-text-secondary">Ask:</span>
          <span className="text-accent-red tabular-nums">{totalAskVol.toFixed(2)}</span>
        </span>
        <span className={`flex items-center gap-1 ${totalDelta >= 0 ? "text-accent-green" : "text-accent-red"}`}>
          <span>Δ</span>
          <span className="tabular-nums">
            {totalDelta >= 0 ? "+" : ""}{totalDelta.toFixed(2)}
          </span>
        </span>
        {pocPrice !== null && showPOC && (
          <span className="text-accent-yellow/70">
            POC: <span className="tabular-nums">{pocPrice.toFixed(2)}</span>
          </span>
        )}
      </div>

      {/* Scrollable levels */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none">
        <div className="text-[10px] font-mono">
          {/* Header */}
          <div className="flex items-center text-[8px] text-text-muted uppercase tracking-wider px-2 py-1 border-b border-surface-border/10 sticky top-0 bg-surface/95 backdrop-blur-sm z-10">
            <span className="w-[68px] shrink-0">Price</span>
            <span className="flex-1 flex items-center gap-0.5">
              <span className="w-1/2 text-right text-accent-green/50">Bid</span>
              <span className="w-1/2 text-right text-accent-red/50">Ask</span>
            </span>
            <span className="w-[52px] text-right shrink-0">Delta</span>
            <span className="w-[40px] text-right shrink-0 hidden sm:block">Vol</span>
            <span className="w-[36px] text-right shrink-0 hidden md:block">Imb</span>
          </div>

          {/* Rows */}
          {visibleLevels.map((level, i) => {
            const bv = level.bid_volume ?? 0;
            const av = level.ask_volume ?? 0;
            const tv = level.total_volume ?? bv + av;
            const delta = level.delta ?? av - bv;
            const imb = level.imbalance ?? (tv > 0 ? delta / tv : 0);
            const intensity = level.intensity ?? (maxVolume > 0 ? tv / maxVolume : 0);
            const isPoc = showPOC && pocPrice !== null && level.price === pocPrice;
            const inVA = showValueArea && vahPrice !== null && valPrice !== null && level.price <= vahPrice && level.price >= valPrice;
            const isSp = isSinglePrint(level);

            const bidWidth = (bv / maxVolume) * 100;
            const askWidth = (av / maxVolume) * 100;

            return (
              <div
                key={level.price}
                className={`flex items-center px-2 py-[1.5px] hover:bg-surface-hover transition-colors duration-75 relative ${
                  isPoc ? "bg-accent-yellow/5" : ""
                } ${inVA ? "bg-accent-blue/3" : ""}`}
              >
                {/* Value Area bracket */}
                {showValueArea && vahPrice !== null && level.price === vahPrice && (
                  <div className="absolute left-0 top-0 w-[2px] h-full bg-accent-blue/30" />
                )}
                {showValueArea && valPrice !== null && level.price === valPrice && (
                  <div className="absolute left-0 bottom-0 w-[2px] h-full bg-accent-blue/30" />
                )}

                {/* Price */}
                <span className={`w-[68px] shrink-0 tabular-nums ${
                  isPoc
                    ? "text-accent-yellow font-bold"
                    : isSp
                      ? "text-accent-purple"
                      : delta > 0
                        ? "text-accent-green"
                        : delta < 0
                          ? "text-accent-red"
                          : "text-text-tertiary"
                }`}>
                  {level.price.toFixed(2)}
                  {isPoc && " ●"}
                </span>

                {/* Bid/Ask bars with delta histogram */}
                <div className="flex-1 flex flex-col gap-[1px]">
                  <div className="flex items-center gap-[1px] h-[18px]">
                    {/* Bid bar (right-aligned) */}
                    <div className="w-1/2 h-full flex items-center justify-end pr-0.5 relative">
                      <div
                        className="absolute right-0 top-[2px] bottom-[2px] rounded-l-sm transition-all duration-200"
                        style={{
                          width: `${Math.max(2, bidWidth)}%`,
                          background: getBarColor(level, true),
                          opacity: isPoc ? 1 : 0.85,
                        }}
                      />
                      <span className={`relative z-[1] text-[9px] tabular-nums ${
                        bv > av ? "text-accent-green font-medium" : "text-text-muted"
                      }`}>
                        {bv.toFixed(bv >= 100 ? 0 : bv >= 1 ? 1 : 2)}
                      </span>
                    </div>

                    {/* Ask bar (left-aligned) */}
                    <div className="w-1/2 h-full flex items-center pl-0.5 relative">
                      <div
                        className="absolute left-0 top-[2px] bottom-[2px] rounded-r-sm transition-all duration-200"
                        style={{
                          width: `${Math.max(2, askWidth)}%`,
                          background: getBarColor(level, false),
                          opacity: isPoc ? 1 : 0.85,
                        }}
                      />
                      <span className={`relative z-[1] text-[9px] tabular-nums ${
                        av > bv ? "text-accent-red font-medium" : "text-text-muted"
                      }`}>
                        {av.toFixed(av >= 100 ? 0 : av >= 1 ? 1 : 2)}
                      </span>
                    </div>
                  </div>

                  {/* Delta histogram bar */}
                  <div className="relative h-[3px] mx-0.5 rounded-full overflow-hidden bg-gray-800/25">
                    <div
                      className="absolute top-0 h-full rounded-full transition-all duration-150"
                      style={{
                        ...(delta >= 0
                          ? { left: '50%', width: `${Math.min(50, (Math.abs(delta) / maxAbsDelta) * 50)}%` }
                          : { right: '50%', width: `${Math.min(50, (Math.abs(delta) / maxAbsDelta) * 50)}%` }
                        ),
                        background: delta > 0.5
                          ? 'rgba(34, 197, 94, 0.55)'
                          : delta < -0.5
                            ? 'rgba(239, 68, 68, 0.55)'
                            : 'rgba(107, 114, 128, 0.15)',
                      }}
                    />
                  </div>
                </div>

                {/* Delta */}
                <span className={`w-[52px] text-right tabular-nums text-[9px] shrink-0 ${
                  delta > 0.5
                    ? "text-accent-green"
                    : delta < -0.5
                      ? "text-accent-red"
                      : "text-text-muted"
                }`}>
                  {delta > 0 ? "+" : ""}{delta.toFixed(2)}
                </span>

                {/* Volume */}
                <span className="w-[40px] text-right tabular-nums text-[9px] text-text-muted shrink-0 hidden sm:block">
                  {tv.toFixed(tv >= 100 ? 0 : tv >= 1 ? 1 : 2)}
                </span>

                {/* Imbalance */}
                <span className="w-[36px] text-right tabular-nums text-[9px] shrink-0 hidden md:block">
                  <span className={
                    imb > 0.3 ? "text-accent-green" :
                    imb < -0.3 ? "text-accent-red" :
                    "text-text-muted"
                  }>
                    {(imb * 100).toFixed(0)}%
                  </span>
                </span>

                {/* Intensity dot */}
                <div className="w-[6px] shrink-0 flex items-center justify-center">
                  <div
                    className="w-1 h-1 rounded-full transition-all duration-200"
                    style={{
                      background: intensity > 0.8
                        ? "rgba(251, 191, 36, 0.8)"
                        : intensity > 0.5
                          ? "rgba(251, 191, 36, 0.4)"
                          : "rgba(107, 114, 128, 0.2)",
                      transform: `scale(${Math.max(0.5, intensity)})`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

          {/* Empty state for no visible levels */}
        {visibleLevels.length === 0 && (
          <div className="flex items-center justify-center h-full text-text-muted text-[10px]">
            No levels to display
          </div>
        )}
      </div>

      {/* Cumulative Delta Line Chart — collapsible */}
      {deltaSeries.length >= 2 && (
        <div className="shrink-0 border-t border-surface-border/15 bg-surface">
          {/* Header — click to toggle */}
          <button
            className="flex items-center justify-between w-full px-2 pt-1.5 pb-0.5 hover:bg-surface-hover transition-colors"
            onClick={() => setShowCumDelta(!showCumDelta)}
          >
            <div className="flex items-center gap-2">
              <span className="text-[8px] uppercase tracking-wider text-text-muted font-semibold">Cumulative Δ</span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-mono font-semibold tabular-nums ${
                  cumDeltaInfo.current >= 0 ? "text-accent-green" : "text-accent-red"
                }`}>
                  {cumDeltaInfo.current >= 0 ? "+" : ""}{cumDeltaInfo.current.toFixed(2)}
                </span>
                <span className={`text-[9px] ${
                  cumDeltaInfo.slope === "rising" ? "text-accent-green" :
                  cumDeltaInfo.slope === "falling" ? "text-accent-red" :
                  "text-text-muted"
                }`}>
                  {cumDeltaInfo.slope === "rising" ? "▲" :
                   cumDeltaInfo.slope === "falling" ? "▼" : "▶"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[8px] text-text-muted font-mono">
              <span className="tabular-nums">H: {cumDeltaInfo.max.toFixed(2)}</span>
              <span className="tabular-nums">L: {cumDeltaInfo.min.toFixed(2)}</span>
              <span className="tabular-nums">{deltaSeries.length} pts</span>
            </div>
            <span className={`text-[9px] transition-transform duration-200 ${showCumDelta ? "rotate-0" : "rotate-180"}`}>
              ▼
            </span>
          </button>
          {/* Canvas — collapsible body */}
          <div
            className={`overflow-hidden transition-all duration-200 ease-in-out ${
              showCumDelta ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="px-2 pb-1.5" style={{ height: 60 }}>
              <canvas
                ref={cumDeltaCanvasRef}
                className="w-full h-full rounded"
                style={{ display: "block" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
