import { create } from "zustand";

interface ConnectionState {
  status: "disconnected" | "connecting" | "connected";
  latency: number | null;
  setStatus: (status: "disconnected" | "connecting" | "connected") => void;
  setLatency: (ms: number) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: "disconnected",
  latency: null,
  setStatus: (status) => set({ status }),
  setLatency: (latency) => set({ latency }),
}));
