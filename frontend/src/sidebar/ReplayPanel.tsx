import { useState, useCallback } from "react";
import { useReplayStore } from "../stores/useReplayStore";

export function ReplayPanel() {
  const { isPlaying, speed, currentIndex, totalCandles, startReplay, stopReplay, setSpeed } = useReplayStore();

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("1m");

  const handleToggle = useCallback(() => {
    if (isPlaying) {
      stopReplay();
    } else {
      startReplay(symbol, interval);
    }
  }, [isPlaying, symbol, interval, startReplay, stopReplay]);

  const progress = totalCandles > 0 ? (currentIndex / totalCandles) * 100 : 0;

  return (
    <div className="flex flex-col h-full text-xs p-2 space-y-2">
      {/* Controls */}
      <div className="glass-card rounded-lg p-2.5 space-y-1.5">
        <div className="flex gap-1">
          <input className="flex-1 trade-input text-xs font-mono" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbol" />
          <select className="trade-select w-16" value={interval} onChange={(e) => setInterval(e.target.value)}>
            {["1m", "5m", "15m", "1h", "4h", "1d"].map((iv) => (
              <option key={iv} value={iv}>{iv}</option>
            ))}
          </select>
        </div>

        <button
          className={`w-full btn-primary transition-colors ${
            isPlaying
              ? "bg-accent-red/15 text-accent-red border border-accent-red/25 hover:bg-accent-red/25"
              : "bg-accent-green/15 text-accent-green border border-accent-green/25 hover:bg-accent-green/25"
          }`}
          onClick={handleToggle}
        >
          <span className="flex items-center justify-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isPlaying ? "bg-accent-red" : "bg-accent-green"}`} />
            {isPlaying ? "Stop" : "Start"} Replay
          </span>
        </button>
      </div>

      {/* Playback controls */}
      <div className="glass-card rounded-lg p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-text-muted uppercase tracking-wider font-semibold">Playback</span>
          <div className="flex items-center gap-1">
            {[0.5, 1, 2, 5, 10].map((s) => (
              <button
                key={s}
                className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                  speed === s
                    ? "bg-accent-blue/15 text-accent-blue"
                    : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
                }`}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-blue rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-text-muted font-mono">
            <span>Candle {currentIndex}/{totalCandles}</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {!isPlaying && totalCandles === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 text-text-muted gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span className="text-xs">Select a symbol to replay</span>
        </div>
      )}
    </div>
  );
}
