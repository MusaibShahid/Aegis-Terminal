import { useEffect, useRef } from "react";
import { useMarketStore } from "../stores/useMarketStore";
import { cachedFetch } from "../utils/requestCache";
import type { Candle } from "../types";

const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "1d": 86400, "1w": 604800,
};

function validateCandle(c: any, interval: string): boolean {
  if (!c || typeof c.time !== "number" || typeof c.open !== "number") return false;

  const { open, high, low, close } = c;

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
    if (c.time % (INTERVAL_SECONDS[interval] * 1000) < 100) return true; // ~100ms tolerance
    console.warn(`[candle] Timestamp ${c.time} not aligned to ${interval} boundary`, c.time);
    return false;
  }

  if (c.volume < 0) return false;
  return true;
}

/** TTL for candle history: short for 1m, longer for higher TFs. */
function candleTTL(interval: string): number {
  switch (interval) {
    case "1m": return 10_000;  // 10s
    case "5m": return 30_000;  // 30s
    case "15m":
    case "30m": return 60_000; // 1m
    case "1h":
    case "2h":
    case "4h": return 300_000; // 5m
    default: return 600_000;    // 10m
  }
}

export function useCandleHistory(symbol: string, interval: string) {
  const setCandles = useMarketStore((s) => s.setCandles);
  const prevRef = useRef("");

  useEffect(() => {
    const key = `${symbol}:${interval}`;
    if (key === prevRef.current) return;
    prevRef.current = key;

    let cancelled = false;

    const url = `/api/history?symbol=${symbol}&interval=${interval}&limit=500`;
    const ttl = candleTTL(interval);

    // Use cachedFetch with localStorage persistence so history survives reload
    cachedFetch<{ candles: Candle[] }>(url, {
      ttl,
      persistKey: "candle-history",
      maxPersistAge: 300_000, // 5 min max age for persisted data
    })
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

