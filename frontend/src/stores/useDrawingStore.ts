import { create } from "zustand";
import type { Drawing } from "../types";

type ActiveTool = { tool: Drawing["tool"] } | null;

interface DrawingState {
  drawings: Drawing[];
  activeTool: ActiveTool;
  history: Drawing[][];
  historyIndex: number;
  loading: boolean;
  setDrawings: (drawings: Drawing[]) => void;
  loadDrawings: (paneId: string) => Promise<void>;
  addDrawing: (drawing: Drawing) => Promise<void>;
  removeDrawing: (id: string) => Promise<void>;
  clearPane: (paneId: string) => void;
  setActiveTool: (tool: ActiveTool) => void;
  undo: () => void;
  redo: () => void;
}

const MAX_HISTORY = 50;

function pushHistory(s: DrawingState) {
  const newHistory = s.history.slice(0, s.historyIndex + 1);
  newHistory.push(s.drawings);
  if (newHistory.length > MAX_HISTORY + 1) newHistory.shift();
  return { history: newHistory, historyIndex: newHistory.length - 1 };
}

async function apiPost(path: string, body: any): Promise<any> {
  const res = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

async function apiDelete(path: string): Promise<void> {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
}

export const useDrawingStore = create<DrawingState>((set, get) => ({
  drawings: [],
  activeTool: null,
  history: [[]],
  historyIndex: 0,
  loading: false,

  setDrawings: (drawings) => set((s) => ({ ...pushHistory(s), drawings })),

  loadDrawings: async (paneId: string) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/drawings/${paneId}`);
      if (!res.ok) { set({ loading: false }); return; }
      const items: any[] = await res.json();
      const drawings: Drawing[] = items
        .filter((item: any) => item.data)
        .map((item: any) => ({
          ...item.data,
          _serverId: item.id,
        }));
      set({ drawings, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addDrawing: async (drawing) => {
    const s = get();
    const newDrawings = [...s.drawings, drawing];
    set({ ...pushHistory(s), drawings: newDrawings });
    try {
      const result = await apiPost("/api/drawings", {
        pane_id: drawing.paneId,
        tool: drawing.tool,
        data: drawing,
      });
      if (result?.id) {
        set((st) => ({
          drawings: st.drawings.map((d) =>
            d === drawing ? { ...d, _serverId: result.id } : d
          ),
        }));
      }
    } catch {
      // Silently fail - drawing saved locally but not persisted
    }
  },

  removeDrawing: async (id) => {
    const s = get();
    const drawing = s.drawings.find((d) => d.id === id || String(d._serverId) === id);
    if (!drawing) return;
    const newDrawings = s.drawings.filter((d) => d.id !== id);
    set({ ...pushHistory(s), drawings: newDrawings });
    if (drawing._serverId) {
      try {
        await apiDelete(`/api/drawings/${drawing._serverId as number}`);
      } catch {
        // Silently fail
      }
    }
  },

  clearPane: (paneId) =>
    set((s) => ({
      drawings: s.drawings.filter((d) => d.paneId !== paneId),
    })),

  setActiveTool: (tool) => set({ activeTool: tool }),

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex <= 0) return;
    set({ drawings: history[historyIndex - 1], historyIndex: historyIndex - 1 });
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 1) return;
    set({ drawings: history[historyIndex + 1], historyIndex: historyIndex + 1 });
  },
}));
