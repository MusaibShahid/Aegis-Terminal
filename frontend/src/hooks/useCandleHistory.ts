import { useEffect, useRef } from "react";
import { useMarketStore } from "../stores/useMarketStore";
import type { Candle } from "../types";

const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "1d": 86400, "1w": 604800,
};

function validateCandle(c: any, interval: string): boolean {
  if (!c || typeof c.time !== "number" || typeof c.open !== "number") return false;

  const { open, high, low, close } = c;

  // OHLC consistency
  if (high < Math.max(open, close)) {
    console.warn(`[candle] High ${high} < max(Open,Close) ${Math.max(open, close)}`, c.time);
    return false;
  }
  if (low > Math.min(open, close)) {
    console.warn(`[candle] Low ${low} > min(Open,Close) ${Math.min(open, close)}`, c.time);
    return false;
  }
  if (open < low || open > high) {
    console.warn(`[candle] Open ${open} outside [${low}, ${high}]`, c.time);
    return false;
  }
  if (close < low || close > high) {
    console.warn(`[candle] Close ${close} outside [${low}, ${high}]`, c.time);
    return false;
  }

  // Time boundary alignment
  if (c.time % (INTERVAL_SECONDS[interval] * 1000) !== 0) {
    console.warn(`[candle] Timestamp ${c.time} not aligned to ${interval} boundary`, c.time);
    return false;
  }

  if (c.volume < 0) return false;
  return true;
}

export function useCandleHistory(symbol: string, interval: string) {
  const setCandles = useMarketStore((s) => s.setCandles);
  const prevRef = useRef("");

  useEffect(() => {
    const key = `${symbol}:${interval}`;
    if (key === prevRef.current) return;
    prevRef.current = key;

    // Clear stale data for this key immediately
    setCandles(symbol, interval, []);

    let cancelled = false;
    fetch(`/api/history?symbol=${symbol}&interval=${interval}&limit=500`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.candles || !Array.isArray(data.candles)) {
          console.warn(`[useCandleHistory] No candles for ${key}`);
          return;
        }

        // Client-side validation
        const valid = data.candles.filter((c: any) => validateCandle(c, interval));
        const rejected = data.candles.length - valid.length;
        if (rejected > 0) {
          console.warn(`[useCandleHistory] Rejected ${rejected} invalid candles for ${key}`);
        }

        if (valid.length > 0) {
          setCandles(symbol, interval, valid);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [symbol, interval, setCandles]);
}
