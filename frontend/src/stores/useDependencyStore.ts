import { create } from "zustand";

interface FeatureStatus {
  ready: boolean;
  missing: string[];
}

interface DependencyState {
  features: Record<string, FeatureStatus>;
  fetch: () => Promise<void>;
  isReady: (feature: string) => boolean;
}

export const useDependencyStore = create<DependencyState>((set, get) => ({
  features: {},

  fetch: async () => {
    try {
      const resp = await fetch("/api/dependencies");
      const data = await resp.json();
      set({ features: data });
    } catch {}
  },

  isReady: (feature: string) => {
    const status = get().features[feature];
    return status?.ready ?? false;
  },
}));
