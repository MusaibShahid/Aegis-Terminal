import { useState, useEffect, useRef } from "react";
import { useJournalStore, type JournalEntry } from "../stores/useJournalStore";

function CloseTradeForm({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const updateEntry = useJournalStore((s) => s.updateEntry);
  const [exitPrice, setExitPrice] = useState(String(entry.entry_price));
  const [exitReason, setExitReason] = useState("");
  const [pnlPct, setPnlPct] = useState("0");
  const [saving, setSaving] = useState(false);

  const calcPnl = () => {
    const ep = parseFloat(exitPrice);
    if (!isNaN(ep) && entry.entry_price > 0) {
      const raw = entry.side === "long" ? (ep - entry.entry_price) / entry.entry_price : (entry.entry_price - ep) / entry.entry_price;
      setPnlPct((raw * 100).toFixed(2));
    }
  };

  useEffect(() => { calcPnl(); }, [exitPrice]);

  const handleSave = async () => {
    setSaving(true);
    const ep = parseFloat(exitPrice);
    const pct = parseFloat(pnlPct);
    await updateEntry(entry.id!, {
      exit_price: ep,
      exit_reason: exitReason || null,
      pnl: entry.quantity * ep * (pct / 100),
      pnl_pct: pct,
      status: "closed",
      closed_at: new Date().toISOString(),
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface rounded-lg border border-surface-border p-4 w-72 text-xs" onClick={(e) => e.stopPropagation()}>
        <div className="text-white font-semibold mb-3">Close Trade — {entry.symbol}</div>
        <div className="space-y-2">
          <div>
            <label className="text-gray-500 block mb-0.5">Exit Price</label>
            <input className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1 text-white text-xs" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} />
          </div>
          <div>
            <label className="text-gray-500 block mb-0.5">P&L %</label>
            <input className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1 text-white text-xs" value={pnlPct} onChange={(e) => setPnlPct(e.target.value)} />
          </div>
          <div>
            <label className="text-gray-500 block mb-0.5">Exit Reason</label>
            <select className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1 text-white text-xs" value={exitReason} onChange={(e) => setExitReason(e.target.value)}>
              <option value="">—</option>
              <option value="take_profit">Take Profit</option>
              <option value="stop_loss">Stop Loss</option>
              <option value="manual">Manual Close</option>
              <option value="signal">Signal Exit</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-3 justify-end">
          <button className="px-3 py-1 rounded bg-surface-alt text-gray-400 hover:text-white" onClick={onClose}>Cancel</button>
          <button className="px-3 py-1 rounded bg-accent-blue text-white hover:bg-accent-blue/80 disabled:opacity-40" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Close Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewTradeForm({ onClose }: { onClose: () => void }) {
  const createEntry = useJournalStore((s) => s.createEntry);
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [entryPrice, setEntryPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await createEntry({
      symbol: symbol.toUpperCase(),
      side,
      entry_price: parseFloat(entryPrice),
      quantity: parseFloat(quantity),
      stop_loss: stopLoss ? parseFloat(stopLoss) : null,
      take_profit: takeProfit ? parseFloat(takeProfit) : null,
      entry_reason: reason || null,
      status: "open",
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface rounded-lg border border-surface-border p-4 w-72 text-xs" onClick={(e) => e.stopPropagation()}>
        <div className="text-white font-semibold mb-3">New Trade</div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-gray-500 block mb-0.5">Symbol</label>
              <input className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1 text-white text-xs" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
            </div>
            <div className="w-20">
              <label className="text-gray-500 block mb-0.5">Side</label>
              <select className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1 text-white text-xs" value={side} onChange={(e) => setSide(e.target.value as any)}>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-gray-500 block mb-0.5">Entry Price</label>
              <input className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1 text-white text-xs" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div className="w-20">
              <label className="text-gray-500 block mb-0.5">Qty</label>
              <input className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1 text-white text-xs" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-gray-500 block mb-0.5">Stop Loss</label>
              <input className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1 text-white text-xs" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="Optional" />
            </div>
            <div className="flex-1">
              <label className="text-gray-500 block mb-0.5">Take Profit</label>
              <input className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1 text-white text-xs" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div>
            <label className="text-gray-500 block mb-0.5">Entry Reason</label>
            <input className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1 text-white text-xs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., AI setup, trend following" />
          </div>
        </div>
        <div className="flex gap-2 mt-3 justify-end">
          <button className="px-3 py-1 rounded bg-surface-alt text-gray-400 hover:text-white" onClick={onClose}>Cancel</button>
          <button className="px-3 py-1 rounded bg-accent-blue text-white hover:bg-accent-blue/80 disabled:opacity-40" onClick={handleSave} disabled={saving || !symbol || !entryPrice}>
            {saving ? "Saving..." : "Add Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TagInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [input, setInput] = useState("");
  const tags = value ? value.split(",").filter(Boolean) : [];
  const addTag = () => {
    const t = input.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      onChange([...tags, t].join(","));
    }
    setInput("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1">
        {tags.map((t) => (
          <span key={t} className="bg-accent-blue/20 text-accent-blue text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1">
            {t}
            <button className="hover:text-white" onClick={() => onChange(tags.filter((x) => x !== t).join(","))}>×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input className="flex-1 bg-surface-alt border border-surface-border rounded px-2 py-0.5 text-[10px] text-white" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="Add tag..." />
        <button className="text-gray-400 hover:text-white text-[10px] px-1" onClick={addTag}>+</button>
      </div>
    </div>
  );
}

function DetailView({ entry, onBack }: { entry: JournalEntry; onBack: () => void }) {
  const updateEntry = useJournalStore((s) => s.updateEntry);
  const deleteEntry = useJournalStore((s) => s.deleteEntry);
  const [notes, setNotes] = useState(entry.notes || "");
  const [tags, setTags] = useState(entry.tags || "");
  const [saving, setSaving] = useState(false);

  const saveNotes = async () => {
    setSaving(true);
    await updateEntry(entry.id!, { notes: notes || null, tags: tags || null });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (confirm("Delete this trade entry?")) {
      await deleteEntry(entry.id!);
      onBack();
    }
  };

  const pnlColor = entry.pnl && entry.pnl > 0 ? "text-accent-green" : entry.pnl && entry.pnl < 0 ? "text-accent-red" : "text-gray-400";
  const statusColor = entry.status === "open" ? "text-accent-green" : entry.status === "closed" ? "text-gray-400" : "text-accent-yellow";

  return (
    <div className="h-full flex flex-col text-xs">
      <div className="flex items-center justify-between p-2 border-b border-surface-border shrink-0">
        <button className="text-gray-400 hover:text-white" onClick={onBack}>← Back</button>
        <span className={`font-semibold ${statusColor}`}>{entry.status.toUpperCase()}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-white font-semibold text-sm">{entry.symbol}</span>
          <span className={entry.side === "long" ? "text-accent-green" : "text-accent-red"}>{entry.side.toUpperCase()}</span>
        </div>
        <div className="grid grid-cols-2 gap-1 bg-surface-alt rounded p-2">
          <div><span className="text-gray-500">Entry:</span> <span className="text-white">${entry.entry_price}</span></div>
          <div><span className="text-gray-500">Qty:</span> <span className="text-white">{entry.quantity}</span></div>
          {entry.exit_price && <div><span className="text-gray-500">Exit:</span> <span className="text-white">${entry.exit_price}</span></div>}
          {entry.pnl_pct != null && (
            <div><span className="text-gray-500">P&L:</span> <span className={pnlColor}>{entry.pnl_pct >= 0 ? "+" : ""}{entry.pnl_pct}%</span></div>
          )}
          {entry.stop_loss && <div><span className="text-gray-500">SL:</span> <span className="text-accent-red">${entry.stop_loss}</span></div>}
          {entry.take_profit && <div><span className="text-gray-500">TP:</span> <span className="text-accent-green">${entry.take_profit}</span></div>}
          {entry.entry_reason && <div className="col-span-2"><span className="text-gray-500">Reason:</span> <span className="text-white">{entry.entry_reason}</span></div>}
          {entry.exit_reason && <div className="col-span-2"><span className="text-gray-500">Exit reason:</span> <span className="text-white">{entry.exit_reason}</span></div>}
        </div>
        <div>
          <label className="text-gray-500 block mb-1">Tags</label>
          <TagInput value={tags} onChange={setTags} />
        </div>
        <div>
          <label className="text-gray-500 block mb-1">Notes</label>
          <textarea className="w-full bg-surface-alt border border-surface-border rounded p-2 text-xs text-white resize-none h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Trade notes..." />
        </div>
        {entry.screenshot_path && (
          <div>
            <label className="text-gray-500 block mb-1">Screenshot</label>
            <img src={`/api/screenshots/${entry.screenshot_path.split("/").pop()}`} className="w-full rounded border border-surface-border" alt="Trade screenshot" />
          </div>
        )}
      </div>
      <div className="flex gap-2 p-2 border-t border-surface-border shrink-0">
        <button className="flex-1 px-2 py-1 rounded bg-accent-blue text-white hover:bg-accent-blue/80 disabled:opacity-40 text-[10px]" onClick={saveNotes} disabled={saving}>
          {saving ? "..." : "Save"}
        </button>
        <button className="px-2 py-1 rounded bg-accent-red/20 text-accent-red hover:bg-accent-red/40 text-[10px]" onClick={handleDelete}>Delete</button>
      </div>
    </div>
  );
}

export function JournalPanel() {
  const { entries, stats, loading, error, fetchEntries, fetchStats } = useJournalStore();
  const [showNew, setShowNew] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");

  useEffect(() => { fetchEntries(); fetchStats(); }, []);

  const detail = detailId ? entries.find((e) => e.id === detailId) : null;
  if (detail) return <DetailView entry={detail} onBack={() => setDetailId(null)} />;

  const filtered = entries.filter((e) => filter === "all" || e.status === filter);

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="p-2 border-b border-surface-border space-y-1.5 shrink-0">
        {stats && (
          <div className="grid grid-cols-3 gap-1 text-[10px]">
            <div className="bg-surface-alt rounded p-1 text-center">
              <div className="text-gray-500">Trades</div>
              <div className="text-white font-semibold">{stats.total}</div>
            </div>
            <div className="bg-surface-alt rounded p-1 text-center">
              <div className="text-gray-500">Win Rate</div>
              <div className="text-accent-green font-semibold">{stats.win_rate}%</div>
            </div>
            <div className="bg-surface-alt rounded p-1 text-center">
              <div className="text-gray-500">P&L</div>
              <div className={`font-semibold ${stats.total_pnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                {stats.total_pnl >= 0 ? "+" : ""}${stats.total_pnl}
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-1">
          <button className="px-2 py-1 bg-accent-blue text-white rounded text-[10px] hover:bg-accent-blue/80 flex-1" onClick={() => setShowNew(true)}>+ New Trade</button>
        </div>
        <div className="flex gap-1">
          {(["all", "open", "closed"] as const).map((f) => (
            <button key={f} className={`px-2 py-0.5 rounded text-[10px] ${filter === f ? "bg-surface-alt text-white" : "text-gray-500 hover:text-white"}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="text-gray-500 text-center py-4">Loading...</div>}
        {error && <div className="text-accent-red text-center py-2">{error}</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-gray-500 text-center py-4">No trades yet</div>
        )}
        {filtered.map((entry) => {
          const pnlColor = entry.pnl && entry.pnl > 0 ? "text-accent-green" : entry.pnl && entry.pnl < 0 ? "text-accent-red" : "text-gray-400";
          const tags = entry.tags ? entry.tags.split(",").filter(Boolean) : [];
          return (
            <div key={entry.id} className="p-2 border-b border-surface-border hover:bg-surface-alt cursor-pointer" onClick={() => setDetailId(entry.id!)}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold">{entry.symbol}</span>
                  <span className={entry.side === "long" ? "text-accent-green" : "text-accent-red"}>{entry.side[0].toUpperCase()}</span>
                  <span className={`text-[10px] ${entry.status === "open" ? "text-accent-green" : "text-gray-500"}`}>{entry.status}</span>
                </div>
                {entry.pnl_pct != null && (
                  <span className={pnlColor}>{entry.pnl_pct >= 0 ? "+" : ""}{entry.pnl_pct}%</span>
                )}
              </div>
              <div className="flex justify-between text-gray-500 text-[10px] mt-0.5">
                <span>${entry.entry_price} × {entry.quantity}</span>
                {entry.status === "open" && (
                  <button className="text-accent-blue hover:text-accent-blue/80" onClick={(e) => { e.stopPropagation(); setClosingId(entry.id!); }}>Close</button>
                )}
              </div>
              {tags.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {tags.map((t) => (
                    <span key={t} className="bg-accent-blue/10 text-accent-blue text-[9px] px-1 rounded-full">{t}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showNew && <NewTradeForm onClose={() => setShowNew(false)} />}
      {closingId != null && (
        <CloseTradeForm entry={entries.find((e) => e.id === closingId)!} onClose={() => setClosingId(null)} />
      )}
    </div>
  );
}
