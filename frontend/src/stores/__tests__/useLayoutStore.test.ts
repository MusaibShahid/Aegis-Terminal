import { describe, expect, it, beforeEach } from "vitest";

import { useLayoutStore } from "../useLayoutStore";
import type { LayoutConfig, PaneConfig } from "../../types";

beforeEach(() => {
  useLayoutStore.setState({ panes: [], activePaneId: null, linkedMode: false });
  // Reset the store to initial state (which creates a default pane)
  useLayoutStore.getState().reset();
});

describe("useLayoutStore", () => {
  it("starts with one default pane for BTCUSDT", () => {
    const state = useLayoutStore.getState();
    expect(state.panes).toHaveLength(1);
    expect(state.panes[0].symbol).toBe("BTCUSDT");
    expect(state.panes[0].interval).toBe("1m");
    expect(state.panes[0].chartType).toBe("candle");
    expect(state.activePaneId).toBeTruthy();
    expect(state.linkedMode).toBe(false);
  });

  it("addPane appends a new pane", () => {
    useLayoutStore.getState().addPane();
    expect(useLayoutStore.getState().panes).toHaveLength(2);
  });

  it("addPane with custom config", () => {
    const customPane: PaneConfig = {
      id: "pane-custom",
      symbol: "ETHUSDT",
      interval: "5m",
      indicators: [],
      oscillators: [],
      chartType: "footprint",
      linked: false,
    };
    useLayoutStore.getState().addPane(customPane);
    const panes = useLayoutStore.getState().panes;
    expect(panes).toHaveLength(2);
    const added = panes.find((p) => p.id === "pane-custom");
    expect(added).toBeDefined();
    expect(added!.symbol).toBe("ETHUSDT");
    expect(added!.chartType).toBe("footprint");
  });

  it("removePane removes pane and adjusts activePaneId", () => {
    const store = useLayoutStore.getState();
    const initialId = store.panes[0].id;

    store.addPane();
    const secondId = useLayoutStore.getState().panes[1].id;
    useLayoutStore.getState().setActivePane(secondId);
    expect(useLayoutStore.getState().activePaneId).toBe(secondId);

    useLayoutStore.getState().removePane(secondId);
    expect(useLayoutStore.getState().panes).toHaveLength(1);
    expect(useLayoutStore.getState().activePaneId).toBe(initialId);
  });

  it("updatePane updates a pane by id", () => {
    const store = useLayoutStore.getState();
    const paneId = store.panes[0].id;
    store.updatePane(paneId, { symbol: "ETHUSDT", interval: "15m" });
    const updated = useLayoutStore.getState().panes[0];
    expect(updated.symbol).toBe("ETHUSDT");
    expect(updated.interval).toBe("15m");
  });

  it("setActivePane sets the active pane", () => {
    useLayoutStore.getState().setActivePane("pane-foo");
    expect(useLayoutStore.getState().activePaneId).toBe("pane-foo");

    useLayoutStore.getState().setActivePane(null);
    expect(useLayoutStore.getState().activePaneId).toBeNull();
  });

  it("toggleLinkedMode flips linked mode", () => {
    expect(useLayoutStore.getState().linkedMode).toBe(false);
    useLayoutStore.getState().toggleLinkedMode();
    expect(useLayoutStore.getState().linkedMode).toBe(true);
    useLayoutStore.getState().toggleLinkedMode();
    expect(useLayoutStore.getState().linkedMode).toBe(false);
  });

  it("linked mode propagates symbol and interval changes to other panes", () => {
    const store = useLayoutStore.getState();
    store.addPane();
    store.toggleLinkedMode();

    const firstId = store.panes[0].id;
    const secondId = useLayoutStore.getState().panes[1].id;

    useLayoutStore.getState().updatePane(firstId, { symbol: "ETHUSDT", interval: "5m" });
    const panes = useLayoutStore.getState().panes;
    // Both panes should have the same symbol and interval
    expect(panes[0].symbol).toBe("ETHUSDT");
    expect(panes[1].symbol).toBe("ETHUSDT");
    expect(panes[0].interval).toBe("5m");
    expect(panes[1].interval).toBe("5m");
  });

  it("loadLayout sets panes from config", () => {
    const layout: LayoutConfig = {
      name: "test",
      panes: [
        { id: "p1", symbol: "SOLUSDT", interval: "1h", indicators: [], oscillators: [], chartType: "candle", linked: false },
      ],
    };
    useLayoutStore.getState().loadLayout(layout);
    expect(useLayoutStore.getState().panes).toHaveLength(1);
    expect(useLayoutStore.getState().panes[0].symbol).toBe("SOLUSDT");
    expect(useLayoutStore.getState().activePaneId).toBe("p1");
  });

  it("loadLayout with empty panes creates a default pane", () => {
    useLayoutStore.getState().loadLayout({ name: "empty", panes: [] });
    expect(useLayoutStore.getState().panes).toHaveLength(1);
    expect(useLayoutStore.getState().panes[0].symbol).toBe("BTCUSDT");
  });

  it("getLayout returns current layout", () => {
    const layout = useLayoutStore.getState().getLayout();
    expect(layout.name).toBe("default");
    expect(layout.panes).toHaveLength(1);
  });

  it("reset reinitializes to defaults", () => {
    useLayoutStore.getState().addPane();
    useLayoutStore.getState().setActivePane("pane-xyz");
    useLayoutStore.getState().reset();
    const state = useLayoutStore.getState();
    expect(state.panes).toHaveLength(1);
    expect(state.activePaneId).toBe("pane-1");
  });
});
