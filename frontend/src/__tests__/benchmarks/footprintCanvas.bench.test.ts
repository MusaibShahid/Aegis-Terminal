import { describe, it, expect, beforeEach } from "vitest";

import { drawBidAsk, drawDelta, drawImbalance, drawCandleVolumes } from "../../charts/footprintCanvas";
import { getBudgets, benchmarkScenario } from "./benchmarkUtils";
import type { FootprintLevel, Candle } from "../../types";
import type { IChartApi } from "lightweight-charts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVEL_COUNT = 120; // 120 footprint levels — well over 100
const ITERATIONS = 100; // 100 draws × 120 levels = 12 000 bar operations per mode
const VOL_ITERATIONS = 10; // drawCandleVolumes does more per-call work, fewer iterations

const W = 800;
const H = 600;
const CENTER_X = W * 0.75; // 600
const MAX_PX = Math.min(90, W * 0.22); // 90

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seeded pseudo-random for deterministic level generation. */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(42);

/**
 * Generate `n` footprint levels with realistic bid/ask volumes.
 *
 * Prices descend by ~2 ticks per level (simulating a real order book).
 * Bid volumes cluster toward lower price, ask volumes toward higher price
 * (bid-heavy below mid, ask-heavy above mid) to produce realistic deltas.
 */
function generateLevels(n: number): FootprintLevel[] {
  const midPrice = 50000;
  const half = n / 2;
  const levels: FootprintLevel[] = [];

  for (let i = 0; i < n; i++) {
    const price = midPrice + (half - i) * 0.5 + (rand() - 0.5) * 0.2;

    // Below mid: bid-heavy; above mid: ask-heavy
    const isBidSide = i < half;
    const baseBid = isBidSide ? 120 + rand() * 280 : 20 + rand() * 100;
    const baseAsk = isBidSide ? 20 + rand() * 100 : 120 + rand() * 280;

    const bidVolume = Math.round(baseBid);
    const askVolume = Math.round(baseAsk);
    const totalVolume = bidVolume + askVolume;
    const delta = bidVolume - askVolume;
    const max = Math.max(bidVolume, askVolume, 1);
    const imbalance = (bidVolume - askVolume) / max;

    levels.push({
      price: Math.round(price * 100) / 100,
      bid_volume: bidVolume,
      ask_volume: askVolume,
      total_volume: totalVolume,
      delta,
      imbalance: Math.max(-1, Math.min(1, imbalance)),
      intensity: 0.2 + rand() * 0.6,
    });
  }

  return levels;
}

/** Map price to y coordinate (higher price -> lower y). */
function priceToCoordinate(price: number): number | null {
  const y = 560 - (price - 49940) * 4.7;
  return Math.max(0, Math.min(599, y));
}

/**
 * Create a mock canvas context that tracks fillRect calls.
 * Uses a shared tracker object so the array reference stays stable
 * but we can inspect calls after the benchmark loop.
 */
function createMockCtx(): CanvasRenderingContext2D {
  const fillRects: [number, number, number, number][] = [];
  const ctx = {
    fillRect: (x: number, y: number, w: number, h: number) => {
      fillRects.push([x, y, w, h]);
    },
    fillText: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    scale: () => {},
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    arc: () => {},
    // Expose tracker for test assertions
    _getFillRects: () => fillRects,
  } as unknown as CanvasRenderingContext2D;
  return ctx;
}

function mockChartApi(): IChartApi {
  const timeScaleApi = {
    timeToCoordinate: () => 200,
    fitContent: () => {},
    getVisibleRange: () => null,
    setVisibleRange: () => {},
    subscribeVisibleTimeRangeChange: () => () => {},
    subscribeVisibleLogicalRangeChange: () => () => {},
  };
  return {
    timeScale: () => timeScaleApi,
    priceScale: () => ({} as any),
    subscribeClick: () => () => {},
    unsubscribeClick: () => {},
    subscribeDblClick: () => () => {},
    unsubscribeDblClick: () => {},
    subscribeCrosshairMove: () => () => {},
    unsubscribeCrosshairMove: () => {},
    chartElement: () => document.createElement("div"),
    series: () => null,
    removeSeries: () => {},
    addLineSeries: () => null,
    addCandlestickSeries: () => null,
    addBarSeries: () => null,
    addAreaSeries: () => null,
    addHistogramSeries: () => null,
    addBaselineSeries: () => null,
    remove: () => {},
    resize: () => {},
    takeScreenshot: () => "",
  } as unknown as IChartApi;
}

// ---------------------------------------------------------------------------
// Level data (generated once before all tests)
// ---------------------------------------------------------------------------

let levels: FootprintLevel[] = [];
let localMaxTotal = 0;
let localMaxDelta = 0;

beforeEach(() => {
  levels = generateLevels(LEVEL_COUNT);

  localMaxTotal = 0;
  localMaxDelta = 0;
  for (const lvl of levels) {
    const tv = (lvl.bid_volume ?? 0) + (lvl.ask_volume ?? 0);
    if (tv > localMaxTotal) localMaxTotal = tv;
    const ad = Math.abs(lvl.delta ?? 0);
    if (ad > localMaxDelta) localMaxDelta = ad;
  }
  if (localMaxTotal === 0) localMaxTotal = 1;
  if (localMaxDelta === 0) localMaxDelta = 1;
});

// ---------------------------------------------------------------------------
// Benchmark suites
// ---------------------------------------------------------------------------

describe("benchmark: footPrintCanvas drawing performance with 120 levels", () => {
  const budgets = getBudgets();

  // --- bidask mode ---

  it("drawBidAsk — 100 draws × 120 levels", () => {
    const ctx = createMockCtx();

    benchmarkScenario(
      "footprint drawBidAsk × 100",
      () => {
        drawBidAsk(ctx, levels, localMaxTotal, MAX_PX, CENTER_X, W, H, priceToCoordinate);
      },
      ITERATIONS,
      budgets.footprintDrawBidAsk,
    );

    // Sanity: fillRect accumulates across all 100 iterations.
    // Each level draws 2 bars (bid + ask) per iteration.
    // With 120 levels × 100 iterations = 12 000 draw passes,
    // but bars < 1.5px width are skipped. Most should draw.
    const calls = (ctx as any)._getFillRects() as [number, number, number, number][];
    expect(calls.length).toBeGreaterThan(0);

    // Check bar positioning on the first pass (first 240 entries = 120 levels × 2 bars)
    const firstPass = calls.slice(0, LEVEL_COUNT * 2);
    const leftBars = firstPass.filter(([x]) => x < CENTER_X);
    const rightBars = firstPass.filter(([x]) => x >= CENTER_X);
    expect(leftBars.length).toBeGreaterThan(0);
    expect(rightBars.length).toBeGreaterThan(0);
  });

  // --- delta mode ---

  it("drawDelta — 100 draws × 120 levels", () => {
    const ctx = createMockCtx();

    benchmarkScenario(
      "footprint drawDelta × 100",
      () => {
        drawDelta(ctx, levels, localMaxDelta, MAX_PX, CENTER_X, W, H, priceToCoordinate);
      },
      ITERATIONS,
      budgets.footprintDrawDelta,
    );

    const calls = (ctx as any)._getFillRects() as [number, number, number, number][];
    expect(calls.length).toBeGreaterThan(0);

    const firstPass = calls.slice(0, LEVEL_COUNT);
    expect(firstPass.length).toBeGreaterThan(0);
  });

  // --- imbalance mode ---

  it("drawImbalance — 100 draws × 120 levels", () => {
    const ctx = createMockCtx();

    benchmarkScenario(
      "footprint drawImbalance × 100",
      () => {
        drawImbalance(ctx, levels, MAX_PX, CENTER_X, W, H, priceToCoordinate);
      },
      ITERATIONS,
      budgets.footprintDrawImbalance,
    );

    const calls = (ctx as any)._getFillRects() as [number, number, number, number][];
    expect(calls.length).toBeGreaterThan(0);

    const firstPass = calls.slice(0, LEVEL_COUNT);
    expect(firstPass.length).toBeGreaterThan(0);
  });

  // --- drawCandleVolumes ---

  it("drawCandleVolumes — 10 draws × 120 candles", () => {
    const ctx = createMockCtx();
    const cApi = mockChartApi();
    const candles: Candle[] = [];
    for (let i = 0; i < 120; i++) {
      candles.push({
        time: 1_700_000_000_000 + i * 60_000,
        open: 50000 + (i % 5) * 10,
        high: 50010 + (i % 3) * 20,
        low: 49980 - (i % 4) * 15,
        close: 50005 + (i % 2) * 15,
        volume: 800 + (i % 50) * 10,
      });
    }

    benchmarkScenario(
      "footprint drawCandleVolumes × 10",
      () => {
        drawCandleVolumes(ctx, W, H, cApi, candles);
      },
      VOL_ITERATIONS,
      budgets.footprintDrawBidAsk, // re-use bidask budget (fewer iterations)
    );

    // Sanity: volume bars + background + baseline + label
    const calls = (ctx as any)._getFillRects() as [number, number, number, number][];
    expect(calls.length).toBeGreaterThan(0);
  });

  // --- cold-start performance: first draw with fresh context ---

  it("cold start bidask — 100 draws on a fresh context", () => {
    benchmarkScenario(
      "footprint cold-start bidask × 100",
      () => {
        const freshCtx = createMockCtx();
        drawBidAsk(freshCtx, levels, localMaxTotal, MAX_PX, CENTER_X, W, H, priceToCoordinate);
      },
      ITERATIONS,
      budgets.footprintDrawBidAsk,
    );
  });
});
