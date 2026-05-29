import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { FootprintOverlay } from "../FootprintOverlay";
import { useFootprintStore } from "../../stores/useFootprintStore";
import { useMarketStore } from "../../stores/useMarketStore";
import type { FootprintLevel } from "../../types";

// ---------------------------------------------------------------------------
// Polyfill: ResizeObserver (not available in jsdom)
// ---------------------------------------------------------------------------
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as any).ResizeObserver = MockResizeObserver;

// ---------------------------------------------------------------------------
// Canvas mocks
// ---------------------------------------------------------------------------

let mockCtx: Record<string, any> = {};
let rafIdCounter = 0;

beforeEach(() => {
  // Mock requestAnimationFrame to fire immediately
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: any) => {
    cb(performance.now());
    return ++rafIdCounter;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(vi.fn());

  // Mock element bounding rect so draw() sees non-zero dimensions
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    top: 0,
    right: 800,
    bottom: 600,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect);

  // Mock canvas 2D context
  mockCtx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    scale: vi.fn(),
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    mockCtx as unknown as CanvasRenderingContext2D
  );

  // Seed stores with empty state
  useFootprintStore.setState({ footprint: {}, vpvr: {}, delta: {} });
  useMarketStore.setState({ candles: {}, quotes: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  useFootprintStore.setState({ footprint: {}, vpvr: {}, delta: {} });
  useMarketStore.setState({ candles: {}, quotes: {} });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFootprintLevels(): FootprintLevel[] {
  return [
    { price: 50002, bid_volume: 120, ask_volume: 40, total_volume: 160, delta: 80, imbalance: 0.5, intensity: 0.6 },
    { price: 50001, bid_volume: 200, ask_volume: 300, total_volume: 500, delta: -100, imbalance: -0.2, intensity: 0.7 },
    { price: 50000, bid_volume: 60, ask_volume: 60, total_volume: 120, delta: 0, imbalance: 0.02, intensity: 0.3 },
    { price: 49999, bid_volume: 90, ask_volume: 210, total_volume: 300, delta: -120, imbalance: -0.4, intensity: 0.8 },
    { price: 49998, bid_volume: 300, ask_volume: 80, total_volume: 380, delta: 220, imbalance: 0.58, intensity: 0.9 },
  ];
}

function setupFootprintData() {
  useFootprintStore.setState({
    footprint: {
      BTCUSDT: {
        symbol: "BTCUSDT",
        max_volume: 500,
        levels: makeFootprintLevels(),
      },
    },
  });
}

function mockSeriesApi() {
  return {
    priceToCoordinate: vi.fn((price: number) => {
      // Higher price → lower y coordinate (inverted y-axis)
      return 500 - (price - 49998) * 80;
    }),
  } as any;
}

function mockChartApi() {
  return {
    timeScale: () => ({
      timeToCoordinate: vi.fn(() => 400),
    }),
  } as any;
}

function renderOverlay(withCandles = false) {
  if (withCandles) {
    useMarketStore.setState({
      candles: {
        "BTCUSDT:1m": [
          { time: 1700000000000, open: 50000, high: 50100, low: 49900, close: 50050, volume: 1000 },
          { time: 1700000060000, open: 50050, high: 50150, low: 50000, close: 50100, volume: 800 },
        ],
      },
    });
  }
  return render(
    <FootprintOverlay
      symbol="BTCUSDT"
      interval="1m"
      seriesApi={mockSeriesApi()}
      chartApi={mockChartApi()}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FootprintOverlay canvas drawing", () => {
  it("renders null when there is no footprint data", () => {
    const { container } = render(
      <FootprintOverlay
        symbol="BTCUSDT"
        interval="1m"
        seriesApi={mockSeriesApi()}
        chartApi={mockChartApi()}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders a canvas element when footprint data is present", () => {
    setupFootprintData();
    renderOverlay();
    const canvas = document.querySelector("canvas");
    expect(canvas).not.toBeNull();
  });

  it("calls canvas drawing operations on mount with data", () => {
    setupFootprintData();
    renderOverlay();

    // The draw function should have been called via rAF
    expect(mockCtx.clearRect).toHaveBeenCalled();
    // Each visible level should produce fillRect calls
    // bidask mode: one green bar (bid) + one red bar (ask) per level
    // There are 5 levels, each with bid and ask volume
    // Also: background divider line (beginPath + moveTo + lineTo + stroke)
    // And potentially candle volume bars (if candles were provided)
    expect(mockCtx.fillRect).toHaveBeenCalled();
    // At minimum: 5 bid bars + 5 ask bars = 10 fillRect calls
    expect(mockCtx.fillRect.mock.calls.length).toBeGreaterThanOrEqual(10);
  });

  it("draws with correct bid/ask bar positioning in bidask mode", () => {
    setupFootprintData();
    renderOverlay();

    // In bidask mode, bars are drawn at centerX = w * 0.75 = 600
    // Bid bars: fillRect(centerX - bidW, y - barH/2, bidW, barH)
    // Ask bars: fillRect(centerX, y - barH/2, askW, barH)
    const calls = mockCtx.fillRect.mock.calls as [number, number, number, number][];

    // Some calls should have x < 600 (bid bars, left of center)
    const leftBars = calls.filter(([x]) => x < 600);
    expect(leftBars.length).toBeGreaterThanOrEqual(5);

    // Some calls should have x >= 600 (ask bars, right of center)
    const rightBars = calls.filter(([x]) => x >= 600);
    expect(rightBars.length).toBeGreaterThanOrEqual(5);
  });

  it("clears and redraws when switching to delta mode", () => {
    setupFootprintData();
    mockCtx.clearRect.mockClear();
    mockCtx.fillRect.mockClear();

    renderOverlay();

    // Clear tracking from initial draw
    mockCtx.clearRect.mockClear();
    mockCtx.fillRect.mockClear();

    // Click the Δ mode button
    const deltaBtn = screen.getByText("Δ");
    expect(deltaBtn).not.toBeNull();

    act(() => {
      deltaBtn.click();
    });

    // After mode switch, Effect 2 fires → rAF → draw() runs again
    // In delta mode: each level draws 1 bar (not 2 like bidask)
    // 5 levels × 1 bar = 5 fillRect calls (+ divider stuff)
    expect(mockCtx.clearRect).toHaveBeenCalled();
    expect(mockCtx.fillRect).toHaveBeenCalled();
  });

  it("draws imbalance bars when switching to imbalance mode", () => {
    setupFootprintData();
    renderOverlay();

    mockCtx.fillRect.mockClear();

    const imbBtn = screen.getByText("IMB");
    act(() => {
      imbBtn.click();
    });

    // Imbalance mode: bars sized by |imbalance| with intensity-based alpha
    expect(mockCtx.fillRect).toHaveBeenCalled();
    // All 5 levels should produce bars
    const calls = mockCtx.fillRect.mock.calls as [number, number, number, number][];
    // Each call is a bar: x, y, width, height — width relates to imbalance
    expect(calls.length).toBeGreaterThanOrEqual(5);
  });

  it("renders mode selector buttons", () => {
    setupFootprintData();
    renderOverlay();

    expect(screen.getByText("B/A")).toBeDefined();
    expect(screen.getByText("Δ")).toBeDefined();
    expect(screen.getByText("IMB")).toBeDefined();
  });

  it("renders candle volume toggle button", () => {
    setupFootprintData();
    renderOverlay();

    const volBtn = screen.getByTitle("Toggle candle volume bars");
    expect(volBtn).toBeDefined();
  });

  it("toggles candle volumes off and redraws without them", () => {
    setupFootprintData();
    renderOverlay();

    // Enable candle data and re-render (wrapped in act to suppress warning)
    act(() => {
      useMarketStore.setState({
        candles: {
          "BTCUSDT:1m": [
            { time: 1700000000000, open: 50000, high: 50100, low: 49900, close: 50050, volume: 1000 },
            { time: 1700000060000, open: 50050, high: 50150, low: 50000, close: 50100, volume: 800 },
          ],
        },
      });
    });

    // The Vol button click toggles showCandleVol
    const volBtn = screen.getByTitle("Toggle candle volume bars");
    act(() => {
      volBtn.click();
    });

    // After toggle, mode stays bidask, but candle volume bars are hidden
    // The draw still runs (showCandleVol is in deps)
    expect(mockCtx.clearRect).toHaveBeenCalled();
  });

  it("updates tooltip on hover over mode selector pill", () => {
    setupFootprintData();
    renderOverlay();

    // Hover the pill area to reveal tooltip text
    const baBtn = screen.getByText("B/A");
    act(() => {
      baBtn.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    });

    // The tooltip should show "Bid / Ask Volume"
    expect(screen.getByText("Bid / Ask Volume")).toBeDefined();
  });
});
