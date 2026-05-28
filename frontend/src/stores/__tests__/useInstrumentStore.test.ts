import { describe, expect, it, beforeEach, vi } from "vitest";

import { useInstrumentStore } from "../useInstrumentStore";

const mockInstruments = [
  { symbol: "BTCUSDT", display_name: "Bitcoin", market_type: "crypto", source: "binance", tick_size: 0.01, precision: 2, timezone: "UTC" },
  { symbol: "ETHUSDT", display_name: "Ethereum", market_type: "crypto", source: "binance", tick_size: 0.01, precision: 2, timezone: "UTC" },
];

const mockMarketTypes = ["crypto", "metal", "forex"];

beforeEach(() => {
  vi.restoreAllMocks();
  useInstrumentStore.setState({ instruments: [], marketTypes: [], loading: false });
});

describe("useInstrumentStore", () => {
  it("starts with empty state", () => {
    const state = useInstrumentStore.getState();
    expect(state.instruments).toEqual([]);
    expect(state.marketTypes).toEqual([]);
    expect(state.loading).toBe(false);
  });

  it("setInstruments replaces instruments", () => {
    useInstrumentStore.getState().setInstruments(mockInstruments);
    expect(useInstrumentStore.getState().instruments).toHaveLength(2);
    expect(useInstrumentStore.getState().instruments[0].symbol).toBe("BTCUSDT");
  });

  it("setMarketTypes replaces market types", () => {
    useInstrumentStore.getState().setMarketTypes(mockMarketTypes);
    expect(useInstrumentStore.getState().marketTypes).toEqual(["crypto", "metal", "forex"]);
  });

  describe("fetch", () => {
    it("fetches instruments and market types", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockInstruments) })
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockMarketTypes) });
      vi.stubGlobal("fetch", mockFetch);

      await useInstrumentStore.getState().fetch();
      const state = useInstrumentStore.getState();
      expect(state.instruments).toHaveLength(2);
      expect(state.marketTypes).toEqual(["crypto", "metal", "forex"]);
      expect(state.loading).toBe(false);
    });

    it("sets loading state during fetch", async () => {
      let resolveFetch!: (value: any) => void;
      const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });

      const mockFetch = vi
        .fn()
        .mockReturnValueOnce(fetchPromise)
        .mockReturnValueOnce(fetchPromise);

      vi.stubGlobal("fetch", mockFetch);

      const fetchCall = useInstrumentStore.getState().fetch();
      expect(useInstrumentStore.getState().loading).toBe(true);

      resolveFetch({ json: () => Promise.resolve([]) });
      await fetchCall;
      expect(useInstrumentStore.getState().loading).toBe(false);
    });

    it("handles fetch error gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
      await useInstrumentStore.getState().fetch();
      const state = useInstrumentStore.getState();
      expect(state.loading).toBe(false);
      expect(state.instruments).toEqual([]);
    });
  });

  describe("search", () => {
    it("returns empty array for empty query", async () => {
      const result = await useInstrumentStore.getState().search("");
      expect(result).toEqual([]);
    });

    it("calls search API with encoded query", async () => {
      const mockResults = [{ symbol: "BTCUSDT", display_name: "Bitcoin", market_type: "crypto", source: "binance", tick_size: 0.01, precision: 2, timezone: "UTC" }];
      const mockFetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockResults),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await useInstrumentStore.getState().search("BTC");
      expect(result).toEqual(mockResults);
      expect(mockFetch).toHaveBeenCalledWith("/api/instruments/search?q=BTC");
    });

    it("handles search error gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
      const result = await useInstrumentStore.getState().search("BTC");
      expect(result).toEqual([]);
    });
  });
});
