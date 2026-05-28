import { useBotStore, type BotPosition } from "../stores/useBotStore";

export function PositionPanel() {
  const positions = useBotStore((s) => s.positions);

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2 p-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        <span className="text-xs">No open positions</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="overflow-y-auto flex-1">
        <table className="w-full">
          <thead>
            <tr className="text-[9px] text-gray-600 uppercase tracking-wider border-b border-surface-border/30">
              <th className="text-left px-2 py-1.5 font-medium">Symbol</th>
              <th className="text-right px-2 py-1.5 font-medium">Qty</th>
              <th className="text-right px-2 py-1.5 font-medium">Entry</th>
              <th className="text-right px-2 py-1.5 font-medium">P&L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => (
              <tr key={pos.id} className="border-b border-surface-border/20 hover:bg-glass-white-hover transition-colors">
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-white/80">{pos.symbol.replace("USDT", "")}</span>
                    <span className={pos.side === "long" ? "badge-green" : "badge-red"}>
                      {pos.side === "long" ? "L" : "S"}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-gray-400 tabular-nums">{pos.quantity.toFixed(4)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-gray-400 tabular-nums">${pos.entry_price.toFixed(2)}</td>
                <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${pos.pnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                  {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Summary footer */}
      <div className="p-2 border-t border-surface-border/30 bg-surface-alt/30">
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>Total Positions</span>
          <span className="text-white font-mono">{positions.length}</span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
          <span>Total P&L</span>
          <span className={`font-mono ${positions.reduce((s, p) => s + p.pnl, 0) >= 0 ? "text-accent-green" : "text-accent-red"}`}>
            {positions.reduce((s, p) => s + p.pnl, 0) >= 0 ? "+" : ""}${positions.reduce((s, p) => s + p.pnl, 0).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
