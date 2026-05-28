import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock WebSocket — proper class, registered via vi.stubGlobal
// ---------------------------------------------------------------------------

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static lastInstance: MockWebSocket | null = null;

  url: string;
  readyState = 1;
  onopen: ((ev: any) => any) | null = null;
  onclose: ((ev: any) => any) | null = null;
  onerror: ((ev: any) => any) | null = null;
  onmessage: ((ev: any) => any) | null = null;
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: "close" } as any);
  });
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.lastInstance = this;
  }
}

beforeEach(() => {
  MockWebSocket.lastInstance = null;
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Reset all stores using their setState directly
  useMarketStore.setState({ candles: {}, quotes: {} });
  useConnectionStore.setState({ status: "disconnected", latency: null });
  useFootprintStore.setState({ footprint: {}, vpvr: {}, delta: {} });
  useLayoutStore.getState().reset();
  usePaperTradingStore.setState({
    balance: 10000, initialBalance: 10000, equity: 10000,
    totalPnl: 0, totalTrades: 0, wins: 0, losses: 0, winRate: 0,
    positions: [], orders: [], closedTrades: [],
    backendAvailable: false, loading: false, saving: false, error: null,
  });
  // Clear persisted state from localStorage
  localStorage.removeItem("aegis-paper-trading");
});

function sendWs(msg: Record<string, unknown>) {
  if (MockWebSocket.lastInstance?.onmessage) {
    MockWebSocket.lastInstance.onmessage({ data: JSON.stringify(msg) } as any);
  }
}

function triggerOpen() {
  const ws = MockWebSocket.lastInstance;
  if (ws?.onopen) {
    ws.onopen({} as any);
  }
}

import { useMarketStore } from "../../stores/useMarketStore";
import { useConnectionStore } from "../../stores/useConnectionStore";
import { useFootprintStore } from "../../stores/useFootprintStore";
import { useLayoutStore } from "../../stores/useLayoutStore";
import { usePaperTradingStore } from "../../stores/usePaperTradingStore";
import { useWebSocket } from "../../hooks/useWebSocket";

describe("useWebSocket → store integration", () => {
  beforeEach(() => {
    usePaperTradingStore.setState({
      balance: 10000,
      initialBalance: 10000,
      equity: 10000,
      positions: [],
      orders: [],
      closedTrades: [],
      backendAvailable: false,
    });
  });

  // -----------------------------------------------------------------------
  // Candle messages update useMarketStore
  // -----------------------------------------------------------------------

  it("receives candle messages and adds them to market store", () => {
    renderHook(() => useWebSocket("market"));
    triggerOpen();

    act(() => {
      sendWs({
        type: "candle",
        symbol: "BTCUSDT",
        interval: "1m",
        time: 1000,
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 1000,
      });
    });

    const candles = useMarketStore.getState().candles;
    expect(candles["BTCUSDT:1m"]).toHaveLength(1);
    expect(candles["BTCUSDT:1m"][0].close).toBe(105);
  });

  // -----------------------------------------------------------------------
  // Quote messages update useMarketStore
  // -----------------------------------------------------------------------

  it("receives quote messages and updates market store", () => {
    renderHook(() => useWebSocket("market"));
    triggerOpen();

    act(() => {
      sendWs({
        type: "quote",
        symbol: "BTCUSDT",
        bid: 50000,
        ask: 50010,
        timestamp: Date.now(),
      });
    });

    const quote = useMarketStore.getState().quotes["BTCUSDT"];
    expect(quote).toBeDefined();
    expect(quote.bid).toBe(50000);
    expect(quote.ask).toBe(50010);
  });

  // -----------------------------------------------------------------------
  // Footprint messages update useFootprintStore
  // -----------------------------------------------------------------------

  it("receives footprint messages and updates footprint store", () => {
    renderHook(() => useWebSocket("market"));
    triggerOpen();

    act(() => {
      sendWs({
        type: "footprint",
        symbol: "BTCUSDT",
        levels: [{ price: 100, bid_volume: 100, ask_volume: 50, total_volume: 150, delta: 50, imbalance: 0.33, intensity: 0.5 }],
        max_volume: 150,
      });
    });

    const fp = useFootprintStore.getState().footprint["BTCUSDT"];
    expect(fp).toBeDefined();
    expect(fp.levels).toHaveLength(1);
    expect(fp.levels[0].price).toBe(100);
  });

  // -----------------------------------------------------------------------
  // VPVR messages update useFootprintStore
  // -----------------------------------------------------------------------

  it("receives vpvr messages and updates footprint store", () => {
    renderHook(() => useWebSocket("market"));
    triggerOpen();

    act(() => {
      sendWs({
        type: "vpvr",
        symbol: "BTCUSDT",
        levels: [{ price: 100, volume: 1000, is_poc: true, in_value_area: true }],
        poc: 100,
        vah: 110,
        val: 90,
        total_volume: 1000,
      });
    });

    const vpvr = useFootprintStore.getState().vpvr["BTCUSDT"];
    expect(vpvr).toBeDefined();
    expect(vpvr.poc).toBe(100);
  });

  // -----------------------------------------------------------------------
  // Delta messages update useFootprintStore
  // -----------------------------------------------------------------------

  it("receives delta messages and updates footprint store", () => {
    renderHook(() => useWebSocket("market"));
    triggerOpen();

    act(() => {
      sendWs({
        type: "delta",
        symbol: "BTCUSDT",
        candle_delta: { buy_volume: 500, sell_volume: 300, delta: 200, total_volume: 800 },
        cumulative_delta: 200,
        delta_series: [{ timestamp: 1000, cumulative_delta: 200 }],
      });
    });

    const delta = useFootprintStore.getState().delta["BTCUSDT"];
    expect(delta).toBeDefined();
    expect(delta.cumulative_delta).toBe(200);
  });

  // -----------------------------------------------------------------------
  // Connection status updates on open
  // -----------------------------------------------------------------------

  it("sets connection status on mount and to connected on open", () => {
    renderHook(() => useWebSocket("market"));

    // The hook sets "connecting" in its useEffect
    expect(useConnectionStore.getState().status).toBe("connecting");

    act(() => {
      triggerOpen();
    });

    expect(useConnectionStore.getState().status).toBe("connected");
  });

  // -----------------------------------------------------------------------
  // Paper trading snapshot updates the store
  // -----------------------------------------------------------------------

  it("receives paper_snapshot and updates paper trading store", () => {
    renderHook(() => useWebSocket("market"));
    triggerOpen();

    act(() => {
      sendWs({
        type: "paper_snapshot",
        balance: 50000,
        initial_balance: 100000,
        equity: 52000,
        total_pnl: 2000,
        total_trades: 10,
        wins: 6,
        losses: 4,
        win_rate: 60,
        total_fees_paid: 15.5,
        positions: [{ id: 1, symbol: "BTCUSDT", side: "long", entry_price: 50000, quantity: 1, status: "open" }],
        orders: [],
        closed_trades: [],
        settings: { slippage_bps: 1.0, fee_model: "exchange", taker_fee_bps: 10.0, maker_fee_bps: 8.0 },
      });
    });

    const state = usePaperTradingStore.getState();
    expect(state.balance).toBe(50000);
    expect(state.equity).toBe(52000);
    expect(state.positions).toHaveLength(1);
    expect(state.positions[0].symbol).toBe("BTCUSDT");
    expect(state.backendAvailable).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Paper order created WS event
  // -----------------------------------------------------------------------

  it("receives paper_order_created and adds order to store", () => {
    renderHook(() => useWebSocket("market"));
    triggerOpen();

    act(() => {
      sendWs({
        type: "paper_order_created",
        data: {
          id: 42,
          symbol: "BTCUSDT",
          side: "buy",
          order_type: "limit",
          price: 49000,
          quantity: 0.5,
          status: "open",
          created_at: Date.now(),
        },
      });
    });

    const orders = usePaperTradingStore.getState().orders;
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(42);
    expect(orders[0].side).toBe("buy");
  });

  // -----------------------------------------------------------------------
  // Paper order filled WS event
  // -----------------------------------------------------------------------

  it("receives paper_order_filled and updates order + position", () => {
    renderHook(() => useWebSocket("market"));
    triggerOpen();

    act(() => {
      sendWs({
        type: "paper_order_filled",
        data: {
          id: 1,
          symbol: "BTCUSDT",
          side: "buy",
          order_type: "market",
          quantity: 1,
          filled_price: 50100,
          filled_quantity: 1,
          status: "filled",
          position: { id: 10, symbol: "BTCUSDT", side: "long", entry_price: 50100, quantity: 1, status: "open" },
        },
      });
    });

    const state = usePaperTradingStore.getState();
    const order = state.orders.find((o) => o.id === 1);
    expect(order).toBeDefined();
    expect(order!.status).toBe("filled");

    const pos = state.positions.find((p) => p.id === 10);
    expect(pos).toBeDefined();
    expect(pos!.side).toBe("long");
  });

  // -----------------------------------------------------------------------
  // Paper position closed WS event
  // -----------------------------------------------------------------------

  it("receives paper_position_closed and removes position from store", () => {
    usePaperTradingStore.setState({
      positions: [{ id: 5, symbol: "BTCUSDT", side: "long", entry_price: 50000, quantity: 1, status: "open" } as any],
    });

    renderHook(() => useWebSocket("market"));
    triggerOpen();

    act(() => {
      sendWs({
        type: "paper_position_closed",
        data: { id: 5 },
      });
    });

    const positions = usePaperTradingStore.getState().positions;
    expect(positions).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Paper position updated WS event
  // -----------------------------------------------------------------------

  it("receives paper_position_updated and updates position", () => {
    usePaperTradingStore.setState({
      positions: [{ id: 5, symbol: "BTCUSDT", side: "long", entry_price: 50000, quantity: 1, status: "open", stop_loss: null, take_profit: null } as any],
    });

    renderHook(() => useWebSocket("market"));
    triggerOpen();

    act(() => {
      sendWs({
        type: "paper_position_updated",
        data: { id: 5, stop_loss: 49000, take_profit: 52000 },
      });
    });

    const pos = usePaperTradingStore.getState().positions[0];
    expect((pos as any).stop_loss).toBe(49000);
    expect((pos as any).take_profit).toBe(52000);
  });

  // -----------------------------------------------------------------------
  // Paper order cancelled WS event
  // -----------------------------------------------------------------------

  it("receives paper_order_cancelled and marks order as cancelled", () => {
    usePaperTradingStore.setState({
      orders: [{ id: 7, symbol: "BTCUSDT", status: "open" } as any],
    });

    renderHook(() => useWebSocket("market"));
    triggerOpen();

    act(() => {
      sendWs({
        type: "paper_order_cancelled",
        data: { id: 7 },
      });
    });

    const order = usePaperTradingStore.getState().orders.find((o) => o.id === 7);
    expect(order).toBeDefined();
    expect(order!.status).toBe("cancelled");
  });

  // -----------------------------------------------------------------------
  // Paper reset done WS event
  // -----------------------------------------------------------------------

  it("receives paper_reset_done and replaces snapshot", () => {
    renderHook(() => useWebSocket("market"));
    triggerOpen();

    act(() => {
      sendWs({
        type: "paper_reset_done",
        balance: 100000,
        initial_balance: 100000,
        equity: 100000,
        total_pnl: 0,
        total_trades: 0,
        wins: 0,
        losses: 0,
        win_rate: 0,
        positions: [],
        orders: [],
        closed_trades: [],
      });
    });

    expect(usePaperTradingStore.getState().balance).toBe(100000);
    expect(usePaperTradingStore.getState().positions).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // onOpen sends paper_get_snapshot to sync state
  // -----------------------------------------------------------------------

  it("sends paper_get_snapshot on connect to sync state", () => {
    renderHook(() => useWebSocket("market"));

    act(() => {
      triggerOpen();
    });

    expect(MockWebSocket.lastInstance!.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "paper_get_snapshot" })
    );
  });

  // -----------------------------------------------------------------------
  // Multiple pane subscriptions via layout store changes
  // -----------------------------------------------------------------------

  it("subscribes to new symbols/intervals when panes change", () => {
    renderHook(() => useWebSocket("market"));
    triggerOpen();
    MockWebSocket.lastInstance!.send.mockClear();

    act(() => {
      useLayoutStore.getState().addPane({
        id: "pane-eth",
        symbol: "ETHUSDT",
        interval: "5m",
        indicators: [],
        oscillators: [],
        chartType: "candle",
        linked: false,
      });
    });

    const ws = MockWebSocket.lastInstance!;
    const subscribeCalls = ws.send.mock.calls.filter(
      (call: any) => typeof call[0] === "string" && call[0].includes("subscribe")
    );
    expect(subscribeCalls.length).toBeGreaterThan(0);
    const subscribeMsg = JSON.parse(subscribeCalls[0][0]);
    expect(subscribeMsg.symbols).toContain("ETHUSDT");
    expect(subscribeMsg.intervals).toContain("5m");
  });

  // -----------------------------------------------------------------------
  // Paper error messages are handled gracefully
  // -----------------------------------------------------------------------

  it("handles paper_error WS messages gracefully", () => {
    renderHook(() => useWebSocket("market"));
    triggerOpen();

    expect(() => {
      act(() => {
        sendWs({ type: "paper_error", message: "insufficient_balance" });
      });
    }).not.toThrow();
  });
});
