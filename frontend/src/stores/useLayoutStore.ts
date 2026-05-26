import { create } from "zustand";
import type { LayoutConfig, PaneConfig } from "../types";

interface LayoutState {
  panes: PaneConfig[];
  activePaneId: string | null;
  linkedMode: boolean;
  addPane: (pane?: PaneConfig) => void;
  removePane: (id: string) => void;
  updatePane: (id: string, updates: Partial<PaneConfig>) => void;
  setActivePane: (id: string | null) => void;
  toggleLinkedMode: () => void;
  loadLayout: (layout: LayoutConfig) => void;
  getLayout: () => LayoutConfig;
  reset: () => void;
}

let paneCounter = 1;
const defaultPane = (symbol = "BTCUSDT"): PaneConfig => ({
  id: `pane-${paneCounter++}`,
  symbol,
  interval: "1m",
  indicators: [],
  chartType: "candle",
  linked: false,
});

export const useLayoutStore = create<LayoutState>((set, get) => ({
  panes: [defaultPane()],
  activePaneId: "pane-1",
  linkedMode: false,

  addPane: (pane) =>
    set((s) => ({ panes: [...s.panes, pane ?? defaultPane()] })),

  removePane: (id) =>
    set((s) => ({
      panes: s.panes.filter((p) => p.id !== id),
      activePaneId: s.activePaneId === id ? s.panes[0]?.id ?? null : s.activePaneId,
    })),

  updatePane: (id, updates) =>
    set((s) => {
      const newPanes = s.panes.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      );
      if (s.linkedMode && (updates.symbol || updates.interval)) {
        return {
          panes: newPanes.map((p) =>
            p.id !== id
              ? {
                  ...p,
                  ...(updates.symbol ? { symbol: updates.symbol } : {}),
                  ...(updates.interval ? { interval: updates.interval } : {}),
                }
              : p
          ),
        };
      }
      return { panes: newPanes };
    }),

  setActivePane: (id) => set({ activePaneId: id }),

  toggleLinkedMode: () =>
    set((s) => ({ linkedMode: !s.linkedMode })),

  loadLayout: (layout) =>
    set({
      panes: layout.panes.length > 0 ? layout.panes : [defaultPane()],
      activePaneId: layout.panes[0]?.id ?? null,
    }),

  getLayout: () => {
    const s = get();
    return { name: "default", panes: s.panes };
  },

  reset: () => {
    paneCounter = 1;
    set({ panes: [defaultPane()], activePaneId: "pane-1" });
  },
}));
