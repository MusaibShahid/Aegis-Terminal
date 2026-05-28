import { describe, expect, it, beforeEach } from "vitest";

import { useBotStore } from "../useBotStore";
import type { BotConfig, BotSignal } from "../../types";

const mockBot = (overrides?: Partial<BotConfig>): BotConfig => ({
  id: 1,
  name: "Test Bot",
  strategy: "ema_crossover",
  symbol: "BTCUSDT",
  params: { fastPeriod: 10, slowPeriod: 30 },
  riskParams: { maxRisk: 0.02 },
  enabled: true,
  ...overrides,
});

const mockSignal = (overrides?: Partial<BotSignal>): BotSignal => ({
  type: "entry",
  bot: "Test Bot",
  strategy: "ema_crossover",
  symbol: "BTCUSDT",
  action: "buy",
  price: 50000,
  volume: 0.1,
  time: Date.now(),
  ...overrides,
});

beforeEach(() => {
  useBotStore.setState({ bots: [], signals: [], positions: [] });
});

describe("useBotStore", () => {
  it("starts with empty state", () => {
    const state = useBotStore.getState();
    expect(state.bots).toEqual([]);
    expect(state.signals).toEqual([]);
    expect(state.positions).toEqual([]);
  });

  it("setBots replaces all bots", () => {
    const bots = [mockBot({ id: 1 }), mockBot({ id: 2, name: "Bot 2" })];
    useBotStore.getState().setBots(bots);
    expect(useBotStore.getState().bots).toHaveLength(2);
  });

  it("addBot appends a bot", () => {
    useBotStore.getState().addBot(mockBot({ id: 1 }));
    useBotStore.getState().addBot(mockBot({ id: 2 }));
    expect(useBotStore.getState().bots).toHaveLength(2);
  });

  it("removeBot removes by id", () => {
    useBotStore.getState().addBot(mockBot({ id: 1 }));
    useBotStore.getState().addBot(mockBot({ id: 2 }));
    useBotStore.getState().removeBot(1);
    expect(useBotStore.getState().bots).toHaveLength(1);
    expect(useBotStore.getState().bots[0].id).toBe(2);
  });

  it("toggleBot flips enabled flag", () => {
    useBotStore.getState().addBot(mockBot({ id: 1, enabled: true }));
    useBotStore.getState().toggleBot(1);
    expect(useBotStore.getState().bots[0].enabled).toBe(false);
    useBotStore.getState().toggleBot(1);
    expect(useBotStore.getState().bots[0].enabled).toBe(true);
  });

  it("addSignal appends a signal and caps at 50", () => {
    for (let i = 0; i < 60; i++) {
      useBotStore.getState().addSignal(mockSignal({ time: i }));
    }
    expect(useBotStore.getState().signals).toHaveLength(50);
    expect(useBotStore.getState().signals[0].time).toBe(10);
  });

  it("clearSignals empties signals", () => {
    useBotStore.getState().addSignal(mockSignal());
    useBotStore.getState().clearSignals();
    expect(useBotStore.getState().signals).toEqual([]);
  });

  it("addPosition adds a position", () => {
    const pos = { bot: "Test Bot", symbol: "BTCUSDT", side: "buy", price: 50000, volume: 0.1 };
    useBotStore.getState().addPosition(pos);
    expect(useBotStore.getState().positions).toHaveLength(1);
    expect(useBotStore.getState().positions[0].bot).toBe("Test Bot");
  });

  it("removePosition removes by bot name", () => {
    useBotStore.getState().addPosition({ bot: "Bot A", symbol: "BTCUSDT", side: "buy", price: 50000, volume: 0.1 });
    useBotStore.getState().addPosition({ bot: "Bot B", symbol: "ETHUSDT", side: "sell", price: 3000, volume: 1 });
    useBotStore.getState().removePosition("Bot A");
    expect(useBotStore.getState().positions).toHaveLength(1);
    expect(useBotStore.getState().positions[0].bot).toBe("Bot B");
  });
});
