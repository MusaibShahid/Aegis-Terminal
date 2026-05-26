import { create } from "zustand";
import type { AlertConfig } from "../types";

interface AlertState {
  alerts: AlertConfig[];
  triggered: { alert: AlertConfig; time: number }[];
  setAlerts: (alerts: AlertConfig[]) => void;
  addAlert: (alert: AlertConfig) => void;
  removeAlert: (id: number) => void;
  toggleAlert: (id: number) => void;
  addTriggered: (alert: AlertConfig) => void;
  clearTriggered: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  triggered: [],
  setAlerts: (alerts) => set({ alerts }),
  addAlert: (alert) => set((s) => ({ alerts: [...s.alerts, alert] })),
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
