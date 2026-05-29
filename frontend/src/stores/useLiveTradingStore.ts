import { create } from "zustand";
import * as api from "../api/liveTrading";
import type { LivePosition, LiveAccountInfo } from "../api/liveTrading";

interface LiveTradingState {
  // Connection / engine
  enabled: boolean;
  bridgeConnected: boolean;
  loading: boolean;
  error: string | null;

  // Account info
  accountInfo: LiveAccountInfo | null;

  // Positions
  positions: LivePosition[];

  // Risk params
  maxPositionSize: number;
  maxDailyLoss: number;
  maxLeverage: number;
  cooldownSeconds: number;
  dailyPnl: number;
  dailyTradeCount: number;
  maxDailyTrades: number;

  // Actions
  fetchStatus: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<boolean>;
  fetchPositions: () => Promise<void>;
  fetchAccountInfo: () => Promise<void>;
  fetchAll: () => Promise<void>;

  // WS-driven updates
  applyWSEvent: (msg: any) => void;
}

export const useLiveTradingStore = create<LiveTradingState>((set, get) => ({
  enabled: false,
  bridgeConnected: false,
  loading: false,
  error: null,
  accountInfo: null,
  positions: [],
  maxPositionSize: 1.0,
  maxDailyLoss: 500,
  maxLeverage: 50,
  cooldownSeconds: 60,
  dailyPnl: 0,
  dailyTradeCount: 0,
  maxDailyTrades: 20,

  // --- Actions ---

  fetchStatus: async () => {
    try {
      const status = await api.getStatus();
      set({
        enabled: status.enabled,
        bridgeConnected: status.bridge_connected,
        maxPositionSize: status.max_position_size,
        maxDailyLoss: status.max_daily_loss,
        maxLeverage: status.max_leverage,
        cooldownSeconds: status.cooldown_seconds,
        dailyPnl: status.daily_pnl,
        dailyTradeCount: status.daily_trade_count,
        maxDailyTrades: status.max_daily_trades,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      set({ loading: false, error: err.message });
    }
  },

  setEnabled: async (enabled) => {
    set({ loading: true });
    try {
      const result = await api.setEnabled(enabled);
      set({
        enabled: result.enabled,
        bridgeConnected: result.bridge_connected,
        maxPositionSize: result.max_position_size,
        maxDailyLoss: result.max_daily_loss,
        maxLeverage: result.max_leverage,
        cooldownSeconds: result.cooldown_seconds,
        dailyPnl: result.daily_pnl,
        dailyTradeCount: result.daily_trade_count,
        maxDailyTrades: result.max_daily_trades,
        loading: false,
        error: null,
      });
      return true;
    } catch (err: any) {
      set({ loading: false, error: err.message });
      return false;
    }
  },

  fetchPositions: async () => {
    try {
      const result = await api.getPositions();
      set({ positions: result.positions, error: null });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchAccountInfo: async () => {
    try {
      const info = await api.getAccountInfo();
      set({ accountInfo: info, error: null });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchAll: async () => {
    set({ loading: true });
    await Promise.all([
      get().fetchStatus(),
      get().fetchPositions(),
      get().fetchAccountInfo(),
    ]);
    set({ loading: false });
  },

  // --- WS event handler ---

  applyWSEvent: (msg) => {
    const type = msg.type;

    if (type === "live_enabled") {
      set({ enabled: true });
    } else if (type === "live_disabled") {
      set({ enabled: false });
    } else if (type === "live_status") {
      set({
        enabled: msg.enabled,
        bridgeConnected: msg.bridge_connected,
        maxPositionSize: msg.max_position_size,
        maxDailyLoss: msg.max_daily_loss,
        maxLeverage: msg.max_leverage,
        cooldownSeconds: msg.cooldown_seconds,
        dailyPnl: msg.daily_pnl,
        dailyTradeCount: msg.daily_trade_count,
        maxDailyTrades: msg.max_daily_trades,
      });
    } else if (type === "live_account_info") {
      set({ accountInfo: msg.data || msg });
    } else if (type === "live_positions") {
      const positions = msg.positions || msg.data?.positions || [];
      set({ positions });
    } else if (type === "live_order_result") {
      // After an order, refresh positions and account
      get().fetchPositions();
      get().fetchAccountInfo();
    } else if (type === "live_close_result") {
      get().fetchPositions();
      get().fetchAccountInfo();
    }
  },
}));
