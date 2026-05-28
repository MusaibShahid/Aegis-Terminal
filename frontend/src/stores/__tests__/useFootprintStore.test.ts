import { describe, expect, it, beforeEach } from "vitest";

import { useFootprintStore } from "../useFootprintStore";
import type { FootprintData, VPVRData, DeltaData } from "../../types";

const mockFootprint = (symbol: string): FootprintData => ({
  symbol,
  levels: [{ price: 100, bid_volume: 100, ask_volume: 50, total_volume: 150, delta: 50, imbalance: 0.33, intensity: 0.5 }],
  max_volume: 150,
});

const mockVPVR = (symbol: string): VPVRData => ({
  symbol,
  levels: [{ price: 100, volume: 1000, is_poc: true, in_value_area: true }],
  poc: 100,
  vah: 110,
  val: 90,
  total_volume: 1000,
});

const mockDelta = (symbol: string): DeltaData => ({
  symbol,
  candle_delta: { buy_volume: 500, sell_volume: 300, delta: 200, total_volume: 800 },
  cumulative_delta: 200,
  delta_series: [{ timestamp: 1000, cumulative_delta: 200 }],
});

beforeEach(() => {
  useFootprintStore.setState({ footprint: {}, vpvr: {}, delta: {} });
});

describe("useFootprintStore", () => {
  it("starts empty", () => {
    const state = useFootprintStore.getState();
    expect(state.footprint).toEqual({});
    expect(state.vpvr).toEqual({});
    expect(state.delta).toEqual({});
  });

  it("setFootprint stores by symbol", () => {
    useFootprintStore.getState().setFootprint("BTCUSDT", mockFootprint("BTCUSDT"));
    expect(useFootprintStore.getState().footprint["BTCUSDT"]).toBeDefined();
    expect(useFootprintStore.getState().footprint["BTCUSDT"].max_volume).toBe(150);
  });

  it("setFootprint overwrites existing data for same symbol", () => {
    useFootprintStore.getState().setFootprint("BTCUSDT", mockFootprint("BTCUSDT"));
    useFootprintStore.getState().setFootprint("BTCUSDT", { ...mockFootprint("BTCUSDT"), max_volume: 999 });
    expect(useFootprintStore.getState().footprint["BTCUSDT"].max_volume).toBe(999);
  });

  it("setVPVR stores by symbol", () => {
    useFootprintStore.getState().setVPVR("BTCUSDT", mockVPVR("BTCUSDT"));
    expect(useFootprintStore.getState().vpvr["BTCUSDT"].poc).toBe(100);
  });

  it("setDelta stores by symbol", () => {
    useFootprintStore.getState().setDelta("BTCUSDT", mockDelta("BTCUSDT"));
    expect(useFootprintStore.getState().delta["BTCUSDT"].cumulative_delta).toBe(200);
  });

  it("stores different symbols independently", () => {
    useFootprintStore.getState().setFootprint("BTCUSDT", mockFootprint("BTCUSDT"));
    useFootprintStore.getState().setFootprint("ETHUSDT", mockFootprint("ETHUSDT"));
    expect(Object.keys(useFootprintStore.getState().footprint)).toHaveLength(2);
  });
});
