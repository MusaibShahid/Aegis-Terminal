import { create } from "zustand";

import type { WatchlistGroup } from "../types";

const DEFAULT_GROUPS: WatchlistGroup[] = [
  { name: "Crypto", symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"], color: "#f59e0b", order: 0 },
  { name: "Metals", symbols: ["XAUUSDT", "XAGUSDT"], color: "#3b82f6", order: 1 },
  { name: "Forex", symbols: ["EURUSDT", "GBPUSDT"], color: "#10b981", order: 2 },
];

interface WatchlistState {
  groups: WatchlistGroup[];
  activeGroup: string | null;
  contextMenu: { x: number; y: number; group: string; symbol: string } | null;
  setGroups: (groups: WatchlistGroup[]) => void;
  addGroup: (group: WatchlistGroup) => void;
  removeGroup: (name: string) => void;
  renameGroup: (oldName: string, newName: string) => void;
  setGroupColor: (name: string, color: string) => void;
  setActiveGroup: (name: string | null) => void;
  addSymbol: (groupName: string, symbol: string) => void;
  removeSymbol: (groupName: string, symbol: string) => void;
  moveSymbol: (groupName: string, fromIndex: number, toIndex: number) => void;
  moveGroup: (fromIndex: number, toIndex: number) => void;
  reorderSymbols: (groupName: string, symbols: string[]) => void;
  setContextMenu: (menu: WatchlistState["contextMenu"]) => void;
}

export const useWatchlistStore = create<WatchlistState>((set) => ({
  groups: (() => {
    try {
      const stored = localStorage.getItem("aegis_watchlists");
      return stored ? JSON.parse(stored) : DEFAULT_GROUPS;
    } catch {
      return DEFAULT_GROUPS;
    }
  })(),
  activeGroup: null,
  contextMenu: null,

  setGroups: (groups) => {
    localStorage.setItem("aegis_watchlists", JSON.stringify(groups));
    set({ groups });
  },

  addGroup: (group) =>
    set((s) => {
      const next = [...s.groups, { ...group, order: s.groups.length }];
      localStorage.setItem("aegis_watchlists", JSON.stringify(next));
      return { groups: next };
    }),

  removeGroup: (name) =>
    set((s) => {
      const next = s.groups.filter((g) => g.name !== name);
      localStorage.setItem("aegis_watchlists", JSON.stringify(next));
      return {
        groups: next,
        activeGroup: s.activeGroup === name
          ? (next[0]?.name ?? null)
          : s.activeGroup,
      };
    }),

  renameGroup: (oldName, newName) =>
    set((s) => {
      const next = s.groups.map((g) =>
        g.name === oldName ? { ...g, name: newName } : g
      );
      localStorage.setItem("aegis_watchlists", JSON.stringify(next));
      return {
        groups: next,
        activeGroup: s.activeGroup === oldName ? newName : s.activeGroup,
      };
    }),

  setGroupColor: (name, color) =>
    set((s) => {
      const next = s.groups.map((g) =>
        g.name === name ? { ...g, color } : g
      );
      localStorage.setItem("aegis_watchlists", JSON.stringify(next));
      return { groups: next };
    }),

  setActiveGroup: (name) => set({ activeGroup: name }),

  addSymbol: (groupName, symbol) =>
    set((s) => {
      const next = s.groups.map((g) =>
        g.name === groupName && !g.symbols.includes(symbol)
          ? { ...g, symbols: [...g.symbols, symbol] }
          : g
      );
      localStorage.setItem("aegis_watchlists", JSON.stringify(next));
      return { groups: next };
    }),

  removeSymbol: (groupName, symbol) =>
    set((s) => {
      const next = s.groups.map((g) =>
        g.name === groupName
          ? { ...g, symbols: g.symbols.filter((s) => s !== symbol) }
          : g
      );
      localStorage.setItem("aegis_watchlists", JSON.stringify(next));
      return { groups: next };
    }),

  moveSymbol: (groupName, fromIndex, toIndex) =>
    set((s) => {
      const next = s.groups.map((g) => {
        if (g.name !== groupName) return g;
        const syms = [...g.symbols];
        const [moved] = syms.splice(fromIndex, 1);
        syms.splice(toIndex, 0, moved);
        return { ...g, symbols: syms };
      });
      localStorage.setItem("aegis_watchlists", JSON.stringify(next));
      return { groups: next };
    }),

  moveGroup: (fromIndex, toIndex) =>
    set((s) => {
      const next = [...s.groups];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      localStorage.setItem("aegis_watchlists", JSON.stringify(next));
      return { groups: next.map((g, i) => ({ ...g, order: i })) };
    }),

  reorderSymbols: (groupName, symbols) =>
    set((s) => {
      const next = s.groups.map((g) =>
        g.name === groupName ? { ...g, symbols } : g
      );
      localStorage.setItem("aegis_watchlists", JSON.stringify(next));
      return { groups: next };
    }),

  setContextMenu: (menu) => set({ contextMenu: menu }),
}));
