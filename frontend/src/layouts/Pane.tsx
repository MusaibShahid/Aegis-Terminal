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

  const showSMC = pane.chartType === "candle";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Toolbar
        pane={pane}
        onUpdatePane={updatePane}
        onAddIndicator={onAddIndicator}
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
      {/* Countdown timer in header */}
      <div className="flex items-center justify-between px-2 py-0.5 border-b border-surface-border/50 shrink-0">
        <div />
        <ChartTimer symbol={pane.symbol} interval={pane.interval} />
      </div>

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
            <DrawingLayer chartRef={chartHandleRef} paneId={pane.id} />
            {showSMC && <SMCOverlay symbol={pane.symbol} interval={pane.interval} />}
            {/* Price-axis countdown widget (bottom-right corner) */}
            {paneCountdown && (
              <div className="absolute bottom-1 right-1 z-30">
                <PriceAxisCountdown
                  symbol={pane.symbol}
                  interval={pane.interval}
                  price={currentPrice || (candles && candles.length > 0 ? candles[candles.length - 1].close : undefined)}
                />
              </div>
            )}
            <CandleTooltip
              visible={tooltipVisible}
              x={tooltipPos.x}
              y={tooltipPos.y}
              candle={tooltipCandle || { time: 0, open: 0, high: 0, low: 0, close: 0, volume: 0 }}
              meta={tooltipMeta}
              remainingSeconds={paneCountdown?.remaining_seconds}
            />
          </>
        )}
      </div>
      <IndicatorPanel pane={pane} />
      <DrawingToolbar />
    </div>
  );
}
