import { create } from "zustand";
import type { ReplayState } from "../types";

interface ReplayStore extends ReplayState {
  symbol: string;
  currentIndex: number;
  totalCandles: number;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  isPlaying: boolean;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setProgress: (progress: number) => void;
  stepForward: (count?: number) => void;
  loadReplay: (symbol: string, interval?: string) => Promise<void>;
  startReplay: (symbol: string, interval?: string) => Promise<void>;
  stopReplay: () => void;
  reset: () => void;
}

export const useReplayStore = create<ReplayStore>((set, get) => {
  let ws: WebSocket | null = null;

  function connectWs() {
    if (ws?.readyState === WebSocket.OPEN) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${window.location.host}/ws/market`);
    ws.onopen = () => {};
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "replay_complete") {
          set({ playing: false });
        } else if (msg.type === "replay_ticks") {
          set({ progress: msg.progress });
        } else if (msg.type === "replay_started") {
          set({ playing: true });
        } else if (msg.type === "replay_paused") {
          set({ playing: false });
        }
      } catch {}
    };
  }

  function send(msg: Record<string, unknown>) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  return {
    playing: false,
    isPlaying: false,
    speed: 1,
    progress: 0,
    tickCount: 0,
    currentIndex: 0,
    totalCandles: 0,
    symbol: "BTCUSDT",
    loaded: false,
    loading: false,
    error: null,

    setPlaying: (playing) => {
      connectWs();
      if (playing) {
        send({ type: "replay_start", replay_id: get().symbol });
      } else {
        send({ type: "replay_pause" });
      }
      set({ playing, isPlaying: playing });
    },

    setSpeed: (speed) => {
      connectWs();
      send({ type: "replay_speed", speed });
      set({ speed });
    },

    setProgress: (progress) => set({ progress }),

    stepForward: (count = 1) => {
      connectWs();
      send({ type: "replay_step", count });
      set((s) => ({ tickCount: s.tickCount + count, currentIndex: s.tickCount + count }));
    },

    loadReplay: async (symbol, interval = "1m") => {
      set({ loading: true, error: null, symbol });
      try {
        const res = await fetch("/api/replay/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, interval, count: 500 }),
        });
        const data = await res.json();
        if (data.ok) {
          set({
            loaded: true,
            loading: false,
            progress: 0,
            tickCount: 0,
            currentIndex: 0,
            totalCandles: data.count || 500,
          });
        } else {
          set({ error: data.error || "Failed to load replay", loading: false });
        }
      } catch (err) {
        set({ error: String(err), loading: false });
      }
    },

    startReplay: async (symbol, interval = "1m") => {
      await get().loadReplay(symbol, interval);
      get().setPlaying(true);
    },

    stopReplay: () => {
      send({ type: "replay_stop" });
      set({
        playing: false, isPlaying: false,
        speed: 1, progress: 0, tickCount: 0,
        currentIndex: 0, totalCandles: 0,
        loaded: false, error: null,
      });
    },

    reset: () => {
      send({ type: "replay_stop" });
      set({
        playing: false, isPlaying: false,
        speed: 1, progress: 0, tickCount: 0,
        currentIndex: 0, totalCandles: 0,
        loaded: false, error: null,
      });
    },
  };
});
