import { useState } from "react";
import { useAlertStore } from "../stores/useAlertStore";

export function AlertPanel() {
  const { alerts, addAlert, removeAlert, toggleAlert } = useAlertStore();

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [condition, setCondition] = useState<">" | "<">(">");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");

  const handleAdd = () => {
    const p = parseFloat(price);
    if (isNaN(p) || p <= 0) return;
    addAlert({ symbol: symbol.toUpperCase(), condition, price: p, note: note.trim() || undefined });
    setPrice("");
    setNote("");
  };

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Create alert form */}
      <div className="p-2 border-b border-surface-border/30 space-y-1.5">
        <div className="flex gap-1">
          <input
            className="flex-1 trade-input text-xs"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol"
          />
          <select
            className="trade-select text-xs"
            value={condition}
            onChange={(e) => setCondition(e.target.value as ">" | "<")}
          >
            <option value=">">Above</option>
            <option value="<">Below</option>
          </select>
        </div>
        <div className="flex gap-1">
          <input
            className="flex-1 trade-input text-xs font-mono"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price"
            type="number"
            step="any"
          />
          <button
            className="btn-primary bg-accent-blue/15 text-accent-blue border border-accent-blue/25 hover:bg-accent-blue/25 disabled:opacity-40 px-3"
            onClick={handleAdd}
            disabled={!price || parseFloat(price) <= 0}
          >
            + Add
          </button>
        </div>
        <input
          className="w-full trade-input text-[10px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
        />
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2 p-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="text-xs text-text-muted">No alerts set</span>
          </div>
        ) : (
          <div className="p-1 space-y-0.5">
            {alerts.map((a) => (
              <div
                key={a.id}
                className={`glass-card rounded-lg px-2.5 py-2 flex items-center justify-between group transition-all duration-150 ${
                  !a.enabled ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    className={`w-3.5 h-3.5 rounded border transition-colors flex items-center justify-center ${
                      a.enabled
                        ? "bg-accent-blue border-accent-blue"
                        : "border-gray-600 hover:border-gray-500"
                    }`}
                    onClick={() => toggleAlert(a.id)}
                  >
                    {a.enabled && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-text-secondary text-[11px]">{a.symbol}</span>
                      <span className={`text-[10px] font-mono font-semibold ${a.condition === ">" ? "text-accent-green" : "text-accent-red"}`}>
                        {a.condition === ">" ? "↑" : "↓"} ${a.price.toFixed(2)}
                      </span>
                    </div>
                    {a.note && (
                      <div className="text-[9px] text-text-muted mt-0.5">{a.note}</div>
                    )}
                  </div>
                </div>
                <button
                  className="text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all text-[9px] p-0.5"
                  onClick={() => removeAlert(a.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
