import { describe, it, expect } from "vitest";

import { getBudgets, benchmarkScenario } from "./benchmarkUtils";
import type { Candle } from "../../types";

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

/** Build a buffer of `n` candles with sequential times. */
function candleBuffer(n: number): Candle[] {
  const arr: Candle[] = [];
  for (let i = 0; i < n; i++) {
    arr.push(mockCandle(1_000_000_000 + i));
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Benchmark suites
// ---------------------------------------------------------------------------

describe("benchmark: candle array operations", () => {
  const budgets = getBudgets();

  it("push-then-cap-at-1000 — 10 000 operations on growing array", () => {
    const existing = candleBuffer(500); // start at half capacity

    benchmarkScenario(
      "capped push × 10 000",
      () => {
        // Simulate the store's addCandle logic: push then cap at 1000
        existing.push(mockCandle(Date.now() + Math.random() * 1e9));
        const _capped = existing.slice(-1000);
        // Result kept alive to prevent dead-code elimination
        void _capped.length;
      },
      ITERATIONS,
      budgets.candleArrayCappedPush,
    );

    // Sanity
    expect(existing.length).toBeGreaterThan(500);
  });

  it("update-in-place (replace last candle) — 10 000 operations", () => {
    const buffer = candleBuffer(100);
    const replacement = mockCandle(1_000_000_000 + 99);

    benchmarkScenario(
      "update-in-place × 10 000",
      () => {
        // Simulate store logic: same time → replace last
        const updated =
          buffer.length > 0 && buffer[buffer.length - 1].time === replacement.time
            ? [...buffer.slice(0, -1), replacement]
            : [...buffer, replacement];
        void updated.length;
      },
      ITERATIONS,
      budgets.candleArrayUpdate,
    );
  });

  it("slice + spread 1000-candle array — 10 000 operations", () => {
    const full = candleBuffer(1000);

    benchmarkScenario(
      "slice+spread 1000 candles × 10 000",
      () => {
        // Simulate the spread-and-slice in zustand's set() calls
        const result = [...full.slice(-1000)];
        void result.length;
      },
      ITERATIONS,
      budgets.candleArrayUpdate,
    );
  });

  it("build keyed candle record — 10 000 inserts into a Record", () => {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT"];
    const intervals = ["1m", "5m", "15m", "1h", "4h"];

    benchmarkScenario(
      "keyed record inserts × 10 000",
      () => {
        const record: Record<string, Candle[]> = {};
        for (let i = 0; i < 100; i++) {
          const sym = symbols[i % symbols.length];
          const iv = intervals[i % intervals.length];
          const key = `${sym}:${iv}`;
          if (!record[key]) record[key] = [];
          record[key].push(mockCandle(1_000_000_000 + i));
        }
        expect(Object.keys(record).length).toBeGreaterThan(0);
      },
      ITERATIONS / 100, // each inner loop does 100 inserts → total = 1M "logical" ops
      budgets.storeBatchOps,
    );
  });
});
