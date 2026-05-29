import { create } from "zustand";

// Simple price-alert type used by the AlertPanel component.
// (The backend AlertConfig type is more complex and lives in types/index.ts
//  for REST API communication.)
export interface PriceAlert {
  id: number;
  symbol: string;
  condition: ">" | "<";
  price: number;
  note?: string;
  enabled: boolean;
}

interface AlertState {
  alerts: PriceAlert[];
  triggered: { alert: PriceAlert; time: number }[];
  setAlerts: (alerts: PriceAlert[]) => void;
  addAlert: (alert: Omit<PriceAlert, "id" | "enabled">) => void;
  removeAlert: (id: number) => void;
  toggleAlert: (id: number) => void;
  addTriggered: (alert: PriceAlert) => void;
  clearTriggered: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  triggered: [],
  setAlerts: (alerts) => set({ alerts }),
  addAlert: (alert) =>
    set((s) => {
      const nextId = s.alerts.length > 0
        ? Math.max(...s.alerts.map((a) => a.id)) + 1
        : 1;
      return {
        alerts: [...s.alerts, { ...alert, id: nextId, enabled: true }],
      };
    }),
  removeAlert: (id) =>
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  toggleAlert: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) =>
        a.id === id ? { ...a, enabled: !a.enabled } : a
      ),
    })),
  addTriggered: (alert) =>
    set((s) => ({
      triggered: [...s.triggered.slice(-49), { alert, time: Date.now() }],
    })),
  clearTriggered: () => set({ triggered: [] }),
}));
