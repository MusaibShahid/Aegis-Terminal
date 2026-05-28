import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { createChart, type IChartApi, type ISeriesApi, type CandlestickSeriesPartialOptions, type UTCTimestamp, type LineSeriesPartialOptions } from "lightweight-charts";
import type { Candle } from "../types";
import { useAutoFit } from "../hooks/useAutoFit";

export interface ChartPaneHandle {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  container: HTMLDivElement | null;
}

interface Props {
  candles: Candle[];
  symbol: string;
  interval: string;
  height: number;
  containerWidth?: number;
  resizeKey?: number;
  onCrosshairMove?: (price: number, time: number) => void;
  indicatorLines?: { id: string; data: { time: number; value: number }[]; color: string }[];
}

export const ChartPane = forwardRef<ChartPaneHandle, Props>(function ChartPane(
  { candles, height, containerWidth, resizeKey, onCrosshairMove, indicatorLines },
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

  useImperativeHandle(
    ref,
    () => ({
      chart: chartRef.current,
      series: seriesRef.current,
      container: containerRef.current,
    }),
    []
  );

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

      const chart = createChart(container, {
        width: container.clientWidth || 600,
        height,
        layout: {
          background: { color: "#0a0c14" },
          textColor: "#6b7280",
          fontSize: 10,
          fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.03)" },
          horzLines: { color: "rgba(255,255,255,0.03)" },
        },
        crosshair: {
          mode: 0,
          vertLine: { color: "rgba(255,255,255,0.15)", width: 1, style: 2, labelBackgroundColor: "#1e293b" },
          horzLine: { color: "rgba(255,255,255,0.15)", width: 1, style: 2, labelBackgroundColor: "#1e293b" },
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.06)",
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
            onCrosshairMove(data?.close ?? 0, (param.time as number) * 1000);
          }
        });
      }

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width, height });
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
  }, [height, onCrosshairMove, resizeKey]);

  useEffect(() => {
    chartRef.current?.applyOptions({ width: containerWidth || chartRef.current?.options()?.width || 600 });
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

  useAutoFit(chartRef, seriesRef, candles);

  return (
    <div
      ref={containerRef}
      className="w-full flex-1 min-h-0"
      style={{ background: "linear-gradient(180deg, rgba(10,12,20,1) 0%, rgba(15,17,24,1) 100%)" }}
    />
  );
});
