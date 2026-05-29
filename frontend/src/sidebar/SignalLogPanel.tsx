import { useBotStore } from "../stores/useBotStore";

export function SignalLogPanel() {
  const signals = useBotStore((s) => s.signals);
  const clearSignals = useBotStore((s) => s.clearSignals);

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-surface-border/30">
        <span className="text-[9px] text-text-muted uppercase tracking-wider font-semibold">
          {signals.length} signal{signals.length !== 1 ? "s" : ""}
        </span>
        <button
          className={`text-[9px] transition-all px-1.5 py-0.5 rounded ${
            signals.length === 0
              ? "text-text-muted cursor-default"
              : "text-text-tertiary hover:text-accent-red hover:bg-red-900/10"
          }`}
          onClick={clearSignals}
          disabled={signals.length === 0}
        >
          Clear
        </button>
      </div>

      {/* Signal list */}
      <div className="flex-1 overflow-y-auto p-1 space-y-1">
        {signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2 p-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <span className="text-xs">No signals yet</span>
            <span className="text-[10px] text-text-muted text-center max-w-[160px]">
              Bot signals will appear here when your strategies trigger
            </span>
          </div>
        ) : (
          [...signals].reverse().map((sig, i) => {
            const isBuy = sig.action === "buy";
            const time = new Date(sig.time);
            const timeStr = time.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });

            return (
              <div
                key={sig.time + sig.bot + i}
                className="glass-card rounded-lg px-2.5 py-2 group transition-all duration-150"
              >
                {/* Top row: symbol + action badge + status */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-text-secondary text-[11px]">{sig.symbol}</span>
                    <span
                      className={`text-[9px] font-semibold px-1 py-0.5 rounded ${
                        isBuy
                          ? "bg-accent-green/15 text-accent-green"
                          : "bg-accent-red/15 text-accent-red"
                      }`}
                    >
                      {isBuy ? "BUY" : "SELL"}
                    </span>
                    <span className="text-[9px] text-text-muted font-mono">{timeStr}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {sig.order_executed === false ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-red shadow-[0_0_3px_rgba(255,75,75,0.4)]" />
                        <span className="text-[8px] text-accent-red/70 uppercase tracking-wider">Failed</span>
                      </>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-green shadow-[0_0_3px_rgba(0,217,124,0.4)]" />
                        <span className="text-[8px] text-accent-green/70 uppercase tracking-wider">Executed</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Details row */}
                <div className="flex items-center gap-2 text-[9px] text-text-muted">
                  <span className="badge-gray">{sig.bot}</span>
                  <span className="badge-blue">{sig.strategy.replace(/_/g, " ")}</span>
                  <span className="font-mono">
                    @ {sig.price.toFixed(2)}
                  </span>
                  <span className="font-mono">
                    Vol: {sig.volume}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
