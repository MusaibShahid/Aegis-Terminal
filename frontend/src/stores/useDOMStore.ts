import { create } from "zustand";
import type { DepthData } from "../types";

interface DOMState {
  depth: Record<string, DepthData>;
  setDepth: (symbol: string, data: DepthData) => void;
}

export const useDOMStore = create<DOMState>((set) => ({
  depth: {},
  setDepth: (symbol, data) =>
    set((s) => ({ depth: { ...s.depth, [symbol]: data } })),
}));
