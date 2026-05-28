import { describe, expect, it, beforeEach, vi } from "vitest";

import { useReplayStore } from "../useReplayStore";

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  readyState: number = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(_url: string) {
    setTimeout(() => this.onopen?.(), 0);
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("WebSocket", MockWebSocket);

  // Reset the store's internal state including the closure variables
  // We do this by creating a fresh store state
  useReplayStore.setState({
    playing: false,
    speed: 1,
    progress: 0,
    tickCount: 0,
    symbol: "BTCUSDT",
    loaded: false,
    loading: false,
    error: null,
  });
});

describe("useReplayStore", () => {
  it("starts with default state", () => {
    const state = useReplayStore.getState();
    expect(state.playing).toBe(false);
    expect(state.speed).toBe(1);
    expect(state.progress).toBe(0);
    expect(state.tickCount).toBe(0);
    expect(state.symbol).toBe("BTCUSDT");
    expect(state.loaded).toBe(false);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  describe("setSpeed", () => {
    it("updates speed locally", () => {
      useReplayStore.getState().setSpeed(5);
      expect(useReplayStore.getState().speed).toBe(5);
    });
  });

  describe("setProgress", () => {
    it("updates progress", () => {
      useReplayStore.getState().setProgress(50);
      expect(useReplayStore.getState().progress).toBe(50);
    });
  });

  describe("stepForward", () => {
    it("increments tickCount by default count of 1", () => {
      useReplayStore.getState().stepForward();
      expect(useReplayStore.getState().tickCount).toBe(1);
    });

    it("increments tickCount by specified count", () => {
      useReplayStore.getState().stepForward(5);
      expect(useReplayStore.getState().tickCount).toBe(5);
    });
  });

  describe("loadReplay", () => {
    it("loads replay successfully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: true }),
      }));

      await useReplayStore.getState().loadReplay("BTCUSDT", "1m");
      const state = useReplayStore.getState();
      expect(state.loaded).toBe(true);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.progress).toBe(0);
      expect(state.tickCount).toBe(0);
    });

    it("sets error on server failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: false, error: "No data available" }),
      }));

      await useReplayStore.getState().loadReplay("INVALID", "1m");
      const state = useReplayStore.getState();
      expect(state.loaded).toBe(false);
      expect(state.loading).toBe(false);
      expect(state.error).toBe("No data available");
    });

    it("handles fetch error gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      await useReplayStore.getState().loadReplay("BTCUSDT", "1m");
      const state = useReplayStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBeTruthy();
    });
  });

  describe("reset", () => {
    it("resets all replay state", () => {
      useReplayStore.setState({ playing: true, speed: 5, progress: 80, tickCount: 100, loaded: true });
      useReplayStore.getState().reset();
      const state = useReplayStore.getState();
      expect(state.playing).toBe(false);
      expect(state.speed).toBe(1);
      expect(state.progress).toBe(0);
      expect(state.tickCount).toBe(0);
      expect(state.loaded).toBe(false);
      expect(state.error).toBeNull();
    });
  });
});
