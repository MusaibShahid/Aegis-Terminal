import { describe, expect, it, beforeEach } from "vitest";

import { useCountdownStore } from "../useCountdownStore";
import type { CandleCountdown } from "../../types";

beforeEach(() => {
  useCountdownStore.setState({ countdowns: {}, globalSession: "unknown", serverTime: 0, lastTick: 0 });
});

describe("useCountdownStore", () => {
  it("starts with default values", () => {
    const state = useCountdownStore.getState();
    expect(state.countdowns).toEqual({});
    expect(state.globalSession).toBe("unknown");
    expect(state.serverTime).toBe(0);
    expect(state.lastTick).toBe(0);
  });

  it("update sets all fields", () => {
    const now = Date.now();
    const msg = {
      countdowns: {
        "BTCUSDT:1m": {
          symbol: "BTCUSDT",
          interval: "1m",
          open_time: 1000,
          close_time: 2000,
          remaining_seconds: 30,
          server_time: now,
          session: "Asia",
        } as CandleCountdown,
      },
      session: "London",
      server_time: now,
    };
    useCountdownStore.getState().update(msg);
    const state = useCountdownStore.getState();
    expect(state.countdowns["BTCUSDT:1m"]).toBeDefined();
    expect(state.countdowns["BTCUSDT:1m"].remaining_seconds).toBe(30);
    expect(state.globalSession).toBe("London");
    expect(state.serverTime).toBe(now);
    expect(state.lastTick).toBeGreaterThan(0);
  });

  it("update overrides previous countdowns", () => {
    const msg1 = {
      countdowns: { "BTCUSDT:1m": { symbol: "BTCUSDT", interval: "1m", open_time: 1000, close_time: 2000, remaining_seconds: 30, server_time: 100, session: "Asia" } },
      session: "London",
      server_time: 100,
    };
    const msg2 = {
      countdowns: { "ETHUSDT:5m": { symbol: "ETHUSDT", interval: "5m", open_time: 3000, close_time: 6000, remaining_seconds: 120, server_time: 200, session: "New York" } },
      session: "New York",
      server_time: 200,
    };
    useCountdownStore.getState().update(msg1);
    useCountdownStore.getState().update(msg2);
    const state = useCountdownStore.getState();
    // countdowns should be replaced entirely by msg2
    expect(state.countdowns["BTCUSDT:1m"]).toBeUndefined();
    expect(state.countdowns["ETHUSDT:5m"]).toBeDefined();
    expect(state.globalSession).toBe("New York");
    expect(state.serverTime).toBe(200);
  });
});
