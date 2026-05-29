import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { DrawingLayer } from "../DrawingLayer";
import { useDrawingStore } from "../../stores/useDrawingStore";
import type { Drawing } from "../../types";

// ---------------------------------------------------------------------------
// Canvas & Chart mocks
// ---------------------------------------------------------------------------

let mockCtx: Record<string, any> = {};
let rafIdCounter = 0;

/** Standard mock chart with coordinate-mapping functions */
function createMockChart() {
  const timeToCoordinate = vi.fn((_time: number) => 400); // default centered x
  const priceToCoordinate = vi.fn((_price: number) => 300); // default centered y
  return {
    chart: {
      timeScale: () => ({ timeToCoordinate }),
    },
    series: {
      priceToCoordinate,
    },
  };
}

let mockChart = createMockChart();
const chartRef = { current: null as any };

beforeEach(() => {
  // Set up chart ref with mock chart/series
  mockChart = createMockChart();
  chartRef.current = mockChart;

  // Mock requestAnimationFrame to fire immediately
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: any) => {
    cb(performance.now());
    return ++rafIdCounter;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(vi.fn());

  // Suppress setInterval-based re-renders
  vi.spyOn(window, "setInterval").mockReturnValue(123 as any);
  vi.spyOn(window, "clearInterval").mockImplementation(vi.fn());

  // Mock element bounding rect
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
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: "start" as CanvasTextAlign,
    canvas: { width: 800, height: 600 },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    mockCtx as unknown as CanvasRenderingContext2D
  );

  // Reset drawing store
  useDrawingStore.setState({
    drawings: [],
    activeTool: null,
    history: [[]],
    historyIndex: 0,
    loading: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  chartRef.current = null;
  useDrawingStore.setState({
    drawings: [],
    activeTool: null,
    history: [[]],
    historyIndex: 0,
    loading: false,
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderLayer(drawings?: Drawing[]) {
  if (drawings) {
    useDrawingStore.setState({ drawings });
  }
  return render(<DrawingLayer chartRef={chartRef} paneId="pane-1" />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DrawingLayer canvas drawing", () => {
  it("renders a canvas element", () => {
    renderLayer();
    const canvas = document.querySelector("canvas");
    expect(canvas).not.toBeNull();
  });

  it("clears canvas on mount even with no drawings", () => {
    renderLayer();
    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });

  it("draws a horizontal line with price label", () => {
    // Mock price -> pixel mapping: 50000 -> y = 200
    mockChart.series.priceToCoordinate.mockReturnValue(200);

    const drawing: Drawing = {
      id: "d-h1",
      paneId: "pane-1",
      tool: "horizontal",
      points: [{ time: 1000, price: 50000 }],
      color: "#ff0000",
    };

    renderLayer([drawing]);

    // horizontal: moveTo(0, y) -> lineTo(canvas.width, y) -> stroke -> fillText
    expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 200);
    expect(mockCtx.lineTo).toHaveBeenCalledWith(800, 200);
    expect(mockCtx.stroke).toHaveBeenCalled();

    // fillText was called with the price
    const textCalls = mockCtx.fillText.mock.calls as [string, number, number][];
    const priceLabel = textCalls.find(([t]) => t.includes("50000"));
    expect(priceLabel).toBeDefined();
  });

  it("draws a trendline between two points", () => {
    mockChart.series.priceToCoordinate
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(150);
    const mockTs = mockChart.chart.timeScale();
    mockTs.timeToCoordinate
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(300);

    const drawing: Drawing = {
      id: "d-t1",
      paneId: "pane-1",
      tool: "trendline",
      points: [
        { time: 1700000000000, price: 50000 },
        { time: 1700000060000, price: 50100 },
      ],
      color: "#00ff00",
    };

    renderLayer([drawing]);

    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();

    const moveCalls = mockCtx.moveTo.mock.calls as [number, number][];
    const lineCalls = mockCtx.lineTo.mock.calls as [number, number][];
    expect(moveCalls.some(([x, y]) => x === 100 && y === 200)).toBe(true);
    expect(lineCalls.some(([x, y]) => x === 300 && y === 150)).toBe(true);
  });

  it("draws a rectangle with fill", () => {
    mockChart.series.priceToCoordinate
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(400);
    const mockTs = mockChart.chart.timeScale();
    mockTs.timeToCoordinate
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(300);

    const drawing: Drawing = {
      id: "d-r1",
      paneId: "pane-1",
      tool: "rectangle",
      points: [
        { time: 1700000000000, price: 50000 },
        { time: 1700000060000, price: 50100 },
      ],
      color: "#3b82f6",
    };

    renderLayer([drawing]);

    expect(mockCtx.strokeRect).toHaveBeenCalledWith(100, 200, 200, 200);
    expect(mockCtx.fillRect).toHaveBeenCalled();
  });

  it("draws fibonacci retracement levels", () => {
    // Two prices: 50000 -> y=400, 51000 -> y=100
    mockChart.series.priceToCoordinate
      .mockReturnValueOnce(400)
      .mockReturnValueOnce(100);

    const drawing: Drawing = {
      id: "d-f1",
      paneId: "pane-1",
      tool: "fibonacci",
      points: [
        { time: 1700000000000, price: 50000 },
        { time: 1700000060000, price: 51000 },
      ],
      color: "#ff8800",
    };

    renderLayer([drawing]);

    // Fibonacci draws 7 levels with % labels
    const textCalls = mockCtx.fillText.mock.calls as [string, number, number][];
    const fibLabels = textCalls.filter(([t]) => t.includes("%"));
    expect(fibLabels.length).toBeGreaterThanOrEqual(3);
    expect(fibLabels.some(([t]) => t === "0.0%")).toBe(true);
    expect(fibLabels.some(([t]) => t === "50.0%")).toBe(true);
    expect(fibLabels.some(([t]) => t === "100.0%")).toBe(true);
  });

  it("draws multiple drawings of different types", () => {
    mockChart.series.priceToCoordinate.mockReturnValue(300);
    const mockTs = mockChart.chart.timeScale();
    mockTs.timeToCoordinate.mockReturnValue(400);

    const drawings: Drawing[] = [
      {
        id: "d-h1", paneId: "pane-1", tool: "horizontal",
        points: [{ time: 1000, price: 50000 }],
        color: "#ff0000",
      },
      {
        id: "d-t1", paneId: "pane-1", tool: "trendline",
        points: [{ time: 1000, price: 50000 }, { time: 2000, price: 50100 }],
        color: "#00ff00",
      },
    ];

    renderLayer(drawings);

    expect(mockCtx.save).toHaveBeenCalledTimes(2);
    expect(mockCtx.restore).toHaveBeenCalledTimes(2);
  });

  it("redraws when store drawings change", () => {
    renderLayer();
    mockCtx.clearRect.mockClear();

    act(() => {
      useDrawingStore.setState({
        drawings: [
          {
            id: "d-new", paneId: "pane-1", tool: "horizontal",
            points: [{ time: 1000, price: 50000 }],
            color: "#ff0000",
          },
        ],
      });
    });

    expect(mockCtx.clearRect).toHaveBeenCalled();
  });
});
