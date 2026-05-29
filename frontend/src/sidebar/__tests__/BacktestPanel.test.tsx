import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import { BacktestPanel } from "../BacktestPanel";

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

beforeEach(() => {
  // Mock requestAnimationFrame to fire immediately
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: any) => {
    cb(performance.now());
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(vi.fn());

  // Mock element bounding rect
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 400,
    height: 200,
    x: 0, y: 0, top: 0, right: 400, bottom: 200, left: 0,
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
    fill: vi.fn(),
    arc: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    canvas: { width: 400, height: 200 },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    mockCtx as unknown as CanvasRenderingContext2D
  );

  // Mock fetch for backtest API calls
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockBacktestResult = {
  total_return: 15.5,
  win_rate: 62.0,
  total_trades: 45,
  profit_factor: 1.85,
  max_drawdown: -8.2,
  sharpe: 1.42,
  final_equity: 11550,
  initial_capital: 10000,
  total_signals: 60,
  equity_curve: [
    { time: 1700000000000, equity: 10000 },
    { time: 1700100000000, equity: 10500 },
    { time: 1700200000000, equity: 10300 },
    { time: 1700300000000, equity: 11000 },
    { time: 1700400000000, equity: 11550 },
  ],
  trades: [
    { entry_time: 1700000000000, exit_time: 1700100000000, side: "buy", entry_price: 50000, exit_price: 51000, quantity: 0.5, pnl: 500, pnl_pct: 2.0, exit_reason: "tp" },
    { entry_time: 1700200000000, exit_time: 1700300000000, side: "sell", entry_price: 51000, exit_price: 50000, quantity: 0.3, pnl: 300, pnl_pct: 1.96, exit_reason: "tp" },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BacktestPanel canvas drawing", () => {
  it("shows empty state when no results exist", () => {
    render(<BacktestPanel />);
    expect(screen.getByText(/Configure a bot/i)).toBeDefined();
  });

  it("renders the config form with symbol, interval, and strategy selects", () => {
    render(<BacktestPanel />);
    expect(screen.getByDisplayValue("BTCUSDT")).toBeDefined();
    expect(screen.getByDisplayValue("1h")).toBeDefined();
    expect(screen.getByDisplayValue("EMA Crossover")).toBeDefined();
  });

  it("has a 'Run Backtest' button", () => {
    render(<BacktestPanel />);
    const btn = screen.getByText("Run Backtest");
    expect(btn).toBeDefined();
  });

  it("calls fetch with backtest params and draws equity curve on success", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBacktestResult),
    });

    render(<BacktestPanel />);

    const btn = screen.getByText("Run Backtest");
    act(() => { btn.click(); });

    // Wait for the async fetch + state update + draw
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/backtest", expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }));
    });

    // After results load, the canvas drawing should have been called
    await waitFor(() => {
      // clearRect should have been called for the equity curve canvas
      expect(mockCtx.clearRect).toHaveBeenCalled();
    });

    // Check that core drawing operations were performed
    expect(mockCtx.beginPath).toHaveBeenCalled();   // for grid, baseline, gradient, equity line
    expect(mockCtx.fillText).toHaveBeenCalled();    // for labels
    expect(mockCtx.stroke).toHaveBeenCalled();       // for grid, baseline, equity line
    expect(mockCtx.arc).toHaveBeenCalled();          // for start/end dots
    expect(mockCtx.createLinearGradient).toHaveBeenCalled(); // for gradient fill
  });

  it("shows performance stats after successful backtest", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBacktestResult),
    });

    render(<BacktestPanel />);

    act(() => {
      screen.getByText("Run Backtest").click();
    });

    await waitFor(() => {
      // Stats should be rendered
      expect(screen.getByText("15.5%")).toBeDefined();
      expect(screen.getByText("62.0%")).toBeDefined();
      expect(screen.getByText("45")).toBeDefined();
    });
  });

  it("shows trade list after successful backtest", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBacktestResult),
    });

    render(<BacktestPanel />);

    act(() => {
      screen.getByText("Run Backtest").click();
    });

    await waitFor(() => {
      expect(screen.getByText(/LONG/i)).toBeDefined();
      expect(screen.getByText(/SHORT/i)).toBeDefined();
    });
  });

  it("handles backtest fetch error gracefully", async () => {
    (fetch as any).mockRejectedValue(new Error("Network error"));

    render(<BacktestPanel />);

    act(() => {
      screen.getByText("Run Backtest").click();
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to run backtest/i)).toBeDefined();
    });
  });

  it("hides the equity curve canvas when fewer than 2 data points", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ...mockBacktestResult,
        equity_curve: [{ time: 1700000000000, equity: 10000 }],
        total_trades: 0,
      }),
    });

    render(<BacktestPanel />);

    act(() => {
      screen.getByText("Run Backtest").click();
    });

    await waitFor(() => {
      // Stats should still render
      expect(screen.getByText("Signals")).toBeDefined();
    });

    // The "Equity Curve" heading should not be present (canvas not rendered)
    expect(screen.queryByText("Equity Curve")).toBeNull();
  });
});
