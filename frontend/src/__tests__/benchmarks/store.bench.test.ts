import { describe, it, expect, beforeEach } from "vitest";

import { useMarketStore } from "../../stores/useMarketStore";
import { getBudgets, benchmarkScenario } from "./benchmarkUtils";
import type { Candle, Quote } from "../../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ITERATIONS = 10_000;

const mockCandle = (time: number): Candle => ({
  time,
  open: 100 + (time % 10),
  high: 110 + (time % 5),
  low: 90 - (time % 5),
  close: 105 + (time % 3),
  volume: 1000 + (time % 100),
});

const mockQuote = (symbol: string): Quote => ({
  symbol,
  bid: 50000 + Math.random() * 100,
  ask: 50001 + Math.random() * 100,
  timestamp: Date.now(),
});

beforeEach(() => {
  useMarketStore.setState({ candles: {}, quotes: {} });
});

// ---------------------------------------------------------------------------
// Benchmark suites
// ---------------------------------------------------------------------------

describe("benchmark: store operations", () => {
  const budgets = getBudgets();

  it("addCandle — 10 000 sequential candle inserts", () => {
    const { addCandle } = useMarketStore.getState();

    benchmarkScenario(
      "store.addCandle × 10 000",
      () => {
        const t = Date.now() + Math.random() * 1e9;
        addCandle("BTCUSDT", "1m", mockCandle(t));
      },
      ITERATIONS,
      budgets.storeAddCandle,
    );

    // Sanity check — actual state is populated
    const state = useMarketStore.getState();
    expect(state.candles["BTCUSDT:1m"]).toHaveLength(1000);
  });

  it("updateQuote — 10 000 quote updates", () => {
    const { updateQuote } = useMarketStore.getState();

    benchmarkScenario(
      "store.updateQuote × 10 000",
      () => updateQuote("BTCUSDT", mockQuote("BTCUSDT")),
      ITERATIONS,
      budgets.storeUpdateQuote,
    );

    // Sanity check — last quote is stored
    expect(useMarketStore.getState().quotes["BTCUSDT"]).toBeDefined();
  });

  it("batch mixed operations — 10 000 cycles of add + update + clear every 20th", () => {
    const store = useMarketStore.getState();
    let cycle = 0;

    benchmarkScenario(
      "store mixed batch × 10 000",
      () => {
        store.addCandle("BTCUSDT", "1m", mockCandle(Date.now() + cycle));
        store.updateQuote("ETHUSDT", mockQuote("ETHUSDT"));
        if (cycle % 20 === 0) {
          // Deterministic clear every 20 iterations to exercise cap + rebuild
          store.clear();
        }
        cycle++;
      },
      ITERATIONS,
      budgets.storeBatchOps,
    );

    // Sanity check — store didn't crash
    expect(typeof useMarketStore.getState().addCandle).toBe("function");
  });

  it("multiple symbol:interval keys — 10 000 inserts across 10 pairs", () => {
    const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
    const INTERVALS = ["1m", "5m", "15m", "1h", "4h"];
    const { addCandle } = useMarketStore.getState();

    benchmarkScenario(
      "multi-key store inserts × 10 000",
      () => {
        const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        const iv = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
        addCandle(sym, iv, mockCandle(Date.now() + Math.random() * 1e9));
      },
      ITERATIONS,
      budgets.storeBatchOps, // re-use batch budget for multi-key
    );

    // Sanity check — keys were created
    const keys = Object.keys(useMarketStore.getState().candles);
    expect(keys.length).toBeGreaterThanOrEqual(5);
  });
});
