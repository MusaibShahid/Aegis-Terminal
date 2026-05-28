import { describe, expect, it, beforeEach, vi } from "vitest";

import { useDependencyStore } from "../useDependencyStore";

const mockFeatures = {
  tick_engine: { ready: true, missing: [] },
  mt5_quotes: { ready: false, missing: ["MetaTrader5"] },
  binance_depth: { ready: true, missing: [] },
};

beforeEach(() => {
  vi.restoreAllMocks();
  useDependencyStore.setState({ features: {} });
});

describe("useDependencyStore", () => {
  it("starts with empty features", () => {
    expect(useDependencyStore.getState().features).toEqual({});
  });

  describe("fetch", () => {
    it("fetches dependency status from API", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockFeatures),
      }));

      await useDependencyStore.getState().fetch();
      expect(useDependencyStore.getState().features).toEqual(mockFeatures);
    });

    it("handles fetch error silently", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
      await useDependencyStore.getState().fetch();
      expect(useDependencyStore.getState().features).toEqual({});
    });

    it("handles non-ok response silently", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      await useDependencyStore.getState().fetch();
      expect(useDependencyStore.getState().features).toEqual({});
    });
  });

  describe("isReady", () => {
    it("returns true when feature is ready", () => {
      useDependencyStore.setState({ features: mockFeatures });
      expect(useDependencyStore.getState().isReady("tick_engine")).toBe(true);
    });

    it("returns false when feature is not ready", () => {
      useDependencyStore.setState({ features: mockFeatures });
      expect(useDependencyStore.getState().isReady("mt5_quotes")).toBe(false);
    });

    it("returns false when feature is unknown", () => {
      useDependencyStore.setState({ features: mockFeatures });
      expect(useDependencyStore.getState().isReady("unknown_feature")).toBe(false);
    });

    it("returns false when features are empty", () => {
      expect(useDependencyStore.getState().isReady("tick_engine")).toBe(false);
    });
  });
});
