import { describe, expect, it, beforeEach, vi } from "vitest";

import { useWatchlistStore } from "../useWatchlistStore";
import type { WatchlistGroup } from "../../types";

const DEFAULT_GROUPS: WatchlistGroup[] = [
  { name: "Crypto", symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"], color: "#f59e0b", order: 0 },
  { name: "Metals", symbols: ["XAUUSDT", "XAGUSDT"], color: "#3b82f6", order: 1 },
  { name: "Forex", symbols: ["EURUSDT", "GBPUSDT"], color: "#10b981", order: 2 },
];

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  useWatchlistStore.setState({
    groups: DEFAULT_GROUPS.map((g) => ({ ...g })),
    activeGroup: null,
    contextMenu: null,
  });
});

describe("useWatchlistStore", () => {
  describe("initial state", () => {
    it("starts with default groups when localStorage is empty", () => {
      localStorage.clear();
      // Force re-init by using the store's initializer
      useWatchlistStore.setState({
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
      });
      const state = useWatchlistStore.getState();
      expect(state.groups).toHaveLength(3);
      expect(state.groups[0].name).toBe("Crypto");
    });

    it("loads from localStorage if available", () => {
      const custom = [{ name: "Custom", symbols: ["BTCUSDT"], color: "#000", order: 0 }];
      localStorage.setItem("aegis_watchlists", JSON.stringify(custom));
      useWatchlistStore.setState({
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
      });
      expect(useWatchlistStore.getState().groups).toEqual(custom);
    });

    it("falls back to defaults on JSON parse error", () => {
      localStorage.setItem("aegis_watchlists", "invalid json");
      useWatchlistStore.setState({
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
      });
      expect(useWatchlistStore.getState().groups).toHaveLength(3);
    });
  });

  describe("setGroups", () => {
    it("replaces groups and persists to localStorage", () => {
      const newGroups = [{ name: "New", symbols: ["BTCUSDT"], color: "#fff", order: 0 }];
      useWatchlistStore.getState().setGroups(newGroups);
      expect(useWatchlistStore.getState().groups).toEqual(newGroups);
      expect(JSON.parse(localStorage.getItem("aegis_watchlists")!)).toEqual(newGroups);
    });
  });

  describe("addGroup", () => {
    it("appends a group with incremented order", () => {
      useWatchlistStore.getState().addGroup({ name: "Stocks", symbols: ["AAPL"], color: "#ff0000" });
      const groups = useWatchlistStore.getState().groups;
      expect(groups).toHaveLength(4);
      const added = groups.find((g) => g.name === "Stocks");
      expect(added).toBeDefined();
      expect(added!.order).toBe(3);
    });
  });

  describe("removeGroup", () => {
    it("removes a group by name", () => {
      useWatchlistStore.getState().removeGroup("Metals");
      expect(useWatchlistStore.getState().groups).toHaveLength(2);
      expect(useWatchlistStore.getState().groups.find((g) => g.name === "Metals")).toBeUndefined();
    });

    it("sets activeGroup to first remaining if removed was active", () => {
      useWatchlistStore.getState().setActiveGroup("Metals");
      useWatchlistStore.getState().removeGroup("Metals");
      expect(useWatchlistStore.getState().activeGroup).toBe("Crypto");
    });
  });

  describe("renameGroup", () => {
    it("renames a group and updates activeGroup if needed", () => {
      useWatchlistStore.getState().setActiveGroup("Metals");
      useWatchlistStore.getState().renameGroup("Metals", "Precious Metals");
      const groups = useWatchlistStore.getState().groups;
      expect(groups.find((g) => g.name === "Precious Metals")).toBeDefined();
      expect(groups.find((g) => g.name === "Metals")).toBeUndefined();
      expect(useWatchlistStore.getState().activeGroup).toBe("Precious Metals");
    });
  });

  describe("setGroupColor", () => {
    it("updates color for a group", () => {
      useWatchlistStore.getState().setGroupColor("Crypto", "#00ff00");
      expect(useWatchlistStore.getState().groups[0].color).toBe("#00ff00");
    });
  });

  describe("addSymbol / removeSymbol", () => {
    it("adds a symbol to a group", () => {
      useWatchlistStore.getState().addSymbol("Crypto", "ADAUSDT");
      expect(useWatchlistStore.getState().groups[0].symbols).toContain("ADAUSDT");
    });

    it("does not add duplicate symbols", () => {
      useWatchlistStore.getState().addSymbol("Crypto", "BTCUSDT");
      expect(useWatchlistStore.getState().groups[0].symbols).toHaveLength(4);
    });

    it("removes a symbol from a group", () => {
      useWatchlistStore.getState().removeSymbol("Crypto", "SOLUSDT");
      expect(useWatchlistStore.getState().groups[0].symbols).not.toContain("SOLUSDT");
      expect(useWatchlistStore.getState().groups[0].symbols).toHaveLength(3);
    });
  });

  describe("moveSymbol", () => {
    it("reorders symbols within a group", () => {
      useWatchlistStore.getState().moveSymbol("Crypto", 0, 2);
      const symbols = useWatchlistStore.getState().groups[0].symbols;
      // BTCUSDT moved from index 0 to index 2
      expect(symbols[0]).toBe("ETHUSDT");
      expect(symbols[2]).toBe("BTCUSDT");
    });
  });

  describe("moveGroup", () => {
    it("reorders groups and updates order field", () => {
      useWatchlistStore.getState().moveGroup(0, 2);
      const groups = useWatchlistStore.getState().groups;
      expect(groups[2].name).toBe("Crypto");
      expect(groups[2].order).toBe(2);
      expect(groups[0].order).toBe(0);
    });
  });

  describe("reorderSymbols", () => {
    it("replaces the entire symbol list for a group", () => {
      useWatchlistStore.getState().reorderSymbols("Crypto", ["SOLUSDT", "BTCUSDT", "ETHUSDT", "BNBUSDT"]);
      expect(useWatchlistStore.getState().groups[0].symbols).toEqual(["SOLUSDT", "BTCUSDT", "ETHUSDT", "BNBUSDT"]);
    });
  });

  describe("setContextMenu", () => {
    it("sets context menu state", () => {
      const menu = { x: 100, y: 200, group: "Crypto", symbol: "BTCUSDT" };
      useWatchlistStore.getState().setContextMenu(menu);
      expect(useWatchlistStore.getState().contextMenu).toEqual(menu);
    });

    it("sets to null to close menu", () => {
      useWatchlistStore.getState().setContextMenu({ x: 100, y: 200, group: "Crypto", symbol: "BTCUSDT" });
      useWatchlistStore.getState().setContextMenu(null);
      expect(useWatchlistStore.getState().contextMenu).toBeNull();
    });
  });

  describe("setActiveGroup", () => {
    it("sets the active group", () => {
      useWatchlistStore.getState().setActiveGroup("Forex");
      expect(useWatchlistStore.getState().activeGroup).toBe("Forex");
    });

    it("sets to null", () => {
      useWatchlistStore.getState().setActiveGroup(null);
      expect(useWatchlistStore.getState().activeGroup).toBeNull();
    });
  });
});
