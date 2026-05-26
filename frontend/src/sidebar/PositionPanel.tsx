import { useBotStore } from "../stores/useBotStore";

export function PositionPanel() {
  const positions = useBotStore((s) => s.positions);
  const removePosition = useBotStore((s) => s.removePosition);

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-2 py-1 border-b border-surface-border shrink-0">
        <span className="text-gray-400">Positions ({positions.length})</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {positions.length === 0 && (
          <div className="text-gray-500 p-2 text-center">No open positions</div>
        )}
        {positions.map((p, i) => (
          <div
            key={i}
            className="px-2 py-1.5 border-b border-surface-border/30"
          >
            <div className="flex items-center justify-between">
              <span className="text-gray-300">{p.symbol}</span>
              <span className={p.side === "buy" ? "text-accent-green" : "text-accent-red"}>
                {p.side.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>@ {p.price.toFixed(2)}</span>
              <span>Vol: {p.volume.toFixed(4)}</span>
              <button
                className="text-accent-red hover:text-white"
                onClick={() => removePosition(p.bot)}
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
