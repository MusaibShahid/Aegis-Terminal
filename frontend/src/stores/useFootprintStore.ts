import { create } from "zustand";
import type { FootprintData, VPVRData, DeltaData } from "../types";

interface FootprintState {
  footprint: Record<string, FootprintData>;
  vpvr: Record<string, VPVRData>;
  delta: Record<string, DeltaData>;
  setFootprint: (symbol: string, data: FootprintData) => void;
  setVPVR: (symbol: string, data: VPVRData) => void;
  setDelta: (symbol: string, data: DeltaData) => void;
}

export const useFootprintStore = create<FootprintState>((set) => ({
  footprint: {},
  vpvr: {},
  delta: {},
  setFootprint: (symbol, data) =>
    set((s) => ({ footprint: { ...s.footprint, [symbol]: data } })),
  setVPVR: (symbol, data) =>
    set((s) => ({ vpvr: { ...s.vpvr, [symbol]: data } })),
  setDelta: (symbol, data) =>
    set((s) => ({ delta: { ...s.delta, [symbol]: data } })),
}));
