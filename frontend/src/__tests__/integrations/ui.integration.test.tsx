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
// Polyfill: scrollIntoView (not available in jsdom)
// ---------------------------------------------------------------------------

Element.prototype.scrollIntoView = vi.fn() as any;

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
  pineScripts: [],
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

    // StatusBar shows version string
    expect(screen.getByText(/v0\.2\.0/i)).toBeDefined();
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

    // PairSelector renders the symbol as text inside a button, not as an input value
    const symbolText = screen.getByText(/BTCUSDT/);
    expect(symbolText).toBeDefined();

    // The link toggle button has a title attribute regardless of viewport size
    const linkBtn = screen.getByTitle(/link all panes/i);
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

    // Symbol strips "USDT" suffix, side "buy" renders as "L" (long)
    expect(screen.getByText(/BTC/i)).toBeDefined();
    expect(screen.getByText("L")).toBeDefined();
    // Volume formatted to 4 decimals
    expect(screen.getByText(/0\.5000/)).toBeDefined();
  });

  it("renders multiple positions", () => {
    useBotStore.setState({
      positions: [
        { bot: "bot1", symbol: "BTCUSDT", side: "buy", price: 50000, volume: 1 },
        { bot: "bot2", symbol: "ETHUSDT", side: "sell", price: 3000, volume: 5 },
      ],
    });

    render(<PositionPanel />);

    // Symbols are stripped of "USDT" suffix
    expect(screen.getByText(/BTC/i)).toBeDefined();
    expect(screen.getByText(/ETH/i)).toBeDefined();
  });

  it("renders volume value for position", () => {
    useBotStore.setState({
      positions: [
        { bot: "bot1", symbol: "ETHUSDT", side: "sell", price: 3000, volume: 2.5 },
      ],
    });

    render(<PositionPanel />);

    // Volume formatted to 4 decimal places: 2.5 → "2.5000"
    expect(screen.getByText(/2\.5000/)).toBeDefined();
  });
});

// ===========================================================================
// BotPanel Integration
// ===========================================================================

describe("BotPanel UI integration", () => {
  it("renders bot panel with no bots initially", () => {
    render(<BotPanel />);

    expect(screen.getByText(/no bots running/i)).toBeDefined();
  });

  it("shows create button", () => {
    render(<BotPanel />);

    const newButton = screen.getByText(/\+ Create/i);
    expect(newButton).toBeDefined();
  });
});

// ===========================================================================
// Workspace Layout Integration
// ===========================================================================

describe("Workspace layout integration", () => {
  it("renders without crashing with a single pane", () => {
    useLayoutStore.setState({
      workspaces: [{ id: "ws-1", name: "Default", panes: [{ id: "pane-1", symbol: "BTCUSDT", interval: "1m", indicators: [], oscillators: [], pineScripts: [], chartType: "candle", linked: false }] }],
      activeWorkspaceId: "ws-1",
      activePaneId: "pane-1",
      linkedMode: false,
    });
    useConnectionStore.setState({ status: "connected", latency: 10 });

    expect(() => render(<Workspace />)).not.toThrow();
  });

  it("renders multiple panes", () => {
    useLayoutStore.setState({
      workspaces: [{ id: "ws-1", name: "Default", panes: [
        { id: "pane-1", symbol: "BTCUSDT", interval: "1m", indicators: [], oscillators: [], pineScripts: [], chartType: "candle", linked: false },
        { id: "pane-2", symbol: "ETHUSDT", interval: "5m", indicators: [], oscillators: [], pineScripts: [], chartType: "footprint", linked: false },
      ] }],
      activeWorkspaceId: "ws-1",
      activePaneId: "pane-1",
      linkedMode: false,
    });
    useConnectionStore.setState({ status: "connected", latency: 10 });

    expect(() => render(<Workspace />)).not.toThrow();
  });

  it("renders with linked mode enabled", () => {
    useLayoutStore.setState({
      workspaces: [{ id: "ws-1", name: "Default", panes: [
        { id: "pane-1", symbol: "BTCUSDT", interval: "1m", indicators: [], oscillators: [], pineScripts: [], chartType: "candle", linked: false },
      ] }],
      activeWorkspaceId: "ws-1",
      activePaneId: "pane-1",
      linkedMode: true,
    });
    useConnectionStore.setState({ status: "connected", latency: 10 });

    expect(() => render(<Workspace />)).not.toThrow();

    // The top-bar link button shows "Link" text (Toolbar's "Link" only renders on desktop)
    expect(screen.getByText(/Link/)).toBeDefined();
  });
});

// ===========================================================================
// Store → UI reactive data flow
// ===========================================================================

describe("Store → UI data flow integration", () => {
  it("StatusBar updates when connection status changes", () => {
    useConnectionStore.setState({ status: "connected", latency: 15 });
    const { container, rerender } = render(<StatusBar />);

    // Connected status label should appear
    expect(screen.getByText(/connected/i)).toBeDefined();
    // Latency value "15" should appear somewhere in the rendered output
    // (split across child <span> elements, so check container textContent)
    expect(container.textContent).toMatch(/15\s*ms/);

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

    // Symbol strips "USDT" suffix → "BTC"
    expect(screen.getByText(/BTC/i)).toBeDefined();

    act(() => {
      useBotStore.setState({ positions: [] });
    });
    rerender(<PositionPanel />);

    expect(screen.getByText(/no open positions/i)).toBeDefined();
  });
});
