import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";

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
// Mock WebSocket — proper class, registered via vi.stubGlobal
// ---------------------------------------------------------------------------

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = 1;
  onopen: ((ev: any) => any) | null = null;
  onclose: ((ev: any) => any) | null = null;
  onerror: ((ev: any) => any) | null = null;
  onmessage: ((ev: any) => any) | null = null;
  close = vi.fn();
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
  }
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();

  useConnectionStore.setState({ status: "disconnected", latency: null });
  useMarketStore.setState({ candles: {}, quotes: {} });
  useLayoutStore.getState().reset();
  usePaperTradingStore.setState({
    balance: 10000, initialBalance: 10000, equity: 10000,
    totalPnl: 0, totalTrades: 0, wins: 0, losses: 0, winRate: 0,
    positions: [], orders: [], closedTrades: [],
    backendAvailable: false, loading: false, saving: false, error: null,
  });
  useFootprintStore.setState({ footprint: {}, vpvr: {}, delta: {} });
  useBotStore.setState({ bots: [], signals: [], positions: [] });
  localStorage.removeItem("aegis-paper-trading");
});

// ===========================================================================
// Imports
// ===========================================================================

import { StatusBar } from "../../components/StatusBar";
import { useConnectionStore } from "../../stores/useConnectionStore";
import { useMarketStore } from "../../stores/useMarketStore";
import { usePaperTradingStore } from "../../stores/usePaperTradingStore";
import { useFootprintStore } from "../../stores/useFootprintStore";
import { useLayoutStore } from "../../stores/useLayoutStore";
import { useBotStore } from "../../stores/useBotStore";
import { Toolbar } from "../../components/Toolbar";
import { Sidebar } from "../../sidebar/Sidebar";
import { PositionPanel } from "../../sidebar/PositionPanel";
import { BotPanel } from "../../sidebar/BotPanel";
import { Workspace } from "../../layouts/Workspace";
import type { PaneConfig } from "../../types";

// Helper to create a mock pane config
const mockPane: PaneConfig = {
  id: "pane-1",
  symbol: "BTCUSDT",
  interval: "1m",
  indicators: [],
  oscillators: [],
  chartType: "candle",
  linked: false,
};

function mockToolbarProps() {
  return {
    pane: mockPane,
    onUpdatePane: vi.fn(),
    onAddIndicator: vi.fn(),
  };
}

// ===========================================================================
// StatusBar Integration
// ===========================================================================

describe("StatusBar UI integration", () => {
  it("renders disconnected status initially", () => {
    useConnectionStore.setState({ status: "disconnected", latency: null });
    render(<StatusBar />);

    expect(screen.getByText(/disconnected/i)).toBeDefined();
  });

  it("renders connected status", () => {
    useConnectionStore.setState({ status: "connected", latency: 25 });
    render(<StatusBar />);

    expect(screen.getByText(/connected/i)).toBeDefined();
    expect(screen.getByText(/25/i)).toBeDefined();
  });

  it("renders connecting status", () => {
    useConnectionStore.setState({ status: "connecting", latency: null });
    render(<StatusBar />);

    expect(screen.getByText(/connecting/i)).toBeDefined();
  });

  it("renders version string", () => {
    useConnectionStore.setState({ status: "connected", latency: 10 });
    render(<StatusBar />);

    // StatusBar shows "Aegis Terminal v0.1.0" always
    expect(screen.getByText(/v0\.1\.0/i)).toBeDefined();
  });

  it("renders without crashing when all stores are empty", () => {
    useConnectionStore.setState({ status: "disconnected", latency: null });
    useMarketStore.setState({ candles: {}, quotes: {} });

    expect(() => render(<StatusBar />)).not.toThrow();
  });
});

// ===========================================================================
// Toolbar Integration
// ===========================================================================

describe("Toolbar UI integration", () => {
  it("renders toolbar with link toggle and symbol input", () => {
    render(<Toolbar {...mockToolbarProps()} />);

    // Should show a link toggle and a symbol input
    const symbolInput = screen.getByDisplayValue("BTCUSDT");
    expect(symbolInput).toBeDefined();

    // The link button should be in the document
    const linkBtn = screen.getByRole("button", { name: /link/i });
    expect(linkBtn).toBeDefined();
  });

  it("renders interval selector", () => {
    render(<Toolbar {...mockToolbarProps()} />);

    const select = screen.getByRole("combobox");
    expect(select).toBeDefined();
  });
});

// ===========================================================================
// Sidebar Integration
// ===========================================================================

describe("Sidebar UI integration", () => {
  it("renders sidebar with navigation tabs", () => {
    const onSelect = vi.fn();
    render(<Sidebar onSelectSymbol={onSelect} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("renders sidebar without crashing", () => {
    expect(() => render(<Sidebar onSelectSymbol={vi.fn()} />)).not.toThrow();
  });
});

// ===========================================================================
// PositionPanel Integration
// ===========================================================================

describe("PositionPanel UI integration", () => {
  it("shows empty state when no positions", () => {
    useBotStore.setState({ positions: [] });
    render(<PositionPanel />);

    expect(screen.getByText(/no open positions/i)).toBeDefined();
  });

  it("renders open positions correctly from bot store", () => {
    useBotStore.setState({
      positions: [
        { bot: "ema_bot", symbol: "BTCUSDT", side: "buy", price: 50000, volume: 0.5 },
      ],
    });

    render(<PositionPanel />);

    expect(screen.getByText(/BTCUSDT/i)).toBeDefined();
    expect(screen.getByText(/BUY/i)).toBeDefined();
  });

  it("renders multiple positions", () => {
    useBotStore.setState({
      positions: [
        { bot: "bot1", symbol: "BTCUSDT", side: "buy", price: 50000, volume: 1 },
        { bot: "bot2", symbol: "ETHUSDT", side: "sell", price: 3000, volume: 5 },
      ],
    });

    render(<PositionPanel />);

    expect(screen.getByText(/BTCUSDT/i)).toBeDefined();
    expect(screen.getByText(/ETHUSDT/i)).toBeDefined();
  });

  it("renders volume value for position", () => {
    useBotStore.setState({
      positions: [
        { bot: "bot1", symbol: "ETHUSDT", side: "sell", price: 3000, volume: 2.5 },
      ],
    });

    render(<PositionPanel />);

    expect(screen.getByText(/2\.5/)).toBeDefined();
  });
});

// ===========================================================================
// BotPanel Integration
// ===========================================================================

describe("BotPanel UI integration", () => {
  it("renders bot panel with no bots initially", () => {
    render(<BotPanel />);

    expect(screen.getByText(/no bots configured/i)).toBeDefined();
  });

  it("shows create button", () => {
    render(<BotPanel />);

    const newButton = screen.getByText(/\+ New/i);
    expect(newButton).toBeDefined();
  });
});

// ===========================================================================
// Workspace Layout Integration
// ===========================================================================

describe("Workspace layout integration", () => {
  it("renders without crashing with a single pane", () => {
    useLayoutStore.setState({
      panes: [{ id: "pane-1", symbol: "BTCUSDT", interval: "1m", indicators: [], oscillators: [], chartType: "candle", linked: false }],
      activePaneId: "pane-1",
      linkedMode: false,
    });
    useConnectionStore.setState({ status: "connected", latency: 10 });

    expect(() => render(<Workspace />)).not.toThrow();
  });

  it("renders multiple panes", () => {
    useLayoutStore.setState({
      panes: [
        { id: "pane-1", symbol: "BTCUSDT", interval: "1m", indicators: [], oscillators: [], chartType: "candle", linked: false },
        { id: "pane-2", symbol: "ETHUSDT", interval: "5m", indicators: [], oscillators: [], chartType: "footprint", linked: false },
      ],
      activePaneId: "pane-1",
      linkedMode: false,
    });
    useConnectionStore.setState({ status: "connected", latency: 10 });

    expect(() => render(<Workspace />)).not.toThrow();
  });

  it("renders with linked mode enabled", () => {
    useLayoutStore.setState({
      panes: [
        { id: "pane-1", symbol: "BTCUSDT", interval: "1m", indicators: [], oscillators: [], chartType: "candle", linked: false },
      ],
      activePaneId: "pane-1",
      linkedMode: true,
    });
    useConnectionStore.setState({ status: "connected", latency: 10 });

    expect(() => render(<Workspace />)).not.toThrow();

    // Should show a "Linked" button
    const linkedButton = screen.getByText(/linked/i);
    expect(linkedButton).toBeDefined();
  });
});

// ===========================================================================
// Store → UI reactive data flow
// ===========================================================================

describe("Store → UI data flow integration", () => {
  it("StatusBar updates when connection status changes", () => {
    useConnectionStore.setState({ status: "connected", latency: 15 });
    const { rerender } = render(<StatusBar />);

    expect(screen.getByText(/connected/i)).toBeDefined();
    expect(screen.getByText(/15/i)).toBeDefined();

    act(() => {
      useConnectionStore.setState({ status: "disconnected", latency: null });
    });
    rerender(<StatusBar />);

    expect(screen.getByText(/disconnected/i)).toBeDefined();
  });

  it("PositionPanel updates reactively when positions change via bot store", () => {
    useBotStore.setState({ positions: [] });
    const { rerender } = render(<PositionPanel />);

    expect(screen.getByText(/no open positions/i)).toBeDefined();

    act(() => {
      useBotStore.setState({
        positions: [
          { bot: "bot1", symbol: "BTCUSDT", side: "buy", price: 50000, volume: 1 },
        ],
      });
    });
    rerender(<PositionPanel />);

    expect(screen.getByText(/BTCUSDT/i)).toBeDefined();

    act(() => {
      useBotStore.setState({ positions: [] });
    });
    rerender(<PositionPanel />);

    expect(screen.getByText(/no open positions/i)).toBeDefined();
  });
});
