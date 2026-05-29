import { useState } from "react";
import { useJournalStore } from "../stores/useJournalStore";

export function JournalPanel() {
  const { entries, addEntry, deleteEntry } = useJournalStore();

  const [symbol, setSymbol] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");

  const handleAdd = () => {
    if (!notes.trim()) return;
    addEntry({
      symbol: symbol.toUpperCase().trim() || undefined,
      notes: notes.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setNotes("");
    setTags("");
  };

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Entry form */}
      <div className="p-2 border-b border-surface-border/30 space-y-1.5">
        <input
          className="w-full trade-input text-xs font-mono"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol (optional)"
        />
        <textarea
          className="w-full trade-input text-xs resize-none min-h-[56px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Journal entry..."
          rows={3}
        />
        <div className="flex gap-1">
          <input
            className="flex-1 trade-input text-[10px]"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags (comma-separated)"
          />
          <button
            className="btn-primary bg-accent-blue/15 text-accent-blue border border-accent-blue/25 hover:bg-accent-blue/25 disabled:opacity-40 px-3"
            onClick={handleAdd}
            disabled={!notes.trim()}
          >
            + Add
          </button>
        </div>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto p-1 space-y-1">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2 p-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span className="text-xs">No journal entries</span>
          </div>
        ) : (
          [...entries].reverse().slice(0, 200).map((entry) => (
            <div key={entry.id} className="glass-card rounded-lg px-2.5 py-2 group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-1.5 mb-1">
                  {entry.symbol && (
                    <span className="badge-blue">{entry.symbol}</span>
                  )}
                  <span className="text-[9px] text-text-muted font-mono">
                    {new Date(entry.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <button
                  className="text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all text-[9px] p-0.5"
                  onClick={() => deleteEntry(entry.id)}
                >
                  ✕
                </button>
              </div>
              <p className="text-text-secondary text-[10px] whitespace-pre-wrap leading-relaxed">{entry.notes}</p>
              {entry.tags && entry.tags.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="text-[8px] text-text-muted bg-gray-800/50 px-1 py-0.5 rounded">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
