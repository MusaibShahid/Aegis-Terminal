import { describe, expect, it, beforeEach, vi } from "vitest";

import { useDrawingStore } from "../useDrawingStore";
import type { Drawing } from "../../types";

const mockDrawing = (overrides?: Partial<Drawing>): Drawing => ({
  id: "d-1",
  paneId: "pane-1",
  tool: "trendline",
  points: [{ time: 1000, price: 100 }, { time: 2000, price: 110 }],
  color: "#3b82f6",
  ...overrides,
});

beforeEach(() => {
  vi.restoreAllMocks();
  useDrawingStore.setState({
    drawings: [],
    activeTool: null,
    history: [[]],
    historyIndex: 0,
    loading: false,
  });
});

describe("useDrawingStore", () => {
  it("starts with empty state", () => {
    const state = useDrawingStore.getState();
    expect(state.drawings).toEqual([]);
    expect(state.activeTool).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.historyIndex).toBe(0);
  });

  describe("setActiveTool", () => {
    it("sets the active tool", () => {
      useDrawingStore.getState().setActiveTool({ tool: "trendline" });
      expect(useDrawingStore.getState().activeTool).toEqual({ tool: "trendline" });
    });

    it("sets to null to deactivate", () => {
      useDrawingStore.getState().setActiveTool({ tool: "trendline" });
      useDrawingStore.getState().setActiveTool(null);
      expect(useDrawingStore.getState().activeTool).toBeNull();
    });
  });

  describe("addDrawing", () => {
    it("adds a drawing locally", async () => {
      const drawing = mockDrawing();
      await useDrawingStore.getState().addDrawing(drawing);
      expect(useDrawingStore.getState().drawings).toHaveLength(1);
      expect(useDrawingStore.getState().drawings[0].id).toBe("d-1");
    });

    it("adds drawing to history", async () => {
      await useDrawingStore.getState().addDrawing(mockDrawing());
      expect(useDrawingStore.getState().historyIndex).toBe(1);
    });

    it("sends drawing to backend", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 42 }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await useDrawingStore.getState().addDrawing(mockDrawing());
      // Should have been called with POST /api/drawings
      expect(mockFetch).toHaveBeenCalledWith("/api/drawings", expect.objectContaining({ method: "POST" }));
    });

    it("updates _serverId after successful backend save", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 42 }),
      }));

      await useDrawingStore.getState().addDrawing(mockDrawing());
      expect(useDrawingStore.getState().drawings[0]._serverId).toBe(42);
    });
  });

  describe("removeDrawing", () => {
    it("removes a drawing by id", async () => {
      await useDrawingStore.getState().addDrawing(mockDrawing({ id: "d-1" }));
      await useDrawingStore.getState().addDrawing(mockDrawing({ id: "d-2" }));
      await useDrawingStore.getState().removeDrawing("d-1");
      expect(useDrawingStore.getState().drawings).toHaveLength(1);
      expect(useDrawingStore.getState().drawings[0].id).toBe("d-2");
    });

    it("sends DELETE to backend when _serverId exists", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      await useDrawingStore.getState().addDrawing(mockDrawing({ id: "d-1" }));
      // Set _serverId after add
      useDrawingStore.getState().drawings[0]._serverId = 42;
      await useDrawingStore.getState().removeDrawing("d-1");
      expect(mockFetch).toHaveBeenCalledWith("/api/drawings/42", expect.objectContaining({ method: "DELETE" }));
    });
  });

  describe("updateDrawing", () => {
    it("updates a drawing's properties", async () => {
      await useDrawingStore.getState().addDrawing(mockDrawing({ id: "d-1", color: "#ff0000" }));
      await useDrawingStore.getState().updateDrawing("d-1", { color: "#00ff00" });
      expect(useDrawingStore.getState().drawings[0].color).toBe("#00ff00");
    });

    it("sends PUT to backend when _serverId exists", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

      await useDrawingStore.getState().addDrawing(mockDrawing({ id: "d-1" }));
      useDrawingStore.getState().drawings[0]._serverId = 42;
      await useDrawingStore.getState().updateDrawing("d-1", { color: "#00ff00" });
      expect(fetch).toHaveBeenCalledWith("/api/drawings/42", expect.objectContaining({ method: "PUT" }));
    });

    it("does nothing if drawing not found", async () => {
      await useDrawingStore.getState().updateDrawing("non-existent", { color: "#000" });
      expect(useDrawingStore.getState().drawings).toEqual([]);
    });
  });

  describe("clearPane", () => {
    it("removes all drawings for a pane", async () => {
      await useDrawingStore.getState().addDrawing(mockDrawing({ id: "d-1", paneId: "pane-1" }));
      await useDrawingStore.getState().addDrawing(mockDrawing({ id: "d-2", paneId: "pane-2" }));
      await useDrawingStore.getState().addDrawing(mockDrawing({ id: "d-3", paneId: "pane-1" }));
      useDrawingStore.getState().clearPane("pane-1");
      expect(useDrawingStore.getState().drawings).toHaveLength(1);
      expect(useDrawingStore.getState().drawings[0].paneId).toBe("pane-2");
    });
  });

  describe("undo / redo", () => {
    it("undo reverts to previous state", async () => {
      await useDrawingStore.getState().addDrawing(mockDrawing({ id: "d-1" }));
      await useDrawingStore.getState().addDrawing(mockDrawing({ id: "d-2" }));
      expect(useDrawingStore.getState().drawings).toHaveLength(2);

      useDrawingStore.getState().undo();
      expect(useDrawingStore.getState().drawings).toHaveLength(1);
    });

    it("redo restores undone changes", async () => {
      await useDrawingStore.getState().addDrawing(mockDrawing({ id: "d-1" }));
      useDrawingStore.getState().undo();
      expect(useDrawingStore.getState().drawings).toHaveLength(0);

      useDrawingStore.getState().redo();
      expect(useDrawingStore.getState().drawings).toHaveLength(1);
    });

    it("undo at start does nothing", () => {
      useDrawingStore.getState().undo();
      expect(useDrawingStore.getState().historyIndex).toBe(0);
    });

    it("redo at end does nothing", () => {
      useDrawingStore.getState().redo();
      expect(useDrawingStore.getState().historyIndex).toBe(0);
    });
  });

  describe("setDrawings", () => {
    it("replaces all drawings and pushes history", () => {
      useDrawingStore.getState().setDrawings([mockDrawing({ id: "d-1" }), mockDrawing({ id: "d-2" })]);
      expect(useDrawingStore.getState().drawings).toHaveLength(2);
      expect(useDrawingStore.getState().historyIndex).toBe(1);
    });
  });

  describe("loadDrawings", () => {
    it("loads drawings from backend", async () => {
      const backendItems = [
        { id: 1, data: { id: "d-1", paneId: "pane-1", tool: "trendline", points: [{ time: 1000, price: 100 }] } },
      ];
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(backendItems),
      }));

      await useDrawingStore.getState().loadDrawings("pane-1");
      const state = useDrawingStore.getState();
      expect(state.drawings).toHaveLength(1);
      expect(state.drawings[0].id).toBe("d-1");
      expect(state.drawings[0]._serverId).toBe(1);
      expect(state.loading).toBe(false);
    });

    it("handles load error gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
      await useDrawingStore.getState().loadDrawings("pane-1");
      expect(useDrawingStore.getState().loading).toBe(false);
    });

    it("handles non-ok response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      await useDrawingStore.getState().loadDrawings("pane-1");
      expect(useDrawingStore.getState().loading).toBe(false);
    });
  });
});
