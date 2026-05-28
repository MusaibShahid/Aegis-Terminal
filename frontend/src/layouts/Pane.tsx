import { useCallback, useMemo, useRef, useState } from "react";

import { PriceAxisCountdown } from "../charts/CandleCountdown";
import { CandleTooltip } from "../charts/CandleTooltip";
import { ChartPane, type ChartPaneHandle } from "../charts/ChartPane";
import { ChartTimer } from "../charts/ChartTimer";
import { DeltaChart } from "../charts/DeltaChart";
import { DOMLadder } from "../charts/DOMLadder";
import { DrawingLayer } from "../charts/DrawingLayer";
import { DrawingToolbar } from "../charts/DrawingTools";
import { FeatureGuard } from "../components/FeatureGuard";
import { FootprintChart } from "../charts/FootprintChart";
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
import type { CandleMeta, PaneConfig } from "../types";

interface Props {
  pane: PaneConfig;
  height: number;
  containerWidth?: number;
  resizeKey?: number;
}

const CHART_TYPE_LABELS: Record<string, string> = {
  candle: "Candle",
  footprint: "Footprint",
  delta: "Delta",
  depth: "DOM",
  heatmap: "Heatmap",
  vpvr: "VPVR",
};

export function Pane({ pane, height, containerWidth, resizeKey }: Props) {
  const chartHandleRef = useRef<ChartPaneHandle>(null);
  const updatePane = useLayoutStore((s) => s.updatePane);
  const candles = useMarketStore((s) => s.candles[`${pane.symbol}:${pane.interval}`]);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tooltipCandle, setTooltipCandle] = useState<{ time: number; open: number; high: number; low: number; close: number; volume: number } | null>(null);
  const [tooltipMeta, setTooltipMeta] = useState<CandleMeta | undefined>();
  const [currentPrice, setCurrentPrice] = useState(0);

  const isToolEnabled = useToolStore((s) => s.isToolEnabled);

  const paneCountdown = useCountdownStore(
    (s) => s.countdowns[`${pane.symbol}:${pane.interval}`]
  );

  const { exportToPng } = useChartExport();
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useCandleHistory(pane.symbol, pane.interval);
  useFootprint(pane.symbol);

  const indicatorLines = useIndicatorLines(candles ?? [], pane.indicators);

  const onAddIndicator = useCallback(
    (paneId: string, type: string) => {
      const ind = { id: `${type}-${Date.now()}`, type, paneId, params: {} } as any;
      updatePane(paneId, { indicators: [...pane.indicators, ind] });
    },
    [pane.indicators, updatePane]
  );

  const onAddOscillator = useCallback(
    (paneId: string, type: string) => {
      const osc = { id: `${type}-${Date.now()}`, type, params: {} } as any;
      updatePane(paneId, { oscillators: [...pane.oscillators, osc] });
    },
    [pane.oscillators, updatePane]
  );

  const removeOscillator = useCallback(
    (oscId: string) => {
      updatePane(pane.id, {
        oscillators: pane.oscillators.filter((o) => o.id !== oscId),
      });
    },
    [pane.id, pane.oscillators, updatePane]
  );

  const crosshairHandler = useCallback((price: number, time: number) => {
    setCurrentPrice(price);
    if (!candles) return;
    const c = candles.find((x: any) => x.time === time);
    if (c) {
      setTooltipCandle(c);
      setTooltipPos((prev) => ({ ...prev }));
      setTooltipVisible(true);
    }
  }, [candles]);

  const chartHeight = useMemo(
    () => Math.max(50, height - 32 - (pane.indicators.length > 0 ? 24 : 0) - 28),
    [height, pane.indicators.length]
  );

  // Feature gating using tool store
  const showSMC = pane.chartType === "candle" && isToolEnabled("feat_smc");
  const showDrawings = isToolEnabled("feat_drawings");
  const showCountdown = isToolEnabled("feat_countdown");
  const showTooltip = isToolEnabled("feat_tooltip");
  const showTimer = isToolEnabled("feat_timer");

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface/30">
      <Toolbar
        pane={pane}
        onUpdatePane={updatePane}
        onAddIndicator={onAddIndicator}
        onAddOscillator={onAddOscillator}
        onChangeChartType={(type) => updatePane(pane.id, { chartType: type })}
        chartTypes={Object.entries(CHART_TYPE_LABELS).map(([k, v]) => ({
          value: k as PaneConfig["chartType"],
          label: v,
        }))}
        onExportPng={() => {
          const container = chartHandleRef.current?.container;
          if (container) exportToPng(container, `${pane.symbol}_${pane.interval}.png`);
        }}
      />

      {/* Countdown row — conditionally shown */}
      {showTimer && (
        <div className="flex items-center justify-between h-6 px-2 border-b border-surface-border/30 shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-gray-600 min-w-0">
            <span className="font-mono truncate">{pane.symbol}</span>
            <span className="text-gray-700 shrink-0">•</span>
            <span className="font-mono shrink-0">{pane.interval}</span>
          </div>
          <ChartTimer symbol={pane.symbol} interval={pane.interval} />
        </div>
      )}

      {/* Drawing toolbar — conditionally shown */}
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
        {pane.chartType === "candle" && (
          <>
            <ChartPane
              ref={chartHandleRef}
              candles={candles ?? []}
              symbol={pane.symbol}
              interval={pane.interval}
              height={chartHeight}
              containerWidth={containerWidth}
              resizeKey={resizeKey}
              onCrosshairMove={crosshairHandler}
              indicatorLines={indicatorLines}
            />
            {showDrawings && <DrawingLayer chartRef={chartHandleRef} paneId={pane.id} symbol={pane.symbol} candles={candles ?? []} />}
            {showSMC && <SMCOverlay symbol={pane.symbol} interval={pane.interval} />}
            {/* Price-axis countdown widget (bottom-right corner) */}
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
      <IndicatorPanel pane={pane} onUpdatePane={updatePane} />

      {/* Oscillator sub-panels */}
      {pane.oscillators.map((osc) => (
        <div key={osc.id} className="border-t border-surface-border/30 relative group">
          <button
            className="absolute top-1 right-1 z-10 text-[9px] text-gray-600 hover:text-accent-red opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-surface/50 rounded px-1 py-0.5"
            onClick={() => removeOscillator(osc.id)}
          >
            ✕
          </button>
          <OscillatorPanel candles={candles ?? []} oscillator={osc} height={70} />
        </div>
      ))}
    </div>
  );
}
