import { create } from "zustand";

import type { Candle, Quote } from "../types";

interface MarketState {
  candles: Record<string, Candle[]>;
  quotes: Record<string, Quote>;
  addCandle: (symbol: string, interval: string, candle: Candle) => void;
  updateQuote: (symbol: string, quote: Quote) => void;
  setCandles: (symbol: string, interval: string, candles: Candle[]) => void;
  clearCandles: (keys: string[]) => void;
  clear: () => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  candles: {},
  quotes: {},

  addCandle: (symbol, interval, candle) =>
    set((s) => {
      const key = `${symbol}:${interval}`;
      const existing = s.candles[key] ?? [];
      let updated: Candle[];
      if (existing.length > 0 && existing[existing.length - 1].time === candle.time) {
        // Same time bucket — create new array with updated last element
        updated = [...existing.slice(0, -1), candle];
      } else {
        // New candle — always create a new array (never mutate in place)
        if (existing.length >= 1000) {
          updated = [...existing.slice(existing.length - 999), candle];
        } else {
          updated = [...existing, candle];
        }
      }
      return { candles: { ...s.candles, [key]: updated } };
    }),

  updateQuote: (symbol, quote) =>
    set((s) => ({ quotes: { ...s.quotes, [symbol]: quote } })),

  setCandles: (symbol, interval, candles) =>
    set((s) => ({
      candles: { ...s.candles, [`${symbol}:${interval}`]: candles },
    })),

  clearCandles: (keys) =>
    set((s) => {
      const next = { ...s.candles };
      for (const k of keys) delete next[k];
      return { candles: next };
    }),

  clear: () => set({ candles: {}, quotes: {} }),
}));
