import { describe, expect, it, beforeEach, vi } from "vitest";

import { useJournalStore } from "../useJournalStore";
import type { JournalEntry } from "../useJournalStore";

const mockEntries: JournalEntry[] = [
  { id: 1, symbol: "BTCUSDT", side: "long", entry_price: 50000, quantity: 0.1, status: "open", tags: [], notes: "", opened_at: "2024-01-01T00:00:00Z", created_at: 1704067200000 },
  { id: 2, symbol: "ETHUSDT", side: "short", entry_price: 3000, quantity: 1, status: "closed", exit_price: 2900, pnl: 100, pnl_pct: 3.33, tags: [], notes: "", closed_at: "2024-01-02T00:00:00Z", created_at: 1704153600000 },
];

const mockStats = { total: 2, wins: 1, losses: 1, total_pnl: 100, avg_pnl: 50, win_rate: 50 };

beforeEach(() => {
  vi.restoreAllMocks();
  useJournalStore.setState({ entries: [], stats: null, loading: false, error: null });
});

describe("useJournalStore", () => {
  it("starts with empty state", () => {
    const state = useJournalStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.stats).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  describe("fetchEntries", () => {
    it("fetches entries successfully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockEntries),
      }));

      await useJournalStore.getState().fetchEntries();
      const state = useJournalStore.getState();
      expect(state.entries).toHaveLength(2);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("handles fetch error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
      await useJournalStore.getState().fetchEntries();
      const state = useJournalStore.getState();
      expect(state.entries).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBe("Network error");
    });

    it("handles non-ok response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      await useJournalStore.getState().fetchEntries();
      expect(useJournalStore.getState().error).toBe("Failed to fetch journal entries");
    });
  });

  describe("fetchStats", () => {
    it("fetches stats successfully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStats),
      }));

      await useJournalStore.getState().fetchStats();
      expect(useJournalStore.getState().stats).toEqual(mockStats);
    });

    it("handles stats fetch error silently", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
      await useJournalStore.getState().fetchStats();
      expect(useJournalStore.getState().stats).toBeNull();
    });
  });

  describe("createEntry", () => {
    it("creates entry and prepends to list", async () => {
      const newEntry: JournalEntry = { id: 3, symbol: "SOLUSDT", side: "long", entry_price: 150, quantity: 10, status: "open", tags: [], notes: "", created_at: 1704240000000 };
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(newEntry) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) }));

      const result = await useJournalStore.getState().createEntry({ symbol: "SOLUSDT", side: "long", entry_price: 150, quantity: 10 });
      expect(result).toEqual(newEntry);
      expect(useJournalStore.getState().entries[0].id).toBe(3);
    });

    it("returns null on failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
      const result = await useJournalStore.getState().createEntry({ symbol: "BTCUSDT", side: "long", entry_price: 50000, quantity: 0.1 });
      expect(result).toBeNull();
    });
  });

  describe("updateEntry", () => {
    it("updates an entry and refreshes stats", async () => {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEntries[0]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) }));

      useJournalStore.setState({ entries: [...mockEntries] });
      await useJournalStore.getState().updateEntry(1, { exit_price: 51000, status: "closed" });
      expect(useJournalStore.getState().entries[0]).toBeDefined();
    });

    it("sets error on failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      await useJournalStore.getState().updateEntry(1, {});
      expect(useJournalStore.getState().error).toBe("Failed to update entry");
    });
  });

  describe("deleteEntry", () => {
    it("removes entry and refreshes stats", async () => {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockStats) }));

      useJournalStore.setState({ entries: [...mockEntries] });
      await useJournalStore.getState().deleteEntry(1);
      expect(useJournalStore.getState().entries).toHaveLength(1);
      expect(useJournalStore.getState().entries[0].id).toBe(2);
    });

    it("sets error on failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      await useJournalStore.getState().deleteEntry(1);
      expect(useJournalStore.getState().error).toBe("Failed to delete entry");
    });
  });
});
