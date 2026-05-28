import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as api from "../api/paperTrading";
import type { PaperSettings } from "../api/paperTrading";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackendOrder {
  id: number;
  position_id: number | null;
  symbol: string;
  side: "buy" | "sell";
  order_type: "market" | "limit" | "stop" | "stop_limit";
  price: number | null;
  stop_price: number | null;
  quantity: number;
  filled_price: number | null;
  filled_quantity: number;
  status: "open" | "partial" | "filled" | "cancelled" | "rejected";
  slippage: number | null;
  reason: string | null;
  created_at: number;
  filled_at: number | null;
}

export interface BackendPosition {
  id: number;
  symbol: string;
  side: "long" | "short";
  entry_price: number;
  quantity: number;
  stop_loss: number | null;
  take_profit: number | null;
  pnl: number;
  pnl_pct: number;
  status: string;
  current_price: number;
  opened_at: number;
  closed_at: number | null;
}

export interface BackendTrade {
  id: number;
  symbol: string;
  side: "long" | "short";
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl: number;
  pnl_pct: number;
  entry_reason: string | null;
  exit_reason: string | null;
  opened_at: number;
  closed_at: number;
}

export interface AccountSnapshot {
  balance: number;
  initial_balance: number;
  equity: number;
  total_pnl: number;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  positions: BackendPosition[];
  orders: BackendOrder[];
  closed_trades: BackendTrade[];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface PaperTradingState {
  // Account
  balance: number;
  initialBalance: number;
  equity: number;
  totalPnl: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;

  // Settings
  slippageBps: number;
  feeModel: "none" | "exchange";
  takerFeeBps: number;
  makerFeeBps: number;
  totalFeesPaid: number;

  // Data
  positions: BackendPosition[];
  orders: BackendOrder[];
  closedTrades: BackendTrade[];

  // Connection state
  backendAvailable: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;

  // Actions
  replaceSnapshot: (snap: AccountSnapshot) => void;
  fetchSnapshot: () => Promise<void>;

  // Create order via REST
  createOrderREST: (data: api.PaperOrderRequest) => Promise<BackendOrder | null>;

  // Cancel via REST
  cancelOrderREST: (orderId: number) => Promise<boolean>;

  // Close position via REST
  closePositionREST: (positionId: number, exitPrice?: number, reason?: string) => Promise<boolean>;

  // Update SL/TP via REST
  updatePositionREST: (positionId: number, stopLoss?: number, takeProfit?: number) => Promise<boolean>;

  // Settings via REST
  fetchSettings: () => Promise<void>;
  saveSettings: (settings: api.PaperSettingsUpdate) => Promise<boolean>;
  replaceSettings: (settings: api.PaperSettings) => void;

  // Reset via REST
  resetAccountREST: () => Promise<boolean>;

  // WS-driven updates
  addWsOrder: (order: BackendOrder) => void;
  removeWsOrder: (orderId: number) => void;
  handleOrderFilled: (data: any) => void;
  addWsPosition: (pos: BackendPosition) => void;
  handleWsPositionClosed: (pos: BackendPosition) => void;
  updateWsPosition: (pos: Partial<BackendPosition>) => void;

  // Local fallback (when backend unavailable)
  localOpenPosition: (symbol: string, side: "long" | "short", price: number, quantity: number) => void;
  localClosePosition: (id: number, exitPrice: number) => void;
  localCancelOrder: (orderId: number) => void;
  localReset: () => void;
}

const LOCAL_BALANCE = 10_000;

function generateId(): number {
  return Date.now() + Math.floor(Math.random() * 10000);
}

export const usePaperTradingStore = create<PaperTradingState>()(
  persist(
    (set, get) => ({
      // --- Initial ---
      balance: LOCAL_BALANCE,
      initialBalance: LOCAL_BALANCE,
      equity: LOCAL_BALANCE,
      totalPnl: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      slippageBps: 1.0,
      feeModel: "exchange",
      takerFeeBps: 10.0,
      makerFeeBps: 8.0,
      totalFeesPaid: 0,
      positions: [],
      orders: [],
      closedTrades: [],
      backendAvailable: false,
      loading: false,
      saving: false,
      error: null,

      // --- REST actions ---

      replaceSnapshot: (snap) => {
        const updates: Partial<PaperTradingState> = {
          balance: snap.balance,
          initialBalance: snap.initial_balance,
          equity: snap.equity,
          totalPnl: snap.total_pnl,
          totalTrades: snap.total_trades,
          wins: snap.wins,
          losses: snap.losses,
          winRate: snap.win_rate,
          totalFeesPaid: (snap as any).total_fees_paid ?? 0,
          positions: snap.positions,
          orders: snap.orders,
          closedTrades: snap.closed_trades,
          backendAvailable: true,
          loading: false,
          error: null,
        };
        // Also extract settings from snapshot
        const settings = (snap as any).settings;
        if (settings) {
          updates.slippageBps = settings.slippage_bps;
          updates.feeModel = settings.fee_model;
          updates.takerFeeBps = settings.taker_fee_bps;
          updates.makerFeeBps = settings.maker_fee_bps;
        }
        set(updates);
      },

      fetchSnapshot: async () => {
        set({ loading: true });
        try {
          const snap = await api.getAccount();
          get().replaceSnapshot(snap);
        } catch {
          // Backend unavailable — rely on local state
          set({ backendAvailable: false, loading: false });
        }
      },

      createOrderREST: async (data) => {
        try {
          const result = await api.createOrder(data);
          // Re-fetch full snapshot to stay in sync
          get().fetchSnapshot();
          return result;
        } catch (err: any) {
          set({ error: err.message });
          return null;
        }
      },

      cancelOrderREST: async (orderId) => {
        try {
          await api.cancelOrder(orderId);
          get().fetchSnapshot();
          return true;
        } catch (err: any) {
          set({ error: err.message });
          return false;
        }
      },

      closePositionREST: async (positionId, exitPrice, reason) => {
        try {
          await api.closePosition(positionId, exitPrice, reason);
          get().fetchSnapshot();
          return true;
        } catch (err: any) {
          set({ error: err.message });
          return false;
        }
      },

      updatePositionREST: async (positionId, stopLoss, takeProfit) => {
        try {
          await api.updatePosition(positionId, stopLoss, takeProfit);
          get().fetchSnapshot();
          return true;
        } catch (err: any) {
          set({ error: err.message });
          return false;
        }
      },

      fetchSettings: async () => {
        set({ loading: true });
        try {
          const s = await api.getSettings();
          get().replaceSettings(s);
        } catch {
          set({ loading: false });
        }
      },

      saveSettings: async (data) => {
        set({ saving: true });
        try {
          const s = await api.updateSettings(data);
          get().replaceSettings(s);
          return true;
        } catch (err: any) {
          set({ error: err.message, saving: false });
          return false;
        }
      },

      replaceSettings: (settings) =>
        set({
          slippageBps: settings.slippage_bps,
          feeModel: settings.fee_model,
          takerFeeBps: settings.taker_fee_bps,
          makerFeeBps: settings.maker_fee_bps,
          initialBalance: settings.initial_balance,
          loading: false,
          saving: false,
          error: null,
        }),

      resetAccountREST: async () => {
        try {
          await api.resetAccount();
          get().fetchSnapshot();
          return true;
        } catch (err: any) {
          set({ error: err.message });
          return false;
        }
      },

      // --- WS event handlers ---

      addWsOrder: (order) =>
        set((s) => ({
          orders: [...s.orders.filter((o) => o.id !== order.id), order],
        })),

      removeWsOrder: (orderId) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId ? { ...o, status: "cancelled" as const } : o
          ),
        })),

      handleOrderFilled: (data) => {
        const state = get();
        const order = data as BackendOrder;
        state.addWsOrder(order);

        // If there's a position entry, update that too
        if (data.position) {
          state.addWsPosition(data.position);
        }
      },

      addWsPosition: (pos) =>
        set((s) => {
          const existing = s.positions.find((p) => p.id === pos.id);
          if (existing) {
            return {
              positions: s.positions.map((p) =>
                p.id === pos.id ? pos : p
              ),
            };
          }
          return { positions: [...s.positions, pos] };
        }),

      handleWsPositionClosed: (pos) =>
        set((s) => ({
          positions: s.positions.filter((p) => p.id !== pos.id),
        })),

      updateWsPosition: (pos) =>
        set((s) => ({
          positions: s.positions.map((p) =>
            p.id === pos.id ? { ...p, ...pos } : p
          ),
        })),

      // --- Local fallback (when backend is unavailable) ---

      localOpenPosition: (symbol, side, price, quantity) => {
        const cost = price * quantity;
        const state = get();
        if (cost > state.balance && side === "long") return;

        const position: BackendPosition = {
          id: generateId(),
          symbol,
          side,
          entry_price: price,
          quantity,
          stop_loss: null,
          take_profit: null,
          pnl: 0,
          pnl_pct: 0,
          status: "open",
          current_price: price,
          opened_at: Date.now(),
          closed_at: null,
        };

        set((s) => ({
          positions: [...s.positions, position],
          balance: s.balance - (side === "long" ? cost : 0),
        }));
      },

      localClosePosition: (id, exitPrice) => {
        const state = get();
        const pos = state.positions.find((p) => p.id === id);
        if (!pos || pos.status !== "open") return;

        const isLong = pos.side === "long";
        const pnl = isLong
          ? (exitPrice - pos.entry_price) * pos.quantity
          : (pos.entry_price - exitPrice) * pos.quantity;
        const pnlPct = ((exitPrice - pos.entry_price) / pos.entry_price) * 100 * (isLong ? 1 : -1);
        const returnValue = pos.entry_price * pos.quantity + pnl;

        const trade: BackendTrade = {
          id: generateId(),
          symbol: pos.symbol,
          side: pos.side,
          entry_price: pos.entry_price,
          exit_price: exitPrice,
          quantity: pos.quantity,
          pnl,
          pnl_pct: pnlPct,
          entry_reason: null,
          exit_reason: null,
          opened_at: pos.opened_at,
          closed_at: Date.now(),
        };

        set((s) => ({
          positions: s.positions.filter((p) => p.id !== id),
          balance: s.balance + returnValue,
          closedTrades: [trade, ...s.closedTrades.slice(0, 199)],
          totalPnl: s.totalPnl + pnl,
          totalTrades: s.totalTrades + 1,
          wins: pnl > 0 ? s.wins + 1 : s.wins,
          losses: pnl <= 0 ? s.losses + 1 : s.losses,
        }));
      },

      localCancelOrder: (orderId) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId ? { ...o, status: "cancelled" as const } : o
          ),
        })),

      localReset: () =>
        set({
          balance: LOCAL_BALANCE,
          initialBalance: LOCAL_BALANCE,
          equity: LOCAL_BALANCE,
          totalPnl: 0,
          totalTrades: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          slippageBps: 1.0,
          feeModel: "exchange",
          takerFeeBps: 10.0,
          makerFeeBps: 8.0,
          totalFeesPaid: 0,
          positions: [],
          orders: [],
          closedTrades: [],
          error: null,
        }),
    }),
    {
      name: "aegis-paper-trading",
      partialize: (state) => ({
        balance: state.balance,
        initialBalance: state.initialBalance,
        equity: state.equity,
        positions: state.positions,
        orders: state.orders,
        closedTrades: state.closedTrades,
        totalPnl: state.totalPnl,
        totalTrades: state.totalTrades,
        wins: state.wins,
        losses: state.losses,
        winRate: state.winRate,
        slippageBps: state.slippageBps,
        feeModel: state.feeModel,
        takerFeeBps: state.takerFeeBps,
        makerFeeBps: state.makerFeeBps,
        totalFeesPaid: state.totalFeesPaid,
        backendAvailable: state.backendAvailable,
      }),
    }
  )
);
