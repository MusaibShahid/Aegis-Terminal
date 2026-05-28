import { describe, expect, it, beforeEach } from "vitest";

import { useMarketStore } from "../useMarketStore";
import type { Candle, Quote } from "../../types";

const mockCandle = (time: number, overrides?: Partial<Candle>): Candle => ({
  time,
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  volume: 1000,
  ...overrides,
});

const mockQuote = (symbol: string, overrides?: Partial<Quote>): Quote => ({
  symbol,
  bid: 100,
  ask: 101,
  timestamp: Date.now(),
  ...overrides,
});

beforeEach(() => {
  useMarketStore.setState({ candles: {}, quotes: {} });
});

describe("useMarketStore", () => {
  it("starts with empty candles and quotes", () => {
    const state = useMarketStore.getState();
    expect(state.candles).toEqual({});
    expect(state.quotes).toEqual({});
  });

  it("adds a candle under symbol:interval key", () => {
    useMarketStore.getState().addCandle("BTCUSDT", "1m", mockCandle(1000));
    const state = useMarketStore.getState();
    expect(state.candles["BTCUSDT:1m"]).toHaveLength(1);
    expect(state.candles["BTCUSDT:1m"][0].close).toBe(105);
  });

  it("replaces last candle if same time (update)", () => {
    useMarketStore.getState().addCandle("BTCUSDT", "1m", mockCandle(1000, { close: 100 }));
    useMarketStore.getState().addCandle("BTCUSDT", "1m", mockCandle(1000, { close: 110 }));
    const candles = useMarketStore.getState().candles["BTCUSDT:1m"];
    expect(candles).toHaveLength(1);
    expect(candles[0].close).toBe(110);
  });

  it("appends candles with different times", () => {
    useMarketStore.getState().addCandle("BTCUSDT", "1m", mockCandle(1000));
    useMarketStore.getState().addCandle("BTCUSDT", "1m", mockCandle(2000));
    const candles = useMarketStore.getState().candles["BTCUSDT:1m"];
    expect(candles).toHaveLength(2);
    expect(candles[0].time).toBe(1000);
    expect(candles[1].time).toBe(2000);
  });

  it("caps candles at 1000", () => {
    const store = useMarketStore.getState();
    for (let i = 0; i < 1500; i++) {
      store.addCandle("BTCUSDT", "1m", mockCandle(i * 1000));
    }
    expect(useMarketStore.getState().candles["BTCUSDT:1m"]).toHaveLength(1000);
  });

  it("updates quote for a symbol", () => {
    useMarketStore.getState().updateQuote("BTCUSDT", mockQuote("BTCUSDT", { bid: 50000 }));
    const quote = useMarketStore.getState().quotes["BTCUSDT"];
    expect(quote).toBeDefined();
    expect(quote.bid).toBe(50000);
  });

  it("replaces existing quote for same symbol", () => {
    useMarketStore.getState().updateQuote("BTCUSDT", mockQuote("BTCUSDT", { ask: 50001 }));
    useMarketStore.getState().updateQuote("BTCUSDT", mockQuote("BTCUSDT", { ask: 50002 }));
    expect(useMarketStore.getState().quotes["BTCUSDT"].ask).toBe(50002);
  });

  it("setCandles replaces all candles for a symbol:interval", () => {
    useMarketStore.getState().addCandle("BTCUSDT", "1m", mockCandle(1000));
    const newCandles = [mockCandle(3000), mockCandle(4000)];
    useMarketStore.getState().setCandles("BTCUSDT", "1m", newCandles);
    expect(useMarketStore.getState().candles["BTCUSDT:1m"]).toHaveLength(2);
    expect(useMarketStore.getState().candles["BTCUSDT:1m"][0].time).toBe(3000);
  });

  it("clear resets all state", () => {
    useMarketStore.getState().addCandle("BTCUSDT", "1m", mockCandle(1000));
    useMarketStore.getState().updateQuote("BTCUSDT", mockQuote("BTCUSDT"));
    useMarketStore.getState().clear();
    const state = useMarketStore.getState();
    expect(state.candles).toEqual({});
    expect(state.quotes).toEqual({});
  });

  it("separates candles by symbol and interval", () => {
    useMarketStore.getState().addCandle("BTCUSDT", "1m", mockCandle(1000));
    useMarketStore.getState().addCandle("ETHUSDT", "5m", mockCandle(2000));
    const state = useMarketStore.getState();
    expect(state.candles["BTCUSDT:1m"]).toHaveLength(1);
    expect(state.candles["ETHUSDT:5m"]).toHaveLength(1);
  });
});
