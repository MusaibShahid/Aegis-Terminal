import { expect } from "vitest";

/**
 * Benchmark budget configuration — all values are configurable via VITE_BENCH_*
 * environment variables so they scale with CI machine speed.
 *
 * Usage (Unix):
 *   VITE_BENCH_STORE_ADD_CANDLE_MS=200 npx vitest run --reporter=verbose src/__tests__/benchmarks/
 *
 * Usage (Windows cmd.exe):
 *   set VITE_BENCH_STORE_ADD_CANDLE_MS=200 && npx vitest run --reporter=verbose src/__tests__/benchmarks/
 *
 * Usage (PowerShell):
 *   $env:VITE_BENCH_STORE_ADD_CANDLE_MS=200; npx vitest run --reporter=verbose src/__tests__/benchmarks/
 *
 * Default budgets should pass on modest CI hardware. Increase via env vars
 * if you see spurious failures on slower machines.
 */

export interface Budgets {
  /** Max ms for adding 10_000 candles via store.addCandle() */
  storeAddCandle: number;
  /** Max ms for updating 10_000 quotes via store.updateQuote() */
  storeUpdateQuote: number;
  /** Max ms for 10_000 mixed store operations (add + update + clear cycles) */
  storeBatchOps: number;
  /** Max ms for parsing and dispatching 10_000 JSON WebSocket messages */
  wsJsonParseDispatch: number;
  /** Max ms for dispatching 10_000 messages across 5 simultaneous handlers */
  wsHandlerFanout: number;
  /** Max ms for 10_000 subscribe-message serializations */
  wsSubscribeSerialize: number;
  /** Max ms for 10_000 candle array push-then-cap-at-1000 operations */
  candleArrayCappedPush: number;
  /** Max ms for 10_000 candle array update-in-place operations */
  candleArrayUpdate: number;
  /** Max ms for 100 drawBidAsk calls with 100 footprint levels */
  footprintDrawBidAsk: number;
  /** Max ms for 100 drawDelta calls with 100 footprint levels */
  footprintDrawDelta: number;
  /** Max ms for 100 drawImbalance calls with 100 footprint levels */
  footprintDrawImbalance: number;
}

const DEFAULTS: Budgets = {
  storeAddCandle: 600,
  storeUpdateQuote: 200,
  storeBatchOps: 400,
  wsJsonParseDispatch: 400,
  wsHandlerFanout: 1500,
  wsSubscribeSerialize: 100,
  candleArrayCappedPush: 500,
  candleArrayUpdate: 400,
  footprintDrawBidAsk: 600,
  footprintDrawDelta: 600,
  footprintDrawImbalance: 600,
};

function envInt(key: string, fallback: number): number {
  const raw =
    typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env as Record<string, string>)[key]
      : undefined;
  if (raw !== undefined && raw !== "") {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

/** Read all budgets from environment (VITE_BENCH_*) with sensible defaults. */
export function getBudgets(): Budgets {
  return {
    storeAddCandle: envInt("VITE_BENCH_STORE_ADD_CANDLE_MS", DEFAULTS.storeAddCandle),
    storeUpdateQuote: envInt("VITE_BENCH_STORE_UPDATE_QUOTE_MS", DEFAULTS.storeUpdateQuote),
    storeBatchOps: envInt("VITE_BENCH_STORE_BATCH_OPS_MS", DEFAULTS.storeBatchOps),
    wsJsonParseDispatch: envInt("VITE_BENCH_WS_JSON_PARSE_DISPATCH_MS", DEFAULTS.wsJsonParseDispatch),
    wsHandlerFanout: envInt("VITE_BENCH_WS_HANDLER_FANOUT_MS", DEFAULTS.wsHandlerFanout),
    wsSubscribeSerialize: envInt("VITE_BENCH_WS_SUBSCRIBE_SERIALIZE_MS", DEFAULTS.wsSubscribeSerialize),
    candleArrayCappedPush: envInt("VITE_BENCH_CANDLE_ARRAY_CAPPED_PUSH_MS", DEFAULTS.candleArrayCappedPush),
    candleArrayUpdate: envInt("VITE_BENCH_CANDLE_ARRAY_UPDATE_MS", DEFAULTS.candleArrayUpdate),
    footprintDrawBidAsk: envInt("VITE_BENCH_FOOTPRINT_DRAW_BIDASK_MS", DEFAULTS.footprintDrawBidAsk),
    footprintDrawDelta: envInt("VITE_BENCH_FOOTPRINT_DRAW_DELTA_MS", DEFAULTS.footprintDrawDelta),
    footprintDrawImbalance: envInt("VITE_BENCH_FOOTPRINT_DRAW_IMBALANCE_MS", DEFAULTS.footprintDrawImbalance),
  };
}

/**
 * Run a benchmark scenario: execute `fn` `iterations` times and assert the
 * total wall-clock time stays under `budgetMs`.
 *
 * The function is called with no arguments. A single warm-up iteration is
 * performed before measurement begins to avoid JIT cold-start skew.
 *
 * @param label      Human-readable scenario name (included in assertion message)
 * @param fn         Operation to benchmark
 * @param iterations Number of iterations to measure
 * @param budgetMs   Maximum allowed total time in milliseconds
 */
export function benchmarkScenario(
  label: string,
  fn: () => void,
  iterations: number,
  budgetMs: number,
): void {
  // Warm-up — discard first run
  fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const elapsed = performance.now() - start;

  const perOp = (elapsed / iterations).toFixed(3);
  expect(elapsed).toBeLessThan(budgetMs);
}
