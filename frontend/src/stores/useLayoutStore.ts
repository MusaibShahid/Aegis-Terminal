import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LayoutConfig, PaneConfig, WorkspaceConfig, PineScriptIndicator } from "../types";

interface LayoutState {
  workspaces: WorkspaceConfig[];
  activeWorkspaceId: string;
  linkedMode: boolean;

  addWorkspace: (name?: string) => string;
  removeWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  switchWorkspace: (id: string) => void;
  duplicateWorkspace: (id: string) => string;
  getActiveWorkspace: () => WorkspaceConfig | undefined;

  // Pane management (operates on active workspace)
  activePaneId: string | null;
  addPane: (pane?: PaneConfig) => void;
  removePane: (id: string) => void;
  updatePane: (id: string, updates: Partial<PaneConfig>) => void;
  setActivePane: (id: string | null) => void;
  toggleLinkedMode: () => void;

  // Pine Script management
  addPineScript: (script: PineScriptIndicator) => void;
  removePineScript: (id: string) => void;
  updatePineScript: (id: string, updates: Partial<PineScriptIndicator>) => void;

  // Layout persistence
  loadLayout: (layout: LayoutConfig) => void;
  getLayout: () => LayoutConfig;
  reset: () => void;
}

let paneCounter = 1;

function _nextPaneId(): string {
  return `pane-${paneCounter++}`;
}

const defaultPane = (symbol = "BTCUSDT", interval = "1m", chartType: PaneConfig["chartType"] = "candle"): PaneConfig => ({
  id: _nextPaneId(),
  symbol,
  interval,
  indicators: [],
  oscillators: [],
  pineScripts: [],
  chartType,
  linked: false,
});

const DEFAULT_PANES: PaneConfig[] = [
  { ...defaultPane("BTCUSDT", "1m"), oscillators: [{ id: "rsi-1", type: "rsi", params: { period: 14 } }] },
  { ...defaultPane("ETHUSDT", "5m"), oscillators: [{ id: "volume-1", type: "volume", params: {} }] },
  { ...defaultPane("BTCUSDT", "15m"), oscillators: [{ id: "macd-1", type: "macd", params: { fast: 12, slow: 26, signal: 9 } }] },
  { ...defaultPane("SOLUSDT", "1h"), oscillators: [{ id: "rsi-2", type: "rsi", params: { period: 14 } }] },
];

const DEFAULT_WORKSPACE: WorkspaceConfig = {
  id: "ws-1",
  name: "Default",
  panes: DEFAULT_PANES,
};

function updateWorkspacePanes(
  workspaces: WorkspaceConfig[],
  activeId: string,
  updater: (panes: PaneConfig[]) => PaneConfig[]
): WorkspaceConfig[] {
  return workspaces.map((w) =>
    w.id === activeId ? { ...w, panes: updater(w.panes) } : w
  );
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      workspaces: [DEFAULT_WORKSPACE],
      activeWorkspaceId: DEFAULT_WORKSPACE.id,
      activePaneId: DEFAULT_PANES[0]?.id ?? null,
      linkedMode: false,

      // ─── Workspace Management ───────────────────────────────────

      addWorkspace: (name) => {
        const id = `ws-${Date.now()}`;
        const newWs: WorkspaceConfig = {
          id,
          name: name || `Workspace ${get().workspaces.length + 1}`,
          panes: [defaultPane()],
        };
        set((s) => ({ workspaces: [...s.workspaces, newWs], activeWorkspaceId: id }));
        return id;
      },

      removeWorkspace: (id) => {
        const s = get();
        if (s.workspaces.length <= 1) return;
        const filtered = s.workspaces.filter((w) => w.id !== id);
        const nextActive = id === s.activeWorkspaceId
          ? filtered[0]?.id ?? "ws-1"
          : s.activeWorkspaceId;
        set({ workspaces: filtered, activeWorkspaceId: nextActive });
      },

      renameWorkspace: (id, name) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === id ? { ...w, name } : w
          ),
        })),

      switchWorkspace: (id) => {
        const ws = get().workspaces.find((w) => w.id === id);
        if (ws) {
          set({
            activeWorkspaceId: id,
            activePaneId: ws.panes[0]?.id ?? null,
          });
        }
      },

      duplicateWorkspace: (id) => {
        const src = get().workspaces.find((w) => w.id === id);
        if (!src) return "";
        const newId = `ws-${Date.now()}`;
        const newWs: WorkspaceConfig = {
          id: newId,
          name: `${src.name} (copy)`,
          panes: JSON.parse(JSON.stringify(src.panes)),
        };
        set((s) => ({ workspaces: [...s.workspaces, newWs], activeWorkspaceId: newId }));
        return newId;
      },

      getActiveWorkspace: () => {
        const s = get();
        return s.workspaces.find((w) => w.id === s.activeWorkspaceId);
      },

      // ─── Pane Management ────────────────────────────────────────

      addPane: (pane) =>
        set((s) => ({
          workspaces: updateWorkspacePanes(s.workspaces, s.activeWorkspaceId, (panes) => [
            ...panes,
            pane ?? defaultPane(),
          ]),
        })),

      removePane: (id) =>
        set((s) => {
          const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
          if (!ws || ws.panes.length <= 1) return s;
          return {
            workspaces: updateWorkspacePanes(s.workspaces, s.activeWorkspaceId, (panes) =>
              panes.filter((p) => p.id !== id)
            ),
            activePaneId: s.activePaneId === id
              ? ws.panes.find((p) => p.id !== id)?.id ?? null
              : s.activePaneId,
          };
        }),

      updatePane: (id, updates) =>
        set((s) => {
          const updateFn = (panes: PaneConfig[]) =>
            panes.map((p) => (p.id === id ? { ...p, ...updates } : p));

          // Handle linked mode
          if (s.linkedMode && (updates.symbol || updates.interval)) {
            return {
              workspaces: updateWorkspacePanes(s.workspaces, s.activeWorkspaceId, (panes) =>
                panes.map((p) =>
                  p.id !== id
                    ? {
                        ...p,
                        ...(updates.symbol ? { symbol: updates.symbol } : {}),
                        ...(updates.interval ? { interval: updates.interval } : {}),
                      }
                    : { ...p, ...updates }
                )
              ),
            };
          }

          return {
            workspaces: updateWorkspacePanes(s.workspaces, s.activeWorkspaceId, updateFn),
          };
        }),

      setActivePane: (id) => set({ activePaneId: id }),

      toggleLinkedMode: () => set((s) => ({ linkedMode: !s.linkedMode })),

      // ─── Pine Script Management ────────────────────────────────

      addPineScript: (script) => {
        const ws = get().workspaces.find((w) => w.id === get().activeWorkspaceId);
        if (!ws) return;
        set((s) => ({
          workspaces: updateWorkspacePanes(s.workspaces, s.activeWorkspaceId, (panes) =>
            panes.map((p) =>
              p.id === script.paneId
                ? { ...p, pineScripts: [...p.pineScripts, script] }
                : p
            )
          ),
        }));
      },

      removePineScript: (id) =>
        set((s) => ({
          workspaces: updateWorkspacePanes(s.workspaces, s.activeWorkspaceId, (panes) =>
            panes.map((p) => ({
              ...p,
              pineScripts: p.pineScripts.filter((s) => s.id !== id),
            }))
          ),
        })),

      updatePineScript: (id, updates) =>
        set((s) => ({
          workspaces: updateWorkspacePanes(s.workspaces, s.activeWorkspaceId, (panes) =>
            panes.map((p) => ({
              ...p,
              pineScripts: p.pineScripts.map((s) =>
                s.id === id ? { ...s, ...updates } : s
              ),
            }))
          ),
        })),

      // ─── Layout Persistence ─────────────────────────────────────

      loadLayout: (layout) => {
        // Sync counter with imported pane IDs to prevent collisions
        for (const p of layout.panes) {
          const match = p.id.match(/^pane-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= paneCounter) paneCounter = num + 1;
          }
        }
        const ws: WorkspaceConfig = {
          id: `ws-${Date.now()}`,
          name: layout.name || "Imported",
          panes: layout.panes.length > 0 ? layout.panes : [defaultPane()],
        };
        set({
          workspaces: [ws],
          activeWorkspaceId: ws.id,
          activePaneId: ws.panes[0]?.id ?? null,
        });
      },

      getLayout: () => {
        const s = get();
        const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
        return { name: ws?.name ?? "default", panes: ws?.panes ?? [] };
      },

      reset: () => {
        paneCounter = 1;
        const ws: WorkspaceConfig = {
          id: "ws-1",
          name: "Default",
          panes: [defaultPane()],
        };
        set({
          workspaces: [ws],
          activeWorkspaceId: ws.id,
          activePaneId: ws.panes[0]?.id ?? null,
        });
      },
    }),
    {
      name: "aegis-layout",
      partialize: (state) => ({
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
        linkedMode: state.linkedMode,
      }),
      onRehydrateStorage: () => (state) => {
        // Sync paneCounter with persisted state to prevent ID collisions
        if (state) {
          for (const ws of state.workspaces) {
            for (const p of ws.panes) {
              const match = p.id.match(/^pane-(\d+)$/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (num >= paneCounter) paneCounter = num + 1;
              }
            }
          }
        }
      },
    }
  )
);
