import { create } from "zustand";
import type { CandleCountdown } from "../types";

interface CountdownState {
  countdowns: Record<string, CandleCountdown>;
  globalSession: string;
  serverTime: number;
  lastTick: number;
  update: (msg: {
    countdowns: Record<string, CandleCountdown>;
    session: string;
    server_time: number;
  }) => void;
}

export const useCountdownStore = create<CountdownState>((set) => ({
  countdowns: {},
  globalSession: "unknown",
  serverTime: 0,
  lastTick: 0,

  update: (msg) =>
    set({
      countdowns: msg.countdowns,
      globalSession: msg.session,
      serverTime: msg.server_time,
      lastTick: Date.now(),
    }),
}));
