import { create } from "zustand";

export interface JournalEntry {
  id?: number;
  symbol: string;
  side: "long" | "short";
  entry_price: number;
  exit_price?: number | null;
  quantity: number;
  stop_loss?: number | null;
  take_profit?: number | null;
  entry_reason?: string | null;
  exit_reason?: string | null;
  pnl?: number | null;
  pnl_pct?: number | null;
  tags?: string | null;
  notes?: string | null;
  screenshot_path?: string | null;
  status: "open" | "closed" | "cancelled";
  opened_at?: string | null;
  closed_at?: string | null;
}

interface JournalStats {
  total: number;
  wins: number;
  losses: number;
  total_pnl: number;
  avg_pnl: number;
  win_rate: number;
}

interface JournalState {
  entries: JournalEntry[];
  stats: JournalStats | null;
  loading: boolean;
  error: string | null;
  fetchEntries: () => Promise<void>;
  fetchStats: () => Promise<void>;
  createEntry: (data: Partial<JournalEntry>) => Promise<JournalEntry | null>;
  updateEntry: (id: number, data: Partial<JournalEntry>) => Promise<void>;
  deleteEntry: (id: number) => Promise<void>;
}

export const useJournalStore = create<JournalState>((set, get) => ({
  entries: [],
  stats: null,
  loading: false,
  error: null,

  fetchEntries: async () => {
    set({ loading: true, error: null });
    try {
      const resp = await fetch("/api/journal");
      if (!resp.ok) throw new Error("Failed to fetch journal entries");
      const data = await resp.json();
      set({ entries: data, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchStats: async () => {
    try {
      const resp = await fetch("/api/journal/stats");
      if (!resp.ok) throw new Error("Failed to fetch stats");
      const data = await resp.json();
      set({ stats: data });
    } catch {}
  },

  createEntry: async (data) => {
    try {
      const resp = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error("Failed to create entry");
      const entry = await resp.json();
      set((s) => ({ entries: [entry, ...s.entries] }));
      get().fetchStats();
      return entry;
    } catch (e: any) {
      set({ error: e.message });
      return null;
    }
  },

  updateEntry: async (id, data) => {
    try {
      const resp = await fetch(`/api/journal/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error("Failed to update entry");
      const updated = await resp.json();
      set((s) => ({
        entries: s.entries.map((e) => (e.id === id ? updated : e)),
      }));
      get().fetchStats();
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  deleteEntry: async (id) => {
    try {
      const resp = await fetch(`/api/journal/${id}`, { method: "DELETE" });
      if (!resp.ok) throw new Error("Failed to delete entry");
      set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
      get().fetchStats();
    } catch (e: any) {
      set({ error: e.message });
    }
  },
}));
