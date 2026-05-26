import { useState } from "react";
import { useReplayStore } from "../stores/useReplayStore";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XAUUSD", "EURUSD", "GBPUSD"];

export function ReplayPanel() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("1m");
  const playing = useReplayStore((s) => s.playing);
  const speed = useReplayStore((s) => s.speed);
  const progress = useReplayStore((s) => s.progress);
  const loaded = useReplayStore((s) => s.loaded);
  const loading = useReplayStore((s) => s.loading);
  const error = useReplayStore((s) => s.error);
  const setPlaying = useReplayStore((s) => s.setPlaying);
  const setSpeed = useReplayStore((s) => s.setSpeed);
  const stepForward = useReplayStore((s) => s.stepForward);
  const loadReplay = useReplayStore((s) => s.loadReplay);
  const reset = useReplayStore((s) => s.reset);

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="p-2 space-y-2">
        {/* Symbol + Interval selectors */}
        <div className="flex gap-1">
          <select
            className="flex-1 bg-surface border border-surface-border rounded px-1 py-1 text-white text-[10px]"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          >
            {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select
            className="w-14 bg-surface border border-surface-border rounded px-1 py-1 text-white text-[10px]"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          >
            {["1m", "5m", "15m", "1h"].map((iv) => <option key={iv}>{iv}</option>)}
          </select>
          <button
            className="bg-accent-blue text-white px-2 rounded text-[10px] hover:bg-accent-blue/80 disabled:opacity-50"
            disabled={loading}
            onClick={() => loadReplay(symbol, interval)}
          >
            {loading ? "..." : "Load"}
          </button>
        </div>

        {error && <div className="text-accent-red text-[10px]">{error}</div>}

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            className={`w-8 h-8 flex items-center justify-center rounded text-sm ${
              playing ? "bg-accent-yellow text-black" : "bg-accent-green text-white"
            } ${!loaded ? "opacity-30 cursor-not-allowed" : ""}`}
            disabled={!loaded}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button
            className={`w-8 h-8 flex items-center justify-center rounded bg-surface-alt text-gray-300 hover:text-white ${!loaded ? "opacity-30 cursor-not-allowed" : ""}`}
            disabled={!loaded}
            onClick={reset}
          >
            ⏹
          </button>
          <button
            className={`w-8 h-8 flex items-center justify-center rounded bg-surface-alt text-gray-300 hover:text-white text-sm ${!loaded ? "opacity-30 cursor-not-allowed" : ""}`}
            disabled={!loaded}
            onClick={() => stepForward(10)}
            title="Step forward 10 ticks"
          >
            ⏭
          </button>
        </div>

        {/* Speed */}
        <div className="space-y-1">
          <div className="flex justify-between text-gray-400">
            <span>Speed</span>
            <span className="text-white">{speed}x</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="100"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full h-1 bg-surface-alt rounded-full appearance-none cursor-pointer accent-accent-blue"
          />
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-gray-400">
            <span>Progress</span>
            <span className="text-white">{(progress * 100).toFixed(0)}%</span>
          </div>
          <div className="w-full h-1 bg-surface-alt rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-blue transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
