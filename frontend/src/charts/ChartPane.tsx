import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { createChart, type IChartApi, type ISeriesApi, type CandlestickSeriesPartialOptions, type UTCTimestamp, type LineSeriesPartialOptions, type SeriesMarker } from "lightweight-charts";
import type { Candle } from "../types";
import { useAutoFit } from "../hooks/useAutoFit";

export interface ChartPaneHandle {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  container: HTMLDivElement | null;
}

export interface TradeMarker {
  time: number;
  action: "buy" | "sell";
  price: number;
  label?: string;
}

interface Props {
  candles: Candle[];
  symbol: string;
  interval: string;
  height: number;
  containerWidth?: number;
  resizeKey?: number;
  onCrosshairMove?: (price: number, time: number, x?: number, y?: number) => void;
  indicatorLines?: { id: string; data: { time: number; value: number }[]; color: string }[];
  tradeMarkers?: TradeMarker[];
  onChartReady?: (chart: IChartApi, series: ISeriesApi<"Candlestick">) => void;
}

export const ChartPane = forwardRef<ChartPaneHandle, Props>(function ChartPane(
  { candles, height, containerWidth, resizeKey, onCrosshairMove, indicatorLines, tradeMarkers, onChartReady },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const initKey = useRef(0);
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const indicatorLinesRef = useRef(indicatorLines);
  indicatorLinesRef.current = indicatorLines;
  const onChartReadyRef = useRef(onChartReady);
  onChartReadyRef.current = onChartReady;
  // Track current chart dimensions so we can apply via options without recreation
  const dimsRef = useRef({ width: 600, height: 300 });

  useImperativeHandle(
    ref,
    () => ({
      chart: chartRef.current,
      series: seriesRef.current,
      container: containerRef.current,
    }),
    []
  );

  // ---- Chart creation (mount only, no-height dependency) ----
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    initKey.current += 1;
    const key = initKey.current;

    const tryInit = () => {
      if (key !== initKey.current) return;
      if (container.clientWidth <= 0) {
        requestAnimationFrame(tryInit);
        return;
      }

      const w = container.clientWidth || 600;
      dimsRef.current = { width: w, height };

      const chart = createChart(container, {
        width: w,
        height,
        layout: {
          background: { color: "#0b0d17" },
          textColor: "#5c6077",
          fontSize: 10,
          fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.025)" },
          horzLines: { color: "rgba(255,255,255,0.025)" },
        },
        crosshair: {
          mode: 0,
          vertLine: { color: "rgba(59,130,246,0.3)", width: 1, style: 2, labelBackgroundColor: "#161928" },
          horzLine: { color: "rgba(59,130,246,0.3)", width: 1, style: 2, labelBackgroundColor: "#161928" },
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.05)",
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: (time: number) => {
            const date = new Date(time * 1000);
            const h = date.getHours().toString().padStart(2, "0");
            const m = date.getMinutes().toString().padStart(2, "0");
            return `${h}:${m}`;
          },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.06)",
          borderVisible: true,
        },
      });

      const series = chart.addCandlestickSeries({
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        borderVisible: false,
        wickVisible: true,
        priceFormat: {
          type: "price",
          precision: 2,
          minMove: 0.01,
        },
      } as CandlestickSeriesPartialOptions);

      chartRef.current = chart;
      seriesRef.current = series;

      // Notify parent that chart is ready (for overlays like FootprintOverlay)
      if (onChartReadyRef.current) {
        onChartReadyRef.current(chart, series);
      }

      const currentCandles = candlesRef.current;
      if (currentCandles.length > 0) {
        series.setData(
          currentCandles.map((c) => ({
            time: (c.time / 1000) as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
      }

      const currentLines = indicatorLinesRef.current;
      if (currentLines) {
        for (const line of currentLines) {
          const ls = chart.addLineSeries({
            color: line.color,
            lineWidth: 1,
            lastValueVisible: false,
            priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          } as LineSeriesPartialOptions);
          indicatorSeriesRef.current.set(line.id, ls);
          ls.setData(
            line.data.map((d) => ({
              time: (d.time / 1000) as UTCTimestamp,
              value: d.value,
            }))
          );
        }
      }

      if (onCrosshairMove) {
        chart.subscribeCrosshairMove((param) => {
          if (param.point && param.time) {
            const data = param.seriesData.get(series) as { close: number } | undefined;
            onCrosshairMove(data?.close ?? 0, (param.time as number) * 1000, param.point.x, param.point.y);
          } else {
            // Crosshair left the chart area
            onCrosshairMove(0, 0);
          }
        });
      }

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          dimsRef.current = { width: entry.contentRect.width, height: dimsRef.current.height };
          chart.applyOptions({ width: entry.contentRect.width, height: dimsRef.current.height });
        }
      });
      observer.observe(container);

      (container as any).__chartCleanup = () => {
        observer.disconnect();
        chart.remove();
        indicatorSeriesRef.current.clear();
      };
    };

    tryInit();

    return () => {
      initKey.current += 1;
      (container as any).__chartCleanup?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCrosshairMove, resizeKey]);

  // ---- Apply dimension changes via options (no chart recreation) ----
  useEffect(() => {
    dimsRef.current.height = height;
    chartRef.current?.applyOptions({ height });
  }, [height]);

  useEffect(() => {
    if (containerWidth && containerWidth > 0) {
      dimsRef.current.width = containerWidth;
      chartRef.current?.applyOptions({ width: containerWidth });
    }
  }, [containerWidth]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (candles.length === 0) {
      seriesRef.current.setData([]);
      return;
    }
    seriesRef.current.setData(
      candles.map((c) => ({
        time: (c.time / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
  }, [candles]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;
    const active = new Set(indicatorLines?.map((l) => l.id) ?? []);

    indicatorSeriesRef.current.forEach((s, id) => {
      if (!active.has(id)) {
        chart.removeSeries(s);
        indicatorSeriesRef.current.delete(id);
      }
    });

    indicatorLines?.forEach((line) => {
      let ls = indicatorSeriesRef.current.get(line.id);
      if (!ls) {
        ls = chart.addLineSeries({
          color: line.color,
          lineWidth: 1,
          lastValueVisible: false,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        } as LineSeriesPartialOptions);
        indicatorSeriesRef.current.set(line.id, ls);
      }
      ls.setData(
        line.data.map((d) => ({
          time: (d.time / 1000) as UTCTimestamp,
          value: d.value,
        }))
      );
    });
  }, [indicatorLines]);

  // ---- Trade markers (bot signals, paper trades) ----
  useEffect(() => {
    if (!seriesRef.current || !tradeMarkers || tradeMarkers.length === 0) {
      seriesRef.current?.setMarkers([]);
      return;
    }
    const markers: SeriesMarker<UTCTimestamp>[] = tradeMarkers
      .sort((a, b) => a.time - b.time)
      .map((m) => ({
        time: (m.time / 1000) as UTCTimestamp,
        position: m.action === "buy" ? "belowBar" : "aboveBar",
        color: m.action === "buy" ? "#22c55e" : "#ef4444",
        shape: m.action === "buy" ? "arrowUp" : "arrowDown",
        text: m.label ?? (m.action === "buy" ? "BUY" : "SELL"),
      }));
    seriesRef.current.setMarkers(markers);
  }, [tradeMarkers]);

  useAutoFit(chartRef, seriesRef, candles);

  return (
    <div
      ref={containerRef}
      className="w-full flex-1 min-h-0"
      style={{ background: "linear-gradient(180deg, rgba(10,12,20,1) 0%, rgba(15,17,24,1) 100%)" }}
    />
  );
});
