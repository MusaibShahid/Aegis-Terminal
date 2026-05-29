import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { Maximize2, Minimize2 } from "lucide-react";

import { PriceAxisCountdown } from "../charts/CandleCountdown";
import { CandleTooltip } from "../charts/CandleTooltip";
import { ChartPane, type ChartPaneHandle, type TradeMarker } from "../charts/ChartPane";
import { ChartTimer } from "../charts/ChartTimer";
import { DeltaChart } from "../charts/DeltaChart";
import { DOMLadder } from "../charts/DOMLadder";
import { DrawingLayer } from "../charts/DrawingLayer";
import { DrawingToolbar } from "../charts/DrawingTools";
import { FeatureGuard } from "../components/FeatureGuard";
import { FootprintChart } from "../charts/FootprintChart";
import { FootprintOverlay } from "../charts/FootprintOverlay";
import { HeatmapChart } from "../charts/HeatmapChart";
import { OscillatorPanel } from "../charts/OscillatorPanel";
import { SMCOverlay } from "../charts/SMCOverlay";
import { VPVRChart } from "../charts/VPVRChart";
import { IndicatorPanel } from "../components/IndicatorPanel";
import { Toolbar } from "../components/Toolbar";
import { useCountdownStore } from "../stores/useCountdownStore";
import { useFootprint } from "../hooks/useAnalytics";
import { useCandleHistory } from "../hooks/useCandleHistory";
import { useChartExport } from "../hooks/useChartExport";
import { useIndicatorLines } from "../hooks/useIndicatorLines";
import { useLayoutStore } from "../stores/useLayoutStore";
import { useMarketStore } from "../stores/useMarketStore";
import { useToolStore } from "../stores/useToolStore";
import { useBotStore } from "../stores/useBotStore";
import { usePaperTradingStore } from "../stores/usePaperTradingStore";
import { PineScriptPanel, computePineScriptValues } from "../components/PineScriptPanel";
import type { CandleMeta, PaneConfig, OscillatorConfig } from "../types";

interface Props {
  pane: PaneConfig;
  containerWidth?: number;
  containerHeight?: number;
}

const CHART_TYPE_LABELS: Record<string, string> = {
  candle: "Candle",
  candle_footprint: "Candle+FP",
  footprint: "Footprint",
  delta: "Delta",
  depth: "DOM",
  heatmap: "Heatmap",
  vpvr: "VPVR",
};

const CHART_TYPES = Object.entries(CHART_TYPE_LABELS).map(([k, v]) => ({
  value: k as PaneConfig["chartType"],
  label: v,
}));

export function Pane({ pane, containerWidth = 800, containerHeight = 600 }: Props) {
  const chartHandleRef = useRef<ChartPaneHandle>(null);
  const [chartReady, setChartReady] = useState<{ chart: IChartApi; series: ISeriesApi<"Candlestick"> } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const updatePane = useLayoutStore((s) => s.updatePane);
  const candles = useMarketStore((s) => s.candles[`${pane.symbol}:${pane.interval}`]);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tooltipCandle, setTooltipCandle] = useState<{ time: number; open: number; high: number; low: number; close: number; volume: number } | null>(null);
  const [tooltipMeta, setTooltipMeta] = useState<CandleMeta | undefined>();
  const [currentPrice, setCurrentPrice] = useState(0);
  const [paneHeight, setPaneHeight] = useState(300);
  const [fullscreenSize, setFullscreenSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  const isToolEnabled = useToolStore((s) => s.isToolEnabled);

  const paneCountdown = useCountdownStore(
    (s) => s.countdowns[`${pane.symbol}:${pane.interval}`]
  );

  const exportToPngRef = useRef(useChartExport().exportToPng);
  exportToPngRef.current = useChartExport().exportToPng;
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Store critical mutable values in refs for stable callbacks
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const paneRef = useRef<HTMLDivElement>(null);
  const updatePaneRef = useRef(updatePane);
  updatePaneRef.current = updatePane;
  const indicatorsRef = useRef(pane.indicators);
  indicatorsRef.current = pane.indicators;
  const oscillatorsRef = useRef(pane.oscillators);
  oscillatorsRef.current = pane.oscillators;
  const paneIdRef = useRef(pane.id);
  paneIdRef.current = pane.id;

  useCandleHistory(pane.symbol, pane.interval);
  useFootprint(pane.symbol);

  const indicatorLines = useIndicatorLines(candles ?? [], pane.indicators);

  // Compute Pine Script indicator values for chart overlays
  const pineScriptOverlays = useMemo(() => {
    if (!candles || candles.length === 0 || !pane.pineScripts?.length) return [];
    return computePineScriptValues(pane.pineScripts, candles);
  }, [candles, pane.pineScripts]);

  // Merge Pine Script overlays into indicator lines for chart rendering
  const allIndicatorLines = useMemo(() => {
    const lines = [...indicatorLines];
    for (const ps of pineScriptOverlays) {
      if (ps.overlay && ps.values.length > 0) {
        const data = ps.values
          .map((v, i) => ({ time: candles?.[i]?.time ?? i * 1000, value: v ?? 0 }))
          .filter((d) => d.value !== 0);
        if (data.length) {
          lines.push({ id: ps.id, data, color: ps.color });
        }
      }
    }
    return lines;
  }, [indicatorLines, pineScriptOverlays, candles]);

  // Bot + Paper trade markers for chart
  const botSignals = useBotStore((s) => s.signals);
  const paperTrades = usePaperTradingStore((s) => s.closedTrades);
  const tradeMarkers: TradeMarker[] = useMemo(() => {
    const markers: TradeMarker[] = [];
    for (const sig of botSignals) {
      if (sig.symbol === pane.symbol) {
        markers.push({ time: sig.time, action: sig.action, price: sig.price, label: sig.bot });
      }
    }
    for (const trade of paperTrades) {
      if (trade.symbol === pane.symbol) {
        markers.push({ time: trade.opened_at, action: trade.side === "long" ? "buy" : "sell", price: trade.entry_price, label: "P" });
        if (trade.closed_at) {
          markers.push({ time: trade.closed_at, action: trade.side === "long" ? "sell" : "buy", price: trade.exit_price, label: "P" });
        }
      }
    }
    return markers.sort((a, b) => a.time - b.time);
  }, [botSignals, paperTrades, pane.symbol]);

  // Track fullscreen window size
  useEffect(() => {
    if (!isFullscreen) return;
    const onResize = () => setFullscreenSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [isFullscreen]);

  // Debounced ResizeObserver — batch dimension updates per animation frame
  useLayoutEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    let rafId: number;
    const ro = new ResizeObserver((entries) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        for (const e of entries) {
          setPaneHeight(e.contentRect.height);
        }
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  // Effective dimensions — use fullscreen window size when fullscreen
  const effectiveWidth = isFullscreen ? fullscreenSize.width : containerWidth;
  const effectiveHeight = isFullscreen ? fullscreenSize.height : containerHeight;
  const effectivePaneHeight = isFullscreen ? fullscreenSize.height : paneHeight;

  // Recompute chart height whenever pane height or number of oscillators/indicators changes
  const oscillatorCount = pane.oscillators.length;
  const indicatorCount = pane.indicators.length;

  const chartHeight = useMemo(() => {
    const toolbarH = 32;
    const indicatorH = indicatorCount > 0 ? 28 : 0;
    const timerH = isToolEnabled("feat_timer") ? 24 : 0;
    const drawingH = isToolEnabled("feat_drawings") ? 28 : 0;
    const oscillatorH = oscillatorCount * 80;
    const totalOverhead = toolbarH + indicatorH + timerH + drawingH + oscillatorH + 1;
    return Math.max(80, effectivePaneHeight - totalOverhead);
  }, [effectivePaneHeight, oscillatorCount, indicatorCount, isToolEnabled]);

  // Stable callbacks using refs
  const onAddIndicator = useCallback((paneId: string, type: string) => {
    const ind = { id: `${type}-${Date.now()}`, type, paneId, params: {} } as any;
    updatePaneRef.current(paneId, { indicators: [...indicatorsRef.current, ind] });
  }, []);

  const onAddOscillator = useCallback((paneId: string, type: string) => {
    const osc: OscillatorConfig = { id: `${type}-${Date.now()}`, type: type as OscillatorConfig["type"], params: {} };
    updatePaneRef.current(paneId, { oscillators: [...oscillatorsRef.current, osc] });
  }, []);

  const removeOscillator = useCallback((oscId: string) => {
    updatePaneRef.current(paneIdRef.current, {
      oscillators: oscillatorsRef.current.filter((o) => o.id !== oscId),
    });
  }, []);

  const onChangeChartType = useCallback(
    (type: PaneConfig["chartType"]) => updatePaneRef.current(paneIdRef.current, { chartType: type }),
    []
  );

  const onExportPng = useCallback(() => {
    const container = chartHandleRef.current?.container;
    if (container) exportToPngRef.current(container, `${pane.symbol}_${pane.interval}.png`);
  }, [pane.symbol, pane.interval]);

  const crosshairHandler = useCallback((price: number, time: number, x?: number, y?: number) => {
    setCurrentPrice(price);
    if (time === 0) {
      setTooltipVisible(false);
      return;
    }
    const currentCandles = candlesRef.current;
    if (!currentCandles) return;
    let closest: typeof currentCandles[0] | null = null;
    let minDist = Infinity;
    for (const c of currentCandles) {
      const dist = Math.abs(c.time - time);
      if (dist < minDist) { minDist = dist; closest = c; }
    }
    if (closest && minDist < 60000) {
      setTooltipCandle(closest);
      if (x !== undefined && y !== undefined) {
        setTooltipPos({ x, y });
      }
      setTooltipVisible(true);
    }
  }, []);

  // Feature gating
  const isCandleChart = pane.chartType === "candle" || pane.chartType === "candle_footprint";
  const showSMC = isCandleChart && isToolEnabled("feat_smc");
  const showDrawings = isToolEnabled("feat_drawings");
  const showCountdown = isToolEnabled("feat_countdown");
  const showTooltip = isToolEnabled("feat_tooltip");
  const showTimer = isToolEnabled("feat_timer");

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Fullscreen keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F11" || (e.key === "f" && e.ctrlKey && e.shiftKey)) {
        e.preventDefault();
        toggleFullscreen();
      }
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFullscreen, toggleFullscreen]);

  return (
    <div
      ref={paneRef}
      className={`pane-cell flex flex-col overflow-hidden ${
        isFullscreen
          ? "fixed inset-0 z-[100] bg-surface border-0 rounded-none"
          : "h-full"
      }`}
    >
      {/* Toolbar row */}
      <div className="flex items-center shrink-0">
        <Toolbar
          pane={pane}
          onUpdatePane={updatePane}
          onAddIndicator={onAddIndicator}
          onAddOscillator={onAddOscillator}
          onChangeChartType={onChangeChartType}
          chartTypes={CHART_TYPES}
          onExportPng={onExportPng}
        />
        <button
          className="h-8 w-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0 border-b border-surface-border"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen (Ctrl+Shift+F)"}
        >
          {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>

      {/* Countdown row */}
      {showTimer && (
        <div className="flex items-center justify-between h-6 px-2 border-b border-surface-border/30 shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-text-muted min-w-0">
            <span className="font-mono truncate">{pane.symbol}</span>
            <span className="text-text-muted shrink-0">•</span>
            <span className="font-mono shrink-0">{pane.interval}</span>
          </div>
          <ChartTimer symbol={pane.symbol} interval={pane.interval} />
        </div>
      )}

      {/* Drawing toolbar */}
      {showDrawings && <DrawingToolbar />}

      {/* Chart area */}
      <div className="flex-1 min-h-0 relative overflow-hidden" ref={chartContainerRef}>
        {pane.chartType === "footprint" && (
          <FeatureGuard feature="tick_classification">
            <FootprintChart symbol={pane.symbol} />
          </FeatureGuard>
        )}
        {pane.chartType === "delta" && <DeltaChart symbol={pane.symbol} />}
        {pane.chartType === "depth" && <DOMLadder symbol={pane.symbol} />}
        {pane.chartType === "heatmap" && (
          <FeatureGuard feature="volume_aggregation">
            <HeatmapChart symbol={pane.symbol} />
          </FeatureGuard>
        )}
        {pane.chartType === "vpvr" && <VPVRChart symbol={pane.symbol} />}
        {isCandleChart && (
          <>
            <ChartPane
              ref={chartHandleRef}
              candles={candles ?? []}
              symbol={pane.symbol}
              interval={pane.interval}
              height={chartHeight}
              containerWidth={effectiveWidth}
              onCrosshairMove={crosshairHandler}
              indicatorLines={allIndicatorLines}
              tradeMarkers={tradeMarkers}
              onChartReady={(chart, series) => setChartReady({ chart, series })}
            />
            {pane.chartType === "candle_footprint" && (
              <FootprintOverlay
                symbol={pane.symbol}
                interval={pane.interval}
                seriesApi={chartReady?.series ?? null}
                chartApi={chartReady?.chart ?? null}
              />
            )}
            {showDrawings && <DrawingLayer chartRef={chartHandleRef} paneId={pane.id} />}
            {showSMC && <SMCOverlay symbol={pane.symbol} interval={pane.interval} />}
            {showCountdown && paneCountdown && (
              <div className="absolute bottom-2 right-2 z-30">
                <PriceAxisCountdown
                  symbol={pane.symbol}
                  interval={pane.interval}
                  price={currentPrice || (candles && candles.length > 0 ? candles[candles.length - 1].close : undefined)}
                />
              </div>
            )}
            {showTooltip && (
              <CandleTooltip
                visible={tooltipVisible}
                x={tooltipPos.x}
                y={tooltipPos.y}
                candle={tooltipCandle || { time: 0, open: 0, high: 0, low: 0, close: 0, volume: 0 }}
                meta={tooltipMeta}
                remainingSeconds={paneCountdown?.remaining_seconds}
              />
            )}
          </>
        )}
      </div>

      {/* Indicator labels row */}
      <IndicatorPanel pane={pane} />

      {/* Pine Script panel */}
      <PineScriptPanel paneId={pane.id} candles={candles ?? []} />

      {/* Oscillator sub-panels */}
      {pane.oscillators.map((osc) => (
        <div key={osc.id} className="border-t border-surface-border/20 relative group">
          <button
            className="absolute top-0.5 right-1 z-10 text-[9px] text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-surface/70 rounded px-1 py-0.5"
            onClick={() => removeOscillator(osc.id)}
          >
            ✕
          </button>
          <OscillatorPanel candles={candles ?? []} oscillator={osc} height={78} width={effectiveWidth} />
        </div>
      ))}
    </div>
  );
}
