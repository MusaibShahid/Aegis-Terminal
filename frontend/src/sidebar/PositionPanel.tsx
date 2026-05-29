import { useBotStore } from "../stores/useBotStore";

/** Local row shape that includes optional fields the component handles gracefully. */
interface PositionRow {
  bot?: string;
  symbol: string;
  side: string;
  volume?: number;
  quantity?: number;
  price?: number;
  entry_price?: number;
  id?: string;
  pnl?: number;
}

/** Normalize side strings from the store to display-friendly form. */
function displaySide(side: string): "long" | "short" {
  const s = side.toLowerCase();
  if (s === "buy" || s === "long") return "long";
  return "short";
}

export function PositionPanel() {
  const positions = useBotStore((s) => s.positions);

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2 p-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        <span className="text-xs">No open positions</span>
      </div>
    );
  }

  const totalPnl = positions.reduce(
    (s, p) => s + ((p as unknown as PositionRow).pnl ?? 0),
    0,
  );

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="overflow-y-auto flex-1">
        <table className="w-full">
          <thead>
            <tr className="text-[9px] text-text-muted uppercase tracking-wider border-b border-surface-border/30">
              <th className="text-left px-2 py-1.5 font-medium">Symbol</th>
              <th className="text-right px-2 py-1.5 font-medium">Qty</th>
              <th className="text-right px-2 py-1.5 font-medium">Entry</th>
              <th className="text-right px-2 py-1.5 font-medium">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos, idx) => {
              const p = pos as unknown as PositionRow;
              const side = displaySide(p.side);
              const pnl = p.pnl ?? 0;
              const qty = p.volume ?? p.quantity ?? 0;
              const entryPrice = p.price ?? p.entry_price ?? 0;
              return (
                <tr key={p.bot ?? p.id ?? idx} className="border-b border-surface-border/20 hover:bg-surface-hover transition-colors">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-text-secondary">{p.symbol.replace("USDT", "")}</span>
                      <span className={side === "long" ? "text-accent-green" : "text-accent-red"}>
                        {side === "long" ? "L" : "S"}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-text-secondary tabular-nums">{qty.toFixed(4)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-text-secondary tabular-nums">${entryPrice.toFixed(2)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${pnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Summary footer */}
      <div className="p-2 border-t border-surface-border/30 bg-surface-alt/30">
        <div className="flex justify-between text-[10px] text-text-tertiary">
          <span>Total Positions</span>
          <span className="text-text-primary font-mono">{positions.length}</span>
        </div>
        <div className="flex justify-between text-[10px] text-text-tertiary mt-0.5">
          <span>Total P&amp;L</span>
          <span className={`font-mono ${totalPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
