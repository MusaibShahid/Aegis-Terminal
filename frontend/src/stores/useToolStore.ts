import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ToolCategory =
  | "chart_types"
  | "indicators"
  | "oscillators"
  | "drawing_tools"
  | "features"
  | "sidebar_panels";

export interface ToolItem {
  id: string;
  label: string;
  category: ToolCategory;
  enabled: boolean;
  icon?: string;
}

interface ToolState {
  tools: ToolItem[];
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  toggleTool: (id: string) => void;
  setToolEnabled: (id: string, enabled: boolean) => void;
  resetTools: () => void;
  isToolEnabled: (id: string) => boolean;
}

const DEFAULT_TOOLS: ToolItem[] = [
  // --- Chart Types ---
  { id: "chart_candle", label: "Candle", category: "chart_types", enabled: true, icon: "📊" },
  { id: "chart_footprint", label: "Footprint", category: "chart_types", enabled: true, icon: "🔍" },
  { id: "chart_delta", label: "Delta", category: "chart_types", enabled: true, icon: "Δ" },
  { id: "chart_depth", label: "Depth (DOM)", category: "chart_types", enabled: true, icon: "📋" },
  { id: "chart_heatmap", label: "Heatmap", category: "chart_types", enabled: true, icon: "🌡" },
  { id: "chart_vpvr", label: "VPVR", category: "chart_types", enabled: true, icon: "📈" },

  // --- Indicators (Overlays) ---
  { id: "ind_sma", label: "SMA", category: "indicators", enabled: true, icon: "📉" },
  { id: "ind_ema", label: "EMA", category: "indicators", enabled: true, icon: "📉" },
  { id: "ind_wma", label: "WMA", category: "indicators", enabled: true, icon: "📉" },
  { id: "ind_hma", label: "HMA", category: "indicators", enabled: true, icon: "📉" },
  { id: "ind_rsi", label: "RSI", category: "indicators", enabled: true, icon: "📊" },
  { id: "ind_macd", label: "MACD", category: "indicators", enabled: true, icon: "📊" },
  { id: "ind_stoch", label: "Stochastic", category: "indicators", enabled: true, icon: "📊" },
  { id: "ind_bollinger", label: "Bollinger", category: "indicators", enabled: true, icon: "📉" },
  { id: "ind_keltner", label: "Keltner", category: "indicators", enabled: true, icon: "📉" },
  { id: "ind_vwap", label: "VWAP", category: "indicators", enabled: true, icon: "📉" },
  { id: "ind_psar", label: "Parabolic SAR", category: "indicators", enabled: true, icon: "📉" },
  { id: "ind_atr", label: "ATR", category: "indicators", enabled: true, icon: "📏" },
  { id: "ind_cci", label: "CCI", category: "indicators", enabled: true, icon: "📏" },
  { id: "ind_wr", label: "Williams %R", category: "indicators", enabled: true, icon: "📏" },

  // --- Oscillators (Sub-panels) ---
  { id: "osc_volume", label: "Volume", category: "oscillators", enabled: true, icon: "📊" },
  { id: "osc_macd", label: "MACD", category: "oscillators", enabled: true, icon: "📊" },
  { id: "osc_rsi", label: "RSI", category: "oscillators", enabled: true, icon: "📊" },
  { id: "osc_stoch", label: "Stochastic", category: "oscillators", enabled: true, icon: "📊" },
  { id: "osc_cci", label: "CCI", category: "oscillators", enabled: true, icon: "📏" },
  { id: "osc_wr", label: "W%R", category: "oscillators", enabled: true, icon: "📏" },
  { id: "osc_atr", label: "ATR", category: "oscillators", enabled: true, icon: "📏" },
  { id: "osc_obv", label: "OBV", category: "oscillators", enabled: true, icon: "📊" },
  { id: "osc_cmf", label: "CMF", category: "oscillators", enabled: true, icon: "📊" },

  // --- Drawing Tools ---
  { id: "draw_trendline", label: "Trendline", category: "drawing_tools", enabled: true, icon: "↗" },
  { id: "draw_horizontal", label: "Horizontal", category: "drawing_tools", enabled: true, icon: "—" },
  { id: "draw_vertical", label: "Vertical", category: "drawing_tools", enabled: true, icon: "⎸" },
  { id: "draw_ray", label: "Ray", category: "drawing_tools", enabled: true, icon: "→" },
  { id: "draw_rectangle", label: "Rectangle", category: "drawing_tools", enabled: true, icon: "▭" },
  { id: "draw_fibonacci", label: "Fibonacci", category: "drawing_tools", enabled: true, icon: "Fib" },
  { id: "draw_freehand", label: "Freehand", category: "drawing_tools", enabled: true, icon: "✎" },
  { id: "draw_text", label: "Text", category: "drawing_tools", enabled: true, icon: "T" },
  { id: "draw_arrow", label: "Arrow", category: "drawing_tools", enabled: true, icon: "▲" },
  { id: "draw_circle", label: "Circle", category: "drawing_tools", enabled: true, icon: "○" },

  // --- Features ---
  { id: "feat_drawings", label: "Drawing Layer", category: "features", enabled: true, icon: "🎨" },
  { id: "feat_smc", label: "SMC Signals", category: "features", enabled: true, icon: "🔍" },
  { id: "feat_countdown", label: "Candle Countdown", category: "features", enabled: true, icon: "⏱" },
  { id: "feat_tooltip", label: "Candle Tooltip", category: "features", enabled: true, icon: "💬" },
  { id: "feat_timer", label: "Chart Timer", category: "features", enabled: true, icon: "⏰" },
  { id: "feat_linked_mode", label: "Linked Panes", category: "features", enabled: true, icon: "🔗" },

  // --- Sidebar Panels ---
  { id: "panel_watchlists", label: "Watchlist", category: "sidebar_panels", enabled: true, icon: "◉" },
  { id: "panel_instruments", label: "Browse", category: "sidebar_panels", enabled: true, icon: "🔍" },
  { id: "panel_alerts", label: "Alerts", category: "sidebar_panels", enabled: true, icon: "⚡" },
  { id: "panel_backtest", label: "Backtest", category: "sidebar_panels", enabled: true, icon: "📈" },
  { id: "panel_bots", label: "Bots", category: "sidebar_panels", enabled: true, icon: "⚙" },
  { id: "panel_positions", label: "Positions", category: "sidebar_panels", enabled: true, icon: "📊" },
  { id: "panel_paper", label: "Paper Trading", category: "sidebar_panels", enabled: true, icon: "💰" },
  { id: "panel_journal", label: "Journal", category: "sidebar_panels", enabled: true, icon: "📓" },
  { id: "panel_replay", label: "Replay", category: "sidebar_panels", enabled: true, icon: "▶" },
  { id: "panel_templates", label: "Templates", category: "sidebar_panels", enabled: true, icon: "⊞" },
  { id: "panel_ai", label: "AI Assistant", category: "sidebar_panels", enabled: true, icon: "🤖" },
];

const TOOL_CATEGORY_LABELS: Record<ToolCategory, string> = {
  chart_types: "Chart Types",
  indicators: "Indicators",
  oscillators: "Oscillators",
  drawing_tools: "Drawing Tools",
  features: "Features",
  sidebar_panels: "Sidebar Panels",
};

export const TOOL_CATEGORIES = Object.keys(TOOL_CATEGORY_LABELS) as ToolCategory[];
export const TOOL_CATEGORY_LABELS_MAP = TOOL_CATEGORY_LABELS;

export const useToolStore = create<ToolState>()(
  persist(
    (set, get) => ({
      tools: DEFAULT_TOOLS,
      drawerOpen: false,

      setDrawerOpen: (open) => set({ drawerOpen: open }),

      toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),

      toggleTool: (id) =>
        set((s) => ({
          tools: s.tools.map((t) =>
            t.id === id ? { ...t, enabled: !t.enabled } : t
          ),
        })),

      setToolEnabled: (id, enabled) =>
        set((s) => ({
          tools: s.tools.map((t) =>
            t.id === id ? { ...t, enabled } : t
          ),
        })),

      resetTools: () => set({ tools: DEFAULT_TOOLS }),

      isToolEnabled: (id) => get().tools.find((t) => t.id === id)?.enabled ?? true,
    }),
    {
      name: "aegis-tools",
      partialize: (state) => ({
        tools: state.tools,
      }),
    }
  )
);
