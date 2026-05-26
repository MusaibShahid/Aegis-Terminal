import { useState, useRef, useCallback } from "react";
import { useMarketStore } from "../stores/useMarketStore";
import { useWatchlistStore } from "../stores/useWatchlistStore";
import { formatPrice } from "../utils/format";

const GROUP_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

interface Props {
  onSelectSymbol: (symbol: string) => void;
}

export function WatchlistSidebar({ onSelectSymbol }: Props) {
  const groups = useWatchlistStore((s) => s.groups);
  const activeGroup = useWatchlistStore((s) => s.activeGroup);
  const setActiveGroup = useWatchlistStore((s) => s.setActiveGroup);
  const addGroup = useWatchlistStore((s) => s.addGroup);
  const removeGroup = useWatchlistStore((s) => s.removeGroup);
  const renameGroup = useWatchlistStore((s) => s.renameGroup);
  const setGroupColor = useWatchlistStore((s) => s.setGroupColor);
  const addSymbol = useWatchlistStore((s) => s.addSymbol);
  const removeSymbol = useWatchlistStore((s) => s.removeSymbol);
  const reorderSymbols = useWatchlistStore((s) => s.reorderSymbols);
  const quotes = useMarketStore((s) => s.quotes);

  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showAddSymbol, setShowAddSymbol] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [renameMode, setRenameMode] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showGroupMenu, setShowGroupMenu] = useState<string | null>(null);
  const group = groups.find((g) => g.name === activeGroup) ?? groups[0];

  const inputRef = useRef<HTMLInputElement>(null);

  const activeGroupColor = group?.color || GROUP_COLORS[0];

  const handleAddGroup = () => {
    if (newGroupName.trim()) {
      addGroup({
        name: newGroupName.trim(),
        symbols: [],
        color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
        order: groups.length,
      });
      setNewGroupName("");
      setShowAddGroup(false);
    }
  };

  const handleAddSymbol = () => {
    if (newSymbol.trim() && group) {
      addSymbol(group.name, newSymbol.trim().toUpperCase());
      setNewSymbol("");
      setShowAddSymbol(false);
    }
  };

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index || !group) return;
      const syms = [...group.symbols];
      const [moved] = syms.splice(dragIndex, 1);
      syms.splice(index, 0, moved);
      reorderSymbols(group.name, syms);
      setDragIndex(index);
    },
    [dragIndex, group, reorderSymbols]
  );
  const handleDragEnd = () => setDragIndex(null);

  return (
    <div className="flex flex-col h-full text-xs" onClick={() => { setShowGroupMenu(null); }}>
      {/* Group tabs */}
      <div className="flex border-b border-surface-border shrink-0 overflow-x-auto">
        {groups.map((g) => (
          <div key={g.name} className="relative group/tab">
            <button
              className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                g.name === activeGroup
                  ? "text-white bg-surface"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              onClick={() => setActiveGroup(g.name)}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: g.color || GROUP_COLORS[0] }}
              />
              {g.name}
            </button>
            <button
              className="absolute right-0 top-0 bottom-0 px-1 text-gray-600 hover:text-white opacity-0 group-hover/tab:opacity-100"
              onClick={(e) => { e.stopPropagation(); setShowGroupMenu(showGroupMenu === g.name ? null : g.name); }}
            >
              ▾
            </button>
            {showGroupMenu === g.name && (
              <div className="absolute top-full left-0 z-50 bg-surface border border-surface-border rounded shadow-lg py-1 min-w-[120px]">
                <button
                  className="w-full text-left px-2 py-1 text-[10px] text-gray-300 hover:bg-surface-alt"
                  onClick={() => { setRenameMode(g.name); setRenameValue(g.name); setShowGroupMenu(null); }}
                >
                  Rename
                </button>
                <div className="px-2 py-1">
                  <div className="text-[10px] text-gray-500 mb-1">Color</div>
                  <div className="flex gap-1">
                    {GROUP_COLORS.map((c) => (
                      <button
                        key={c}
                        className={`w-3 h-3 rounded-full ${g.color === c ? "ring-1 ring-white" : ""}`}
                        style={{ backgroundColor: c }}
                        onClick={() => { setGroupColor(g.name, c); setShowGroupMenu(null); }}
                      />
                    ))}
                  </div>
                </div>
                {groups.length > 1 && (
                  <button
                    className="w-full text-left px-2 py-1 text-[10px] text-accent-red hover:bg-surface-alt"
                    onClick={() => { removeGroup(g.name); setShowGroupMenu(null); }}
                  >
                    Delete group
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <button
          className="px-1.5 py-1 text-gray-500 hover:text-white shrink-0"
          onClick={() => { setShowAddGroup(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          title="Add group"
        >
          +
        </button>
      </div>

      {/* Add group inline */}
      {showAddGroup && (
        <div className="flex gap-1 p-1 border-b border-surface-border">
          <input
            ref={inputRef}
            className="flex-1 bg-surface border border-surface-border rounded px-1.5 py-1 text-xs text-white outline-none"
            placeholder="Group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddGroup()}
          />
          <button className="text-accent-blue text-xs" onClick={handleAddGroup}>✓</button>
          <button className="text-gray-500 text-xs" onClick={() => setShowAddGroup(false)}>✗</button>
        </div>
      )}

      {/* Rename mode */}
      {renameMode && (
        <div className="flex gap-1 p-1 border-b border-surface-border">
          <input
            className="flex-1 bg-surface border border-surface-border rounded px-1.5 py-1 text-xs text-white outline-none"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim()) {
                renameGroup(renameMode, renameValue.trim());
                setRenameMode(null);
              }
              if (e.key === "Escape") setRenameMode(null);
            }}
          />
          <button
            className="text-accent-blue text-xs"
            onClick={() => { if (renameValue.trim()) { renameGroup(renameMode, renameValue.trim()); setRenameMode(null); } }}
          >
            ✓
          </button>
        </div>
      )}

      {/* Symbol list */}
      <div className="flex-1 overflow-y-auto">
        {group?.symbols.map((sym, idx) => {
          const quote = quotes[sym];
          return (
            <div
              key={`${sym}-${idx}`}
              className="flex items-center justify-between px-2 py-1.5 hover:bg-surface-alt cursor-pointer border-b border-surface-border/20 group/item"
              onClick={() => onSelectSymbol(sym)}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1 h-1 rounded-full shrink-0"
                  style={{ backgroundColor: activeGroupColor }}
                />
                <span className="font-medium text-gray-300">{sym}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`font-mono text-[11px] ${quote ? "text-white" : "text-gray-600"}`}>
                  {quote ? formatPrice(quote.bid) : "--"}
                </span>
                <button
                  className="text-gray-600 hover:text-accent-red opacity-0 group-hover/item:opacity-100 text-[10px] ml-1"
                  onClick={(e) => { e.stopPropagation(); if (group) removeSymbol(group.name, sym); }}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add symbol */}
      {showAddSymbol ? (
        <div className="flex gap-1 p-1 border-t border-surface-border">
          <input
            className="flex-1 bg-surface border border-surface-border rounded px-1.5 py-1 text-xs text-white outline-none"
            placeholder="Symbol (e.g. ETHUSDT)"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleAddSymbol()}
            autoFocus
          />
          <button className="text-accent-blue text-xs" onClick={handleAddSymbol}>✓</button>
          <button className="text-gray-500 text-xs" onClick={() => setShowAddSymbol(false)}>✗</button>
        </div>
      ) : (
        <button
          className="flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-white border-t border-surface-border text-[10px]"
          onClick={() => setShowAddSymbol(true)}
        >
          + Add symbol
        </button>
      )}
    </div>
  );
}
