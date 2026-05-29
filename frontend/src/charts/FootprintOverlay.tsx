import { useEffect, useRef, useState } from "react";
import type { ISeriesApi, IChartApi } from "lightweight-charts";
import { useFootprintStore } from "../stores/useFootprintStore";
import { useMarketStore } from "../stores/useMarketStore";
import { drawBidAsk, drawDelta, drawImbalance, drawCandleVolumes } from "./footprintCanvas";

type OverlayMode = "bidask" | "delta" | "imbalance";

interface Props {
  symbol: string;
  interval: string;
  seriesApi: ISeriesApi<"Candlestick"> | null;
  chartApi?: IChartApi | null;
}

const MODE_OPTIONS: { value: OverlayMode; label: string }[] = [
  { value: "bidask", label: "B/A" },
  { value: "delta", label: "Δ" },
  { value: "imbalance", label: "IMB" },
];

const MODE_LABELS: Record<OverlayMode, string> = {
  bidask: "Bid / Ask Volume",
  delta: "Delta",
  imbalance: "Imbalance",
};

export function FootprintOverlay({ symbol, interval, seriesApi, chartApi }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const footprint = useFootprintStore((s) => s.footprint[symbol]);
  const levels = footprint?.levels ?? [];
  const candles = useMarketStore((s) => s.candles[`${symbol}:${interval}`] ?? []);
  const rafRef = useRef<number>(0);
  const [mode, setMode] = useState<OverlayMode>("bidask");
  const [showPicker, setShowPicker] = useState(false);
  const [showCandleVol, setShowCandleVol] = useState(true);

  // Store data in refs so ResizeObserver isn't recreated on every tick
  const levelsRef = useRef(levels);
  levelsRef.current = levels;
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  // Also store stable API references in refs to prevent stale closures in ResizeObserver callback
  const seriesApiRef = useRef(seriesApi);
  seriesApiRef.current = seriesApi;
  const chartApiRef = useRef(chartApi);
  chartApiRef.current = chartApi;
  // Store mode/toggle in refs too so the ResizeObserver's captured draw() always reads current values
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const showCandleVolRef = useRef(showCandleVol);
  showCandleVolRef.current = showCandleVol;

  // Stable draw function using refs for all asynchronous callbacks
  function draw() {
    const canvas = canvasRef.current;
    const sApi = seriesApiRef.current;
    if (!canvas || !sApi) return;
    const currentLevels = levelsRef.current;
    if (currentLevels.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;

    if (w <= 0 || h <= 0) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const maxShow = 60;
    const visible = currentLevels.slice(-maxShow);

    // --- Compute local maxes for the visible window ---
    let localMaxTotal = 0;
    let localMaxDelta = 0;
    for (const lvl of visible) {
      const tv = (lvl.bid_volume ?? 0) + (lvl.ask_volume ?? 0);
      if (tv > localMaxTotal) localMaxTotal = tv;
      const ad = Math.abs(lvl.delta ?? 0);
      if (ad > localMaxDelta) localMaxDelta = ad;
    }
    if (localMaxTotal === 0) localMaxTotal = 1;
    if (localMaxDelta === 0) localMaxDelta = 1;

    // Bars centered at 75% from left (latest candle draw area)
    const barCenterX = w * 0.75;
    const maxBarPx = Math.min(90, w * 0.22);

    const currentMode = modeRef.current;
    if (currentMode === "bidask") {
      drawBidAsk(ctx, visible, localMaxTotal, maxBarPx, barCenterX, w, h, (price) => {
        try { const c = seriesApiRef.current!.priceToCoordinate(price); return c !== null ? c as number : null; } catch { return null; }
      });
    } else if (currentMode === "delta") {
      drawDelta(ctx, visible, localMaxDelta, maxBarPx, barCenterX, w, h, (price) => {
        try { const c = seriesApiRef.current!.priceToCoordinate(price); return c !== null ? c as number : null; } catch { return null; }
      });
    } else {
      drawImbalance(ctx, visible, maxBarPx, barCenterX, w, h, (price) => {
        try { const c = seriesApiRef.current!.priceToCoordinate(price); return c !== null ? c as number : null; } catch { return null; }
      });
    }

    // Draw volume bars for all visible candles
    const currentCandles = candlesRef.current;
    const cApi = chartApiRef.current;
    if (showCandleVolRef.current && currentCandles.length > 0 && cApi) {
      drawCandleVolumes(ctx, w, h, cApi, currentCandles);
    }
  }

  // ResizeObserver — set up once (no dependencies on tick-changing data)
  useEffect(() => {
    const container = parentRef.current?.parentElement;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    });
    ro.observe(container);

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  // Trigger re-draw when levels, candles, or rendering parameters change
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesApi, chartApi, mode, showCandleVol, levels.length, candles.length]);

  if (levels.length === 0) return null;

  return (
    <div ref={parentRef} className="absolute inset-0 z-20">
      {/* Canvas — no pointer events so it doesn't block chart interaction */}
      <canvas
        ref={canvasRef}
        className="w-full h-full pointer-events-none"
        style={{ display: "block" }}
      />

      {/* Mode selector pill — top-left of the overlay */}
      <div className="absolute top-1.5 left-1.5 z-30 flex items-center gap-0.5 pointer-events-auto">
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setMode(opt.value); setShowPicker(false); }}
            onMouseEnter={() => setShowPicker(true)}
            onMouseLeave={() => setShowPicker(false)}
            className={`px-1.5 py-0.5 text-[9px] font-mono font-semibold rounded border transition-all duration-150 ${
              mode === opt.value
                ? "bg-accent-blue/15 border-accent-blue/30 text-accent-blue"
                : "bg-surface-card/80 border-surface-border text-text-muted hover:text-text-secondary hover:border-surface-border-light"
            }`}
            title={MODE_LABELS[opt.value]}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Hover tooltip showing current mode description */}
      <div
        className={`absolute top-7 left-1.5 z-30 pointer-events-none transition-all duration-150 ${
          showPicker ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
        }`}
      >
        <span className="text-[8px] text-text-tertiary bg-surface-card/80 px-1 py-0.5 rounded">
          {MODE_LABELS[mode]}
        </span>
      </div>

      {/* Candle volume bars toggle — right side */}
      <div className="absolute top-1.5 right-1.5 z-30 pointer-events-auto">
        <button
          onClick={() => setShowCandleVol(!showCandleVol)}
          className={`px-1.5 py-0.5 text-[9px] font-mono font-semibold rounded border transition-all duration-150 ${
            showCandleVol
              ? "bg-accent-blue/20 border-accent-blue/40 text-accent-blue shadow-sm shadow-accent-blue/10"
              : "bg-surface-card/60 border-surface-border text-text-tertiary hover:text-text-secondary hover:border-surface-border-light"
          }`}
          title="Toggle candle volume bars"
        >
          📊 Vol
        </button>
      </div>
    </div>
  );

  // ----- Drawing helpers have been extracted to footprintCanvas.ts -----
}
