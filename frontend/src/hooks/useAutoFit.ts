import { useEffect, useRef } from "react";

interface AutoFitOptions {
  enabled: boolean;
  paddingPercent: number;
  minRange: number;
}

export function useAutoFit(
  chartRef: React.MutableRefObject<any | null>,
  seriesRef: React.MutableRefObject<any | null>,
  candles: { high: number; low: number }[],
  options: AutoFitOptions = { enabled: true, paddingPercent: 10, minRange: 0 }
) {
  const lastRangeRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !options.enabled || candles.length === 0) return;

    const visibleRange = chart.timeScale().getVisibleLogicalRange();
    if (!visibleRange) return;

    const { from, to } = visibleRange;
    const visibleCandles = candles.slice(
      Math.max(0, Math.floor(from)),
      Math.min(candles.length, Math.ceil(to))
    );

    if (visibleCandles.length < 2) return;

    const high = Math.max(...visibleCandles.map((c) => c.high));
    const low = Math.min(...visibleCandles.map((c) => c.low));
    const range = high - low;
    const padding = range * (options.paddingPercent / 100);

    if (lastRangeRef.current) {
      const last = lastRangeRef.current;
      if (
        Math.abs(last.from - from) < 0.5 &&
        Math.abs(last.to - to) < 0.5
      ) {
        return;
      }
    }

    chart.priceScale("right").applyOptions({
      autoScale: true,
    });

    lastRangeRef.current = { from, to };
  }, [chartRef, seriesRef, candles, options.enabled, options.paddingPercent, options.minRange]);
}
