import { create } from "zustand";

interface Instrument {
  symbol: string;
  display_name: string;
  market_type: string;
  source: string;
  tick_size: number;
  timezone: string;
  precision: number;
}

interface InstrumentState {
  instruments: Instrument[];
  marketTypes: string[];
  loading: boolean;
  setInstruments: (instruments: Instrument[]) => void;
  setMarketTypes: (types: string[]) => void;
  fetch: () => Promise<void>;
  search: (q: string) => Promise<Instrument[]>;
}

export const useInstrumentStore = create<InstrumentState>((set) => ({
  instruments: [],
  marketTypes: [],
  loading: false,

  setInstruments: (instruments) => set({ instruments }),
  setMarketTypes: (types) => set({ marketTypes: types }),

  fetch: async () => {
    set({ loading: true });
    try {
      const [instResp, marketsResp] = await Promise.all([
        fetch("/api/instruments"),
        fetch("/api/instruments/markets"),
      ]);
      const instruments = await instResp.json();
      const marketTypes = await marketsResp.json();
      set({ instruments, marketTypes, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  search: async (q: string) => {
    if (!q.trim()) return [];
    try {
      const resp = await fetch(`/api/instruments/search?q=${encodeURIComponent(q)}`);
      return await resp.json();
    } catch {
      return [];
    }
  },
}));
