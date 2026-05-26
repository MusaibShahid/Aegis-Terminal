import { create } from "zustand";
import type { BotConfig, BotSignal } from "../types";

interface BotState {
  bots: BotConfig[];
  signals: BotSignal[];
  positions: { bot: string; symbol: string; side: string; price: number; volume: number }[];
  setBots: (bots: BotConfig[]) => void;
  addBot: (bot: BotConfig) => void;
  removeBot: (id: number) => void;
  toggleBot: (id: number) => void;
  addSignal: (signal: BotSignal) => void;
  clearSignals: () => void;
  addPosition: (pos: BotState["positions"][0]) => void;
  removePosition: (bot: string) => void;
}

export const useBotStore = create<BotState>((set) => ({
  bots: [],
  signals: [],
  positions: [],
  setBots: (bots) => set({ bots }),
  addBot: (bot) => set((s) => ({ bots: [...s.bots, bot] })),
  removeBot: (id) => set((s) => ({ bots: s.bots.filter((b) => b.id !== id) })),
  toggleBot: (id) =>
    set((s) => ({
      bots: s.bots.map((b) =>
        b.id === id ? { ...b, enabled: !b.enabled } : b
      ),
    })),
  addSignal: (signal) =>
    set((s) => ({ signals: [...s.signals.slice(-49), signal] })),
  clearSignals: () => set({ signals: [] }),
  addPosition: (pos) => set((s) => ({ positions: [...s.positions, pos] })),
  removePosition: (bot) =>
    set((s) => ({ positions: s.positions.filter((p) => p.bot !== bot) })),
}));
