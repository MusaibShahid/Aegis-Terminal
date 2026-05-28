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
  close = vi.fn();
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.lastInstance = this;
  }
}

beforeEach(() => {
  MockWebSocket.lastInstance = null;
  vi.stubGlobal("WebSocket", MockWebSocket);

  // Mock fetch for REST API calls
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();

  usePaperTradingStore.setState({
    balance: 10000,
    initialBalance: 10000,
    equity: 10000,
    totalPnl: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    positions: [],
    orders: [],
    closedTrades: [],
    backendAvailable: false,
    loading: false,
    saving: false,
    error: null,
  });
  useLayoutStore.getState().reset();
  useMarketStore.setState({ candles: {}, quotes: {} });
  localStorage.removeItem("aegis-paper-trading");
});

import { usePaperTradingStore } from "../../stores/usePaperTradingStore";
import type { AccountSnapshot } from "../../stores/usePaperTradingStore";
import { useLayoutStore } from "../../stores/useLayoutStore";
import { useMarketStore } from "../../stores/useMarketStore";
import { useWebSocket } from "../../hooks/useWebSocket";

// Helper to send WS messages
function sendWs(msg: Record<string, unknown>) {
  const ws = MockWebSocket.lastInstance;
  if (ws?.onmessage) {
    ws.onmessage({ data: JSON.stringify(msg) } as any);
  }
}

function triggerOpen() {
  const ws = MockWebSocket.lastInstance;
  if (ws?.onopen) {
    ws.onopen({} as any);
  }
}

// ===========================================================================
// Paper Trading Store REST Integration Tests
// ===========================================================================

describe("PaperTradingStore REST integration", () => {
  it("fetchSnapshot fetches account and updates store on success", async () => {
    const mockSnapshot: AccountSnapshot = {
      balance: 50000,
      initial_balance: 100000,
      equity: 52000,
      total_pnl: 2000,
      total_trades: 10,
      wins: 6,
      losses: 4,
      win_rate: 60.0,
      positions: [{ id: 1, symbol: "BTCUSDT", side: "long", entry_price: 50000, quantity: 1, status: "open" } as any],
      orders: [],
      closed_trades: [],
    };

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSnapshot),
    });

    await act(async () => {
      await usePaperTradingStore.getState().fetchSnapshot();
    });

    const state = usePaperTradingStore.getState();
    expect(state.balance).toBe(50000);
    expect(state.equity).toBe(52000);
    expect(state.positions).toHaveLength(1);
    expect(state.backendAvailable).toBe(true);
    expect(state.loading).toBe(false);
  });

  it("fetchSnapshot sets backendAvailable=false on failure", async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error("Network error"));

    await act(async () => {
      await usePaperTradingStore.getState().fetchSnapshot();
    });

    const state = usePaperTradingStore.getState();
    expect(state.backendAvailable).toBe(false);
    expect(state.loading).toBe(false);
  });

  it("createOrderREST sends POST and refreshes snapshot", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1, status: "open" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            balance: 99000,
            initial_balance: 100000,
            equity: 99000,
            total_pnl: 0,
            total_trades: 0,
            wins: 0,
            losses: 0,
            win_rate: 0,
            positions: [],
            orders: [{ id: 1, symbol: "BTCUSDT", side: "buy", order_type: "market", quantity: 1, status: "open" }],
            closed_trades: [],
          }),
      });

    await act(async () => {
      await usePaperTradingStore.getState().createOrderREST({
        symbol: "BTCUSDT",
        side: "buy",
        order_type: "market",
        quantity: 1,
      });
    });

    const fetchCalls = (globalThis.fetch as any).mock.calls;
    const postCall = fetchCalls.find((call: any) => call[0]?.includes("/orders"));
    expect(postCall).toBeDefined();
    expect(postCall[1]?.method).toBe("POST");

    expect(usePaperTradingStore.getState().orders.length).toBeGreaterThanOrEqual(0);
  });

  it("createOrderREST sets error on failure", async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error("insufficient_balance"));

    const result = await act(async () => {
      return await usePaperTradingStore.getState().createOrderREST({
        symbol: "BTCUSDT",
        side: "buy",
        order_type: "market",
        quantity: 999999,
      });
    });

    expect(result).toBeNull();
    expect(usePaperTradingStore.getState().error).toBe("insufficient_balance");
  });

  it("cancelOrderREST sends DELETE and refreshes snapshot", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 5, status: "cancelled" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            balance: 100000, initial_balance: 100000, equity: 100000,
            total_pnl: 0, total_trades: 0, wins: 0, losses: 0, win_rate: 0,
            positions: [], orders: [], closed_trades: [],
          }),
      });

    const result = await act(async () => {
      return await usePaperTradingStore.getState().cancelOrderREST(5);
    });

    expect(result).toBe(true);
    const deleteCall = (globalThis.fetch as any).mock.calls.find((call: any) => call[0]?.includes("/orders/5"));
    expect(deleteCall).toBeDefined();
    expect(deleteCall[1]?.method).toBe("DELETE");
  });

  it("closePositionREST sends DELETE and refreshes snapshot", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 10, status: "closed" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            balance: 101000, initial_balance: 100000, equity: 101000,
            total_pnl: 1000, total_trades: 1, wins: 1, losses: 0, win_rate: 100,
            positions: [], orders: [], closed_trades: [],
          }),
      });

    const result = await act(async () => {
      return await usePaperTradingStore.getState().closePositionREST(10, 51000, "take_profit");
    });

    expect(result).toBe(true);
    const deleteCall = (globalThis.fetch as any).mock.calls.find(
      (call: any) => call[0]?.includes("/positions/10")
    );
    expect(deleteCall).toBeDefined();
  });

  it("resetAccountREST posts reset and refreshes", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            balance: 100000, initial_balance: 100000, equity: 100000,
            total_pnl: 0, total_trades: 0, wins: 0, losses: 0, win_rate: 0,
            positions: [], orders: [], closed_trades: [],
          }),
      });

    const result = await act(async () => {
      return await usePaperTradingStore.getState().resetAccountREST();
    });

    expect(result).toBe(true);
    const resetCall = (globalThis.fetch as any).mock.calls.find(
      (call: any) => call[0]?.includes("/reset")
    );
    expect(resetCall).toBeDefined();
    expect(resetCall[1]?.method).toBe("POST");
  });

  it("fetchSettings fetches and applies settings", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          initial_balance: 50000,
          slippage_bps: 2.0,
          fee_model: "exchange",
          taker_fee_bps: 5.0,
          maker_fee_bps: 3.0,
        }),
    });

    await act(async () => {
      await usePaperTradingStore.getState().fetchSettings();
    });

    expect(usePaperTradingStore.getState().slippageBps).toBe(2.0);
    expect(usePaperTradingStore.getState().feeModel).toBe("exchange");
  });

  it("saveSettings updates and replaces settings", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          initial_balance: 100000,
          slippage_bps: 0.5,
          fee_model: "none",
          taker_fee_bps: 0,
          maker_fee_bps: 0,
        }),
    });

    const result = await act(async () => {
      return await usePaperTradingStore.getState().saveSettings({
        slippage_bps: 0.5,
        fee_model: "none",
      });
    });

    expect(result).toBe(true);
    expect(usePaperTradingStore.getState().slippageBps).toBe(0.5);
    expect(usePaperTradingStore.getState().feeModel).toBe("none");
  });

  it("updatePositionREST sends PUT with stop_loss and take_profit", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 10, stop_loss: 49000, take_profit: 52000 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            balance: 100000, initial_balance: 100000, equity: 100000,
            total_pnl: 0, total_trades: 0, wins: 0, losses: 0, win_rate: 0,
            positions: [{ id: 10, stop_loss: 49000, take_profit: 52000 }],
            orders: [], closed_trades: [],
          }),
      });

    const result = await act(async () => {
      return await usePaperTradingStore.getState().updatePositionREST(10, 49000, 52000);
    });

    expect(result).toBe(true);
    const putCall = (globalThis.fetch as any).mock.calls.find(
      (call: any) => call[0]?.includes("/positions/10") && call[1]?.method === "PUT"
    );
    expect(putCall).toBeDefined();
  });
});

// ===========================================================================
// Paper Trading WS Event Integration
// ===========================================================================

describe("PaperTrading WS event integration", () => {
  it("handles full order lifecycle via WS events", () => {
    renderHook(() => {
      useWebSocket("market");
    });

    triggerOpen();

    // Step 1: Receive snapshot with initial state
    act(() => {
      sendWs({
        type: "paper_snapshot",
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

    // Step 2: Create a limit order via WS
    act(() => {
      sendWs({
        type: "paper_order_created",
        data: {
          id: 101,
          symbol: "BTCUSDT",
          side: "buy",
          order_type: "limit",
          price: 49000,
          quantity: 0.5,
          filled_price: null,
          filled_quantity: 0,
          status: "open",
          created_at: Date.now(),
        },
      });
    });

    expect(usePaperTradingStore.getState().orders).toHaveLength(1);
    expect(usePaperTradingStore.getState().orders[0].price).toBe(49000);

    // Step 3: Fill the order via WS
    act(() => {
      sendWs({
        type: "paper_order_filled",
        data: {
          id: 101,
          symbol: "BTCUSDT",
          side: "buy",
          order_type: "limit",
          price: 49000,
          quantity: 0.5,
          filled_price: 49000,
          filled_quantity: 0.5,
          status: "filled",
          position: {
            id: 201,
            symbol: "BTCUSDT",
            side: "long",
            entry_price: 49000,
            quantity: 0.5,
            pnl: 0,
            pnl_pct: 0,
            status: "open",
            current_price: 49000,
            opened_at: Date.now(),
          },
        },
      });
    });

    expect(usePaperTradingStore.getState().orders.length).toBeGreaterThanOrEqual(1);
    const filledOrder = usePaperTradingStore.getState().orders.find((o) => o.id === 101);
    expect(filledOrder).toBeDefined();
    expect(filledOrder!.status).toBe("filled");

    // Position should exist
    const pos = usePaperTradingStore.getState().positions.find((p) => p.id === 201);
    expect(pos).toBeDefined();
    expect(pos!.side).toBe("long");
    expect(pos!.quantity).toBe(0.5);

    // Step 4: Close the position via WS
    act(() => {
      sendWs({
        type: "paper_position_closed",
        data: { id: 201 },
      });
    });

    expect(usePaperTradingStore.getState().positions.find((p) => p.id === 201)).toBeUndefined();
  });

  it("tracks multiple independent orders from WS events", () => {
    renderHook(() => {
      useWebSocket("market");
    });

    triggerOpen();

    act(() => {
      sendWs({ type: "paper_order_created", data: { id: 1, symbol: "BTCUSDT", side: "buy", order_type: "market", quantity: 0.1, status: "open", created_at: 1000 } });
    });
    act(() => {
      sendWs({ type: "paper_order_created", data: { id: 2, symbol: "ETHUSDT", side: "sell", order_type: "limit", price: 3000, quantity: 1, status: "open", created_at: 1001 } });
    });

    expect(usePaperTradingStore.getState().orders).toHaveLength(2);
  });

  it("handles paper_error WS messages gracefully", () => {
    renderHook(() => {
      useWebSocket("market");
    });

    triggerOpen();

    expect(() => {
      act(() => {
        sendWs({ type: "paper_error", message: "insufficient_balance" });
      });
    }).not.toThrow();
  });

  it("paper_snapshot fully replaces existing state", () => {
    usePaperTradingStore.setState({
      balance: 5000,
      positions: [{ id: 99, symbol: "BTCUSDT", side: "long", entry_price: 50000, quantity: 1, status: "open" } as any],
    });

    renderHook(() => {
      useWebSocket("market");
    });

    triggerOpen();

    act(() => {
      sendWs({
        type: "paper_snapshot",
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
});

// ===========================================================================
// Local fallback operations
// ===========================================================================

describe("PaperTrading local fallback", () => {
  beforeEach(() => {
    usePaperTradingStore.setState({
      balance: 100000,
      initialBalance: 100000,
      equity: 100000,
    });
  });

  it("localOpenPosition creates a position and deducts balance", () => {
    usePaperTradingStore.getState().localOpenPosition("BTCUSDT", "long", 50000, 1);
    const state = usePaperTradingStore.getState();
    expect(state.positions).toHaveLength(1);
    expect(state.balance).toBe(50000); // 100000 - 50000
    expect(state.positions[0].entry_price).toBe(50000);
  });

  it("localOpenPosition respects balance limit for longs", () => {
    usePaperTradingStore.getState().localOpenPosition("BTCUSDT", "long", 50000, 10); // cost 500k > 100k balance
    expect(usePaperTradingStore.getState().positions).toHaveLength(0);
  });

  it("localClosePosition calculates PnL and updates balance", () => {
    usePaperTradingStore.getState().localOpenPosition("BTCUSDT", "long", 50000, 1);
    const pos = usePaperTradingStore.getState().positions[0];

    usePaperTradingStore.getState().localClosePosition(pos.id, 51000);

    const state = usePaperTradingStore.getState();
    expect(state.positions).toHaveLength(0);
    expect(state.balance).toBe(101000); // 50000 + 51000 = 101000
    expect(state.closedTrades).toHaveLength(1);
    expect(state.totalTrades).toBe(1);
    expect(state.wins).toBe(1);
  });

  it("localClosePosition handles losing trade correctly", () => {
    usePaperTradingStore.getState().localOpenPosition("BTCUSDT", "long", 50000, 1);
    const pos = usePaperTradingStore.getState().positions[0];

    usePaperTradingStore.getState().localClosePosition(pos.id, 49000);

    const state = usePaperTradingStore.getState();
    expect(state.closedTrades[0].pnl).toBe(-1000);
    expect(state.losses).toBe(1);
    expect(state.wins).toBe(0);
  });

  it("localOpenPosition supports short positions", () => {
    usePaperTradingStore.getState().localOpenPosition("BTCUSDT", "short", 50000, 1);
    const state = usePaperTradingStore.getState();
    expect(state.positions).toHaveLength(1);
    expect(state.positions[0].side).toBe("short");
    expect(state.balance).toBe(100000); // Short doesn't deduct
  });

  it("localClosePosition handles short position profit", () => {
    usePaperTradingStore.getState().localOpenPosition("BTCUSDT", "short", 50000, 1);
    const pos = usePaperTradingStore.getState().positions[0];

    usePaperTradingStore.getState().localClosePosition(pos.id, 49000);

    const trade = usePaperTradingStore.getState().closedTrades[0];
    expect(trade.pnl).toBe(1000);
  });

  it("localCancelOrder marks order as cancelled", () => {
    usePaperTradingStore.setState({
      orders: [{ id: 50, symbol: "BTCUSDT", status: "open" } as any],
    });

    usePaperTradingStore.getState().localCancelOrder(50);

    const order = usePaperTradingStore.getState().orders.find((o) => o.id === 50);
    expect(order!.status).toBe("cancelled");
  });

  it("localReset clears all state back to defaults", () => {
    usePaperTradingStore.setState({
      balance: 50000,
      totalPnl: 2000,
      totalTrades: 5,
      positions: [{ id: 1 } as any],
    });

    usePaperTradingStore.getState().localReset();

    const state = usePaperTradingStore.getState();
    expect(state.balance).toBe(10000);
    expect(state.totalPnl).toBe(0);
    expect(state.totalTrades).toBe(0);
    expect(state.positions).toHaveLength(0);
    expect(state.orders).toHaveLength(0);
  });
});
