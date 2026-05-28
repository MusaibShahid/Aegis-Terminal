import { describe, expect, it, beforeEach } from "vitest";

import { useDOMStore } from "../useDOMStore";
import type { DepthData } from "../../types";

const mockDepth = (symbol: string): DepthData => ({
  symbol,
  bids: [{ price: 100, volume: 10 }],
  asks: [{ price: 101, volume: 8 }],
  timestamp: Date.now(),
});

beforeEach(() => {
  useDOMStore.setState({ depth: {} });
});

describe("useDOMStore", () => {
  it("starts with empty depth", () => {
    expect(useDOMStore.getState().depth).toEqual({});
  });

  it("setDepth stores by symbol", () => {
    useDOMStore.getState().setDepth("BTCUSDT", mockDepth("BTCUSDT"));
    expect(useDOMStore.getState().depth["BTCUSDT"]).toBeDefined();
    expect(useDOMStore.getState().depth["BTCUSDT"].bids).toHaveLength(1);
    expect(useDOMStore.getState().depth["BTCUSDT"].bids[0].price).toBe(100);
  });

  it("setDepth overwrites existing data", () => {
    useDOMStore.getState().setDepth("BTCUSDT", mockDepth("BTCUSDT"));
    useDOMStore.getState().setDepth("BTCUSDT", { ...mockDepth("BTCUSDT"), bids: [{ price: 99, volume: 20 }] });
    const depth = useDOMStore.getState().depth["BTCUSDT"];
    expect(depth.bids).toHaveLength(1);
    expect(depth.bids[0].price).toBe(99);
    expect(depth.bids[0].volume).toBe(20);
  });

  it("stores multiple symbols independently", () => {
    useDOMStore.getState().setDepth("BTCUSDT", mockDepth("BTCUSDT"));
    useDOMStore.getState().setDepth("ETHUSDT", mockDepth("ETHUSDT"));
    expect(Object.keys(useDOMStore.getState().depth)).toHaveLength(2);
  });

  it("preserves asks and bids structure", () => {
    useDOMStore.getState().setDepth("BTCUSDT", mockDepth("BTCUSDT"));
    const depth = useDOMStore.getState().depth["BTCUSDT"];
    expect(depth.asks).toHaveLength(1);
    expect(depth.asks[0].price).toBe(101);
    expect(depth.asks[0].volume).toBe(8);
  });
});
