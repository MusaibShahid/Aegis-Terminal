import { useState } from "react";
import { useMarketStore } from "../stores/useMarketStore";
import { useWatchlistStore } from "../stores/useWatchlistStore";

interface Props {
  onSelectSymbol: (symbol: string) => void;
}

export function WatchlistSidebar({ onSelectSymbol }: Props) {
  const { groups, activeGroup, setActiveGroup, addSymbol, removeSymbol, addGroup, removeGroup, renameGroup, setGroupColor, contextMenu, setContextMenu } = useWatchlistStore();
  const quotes = useMarketStore((s) => s.quotes);

  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null);
  const [newSymbol, setNewSymbol] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const visibleGroups = activeGroup ? groups.filter((g) => g.name === activeGroup) : groups;

  const handleAddGroup = () => {
    const name = newGroupName.trim();
    if (name && !groups.some((g) => g.name === name)) {
      addGroup({ name, symbols: [], color: "#4d7cff", order: groups.length });
    }
    setNewGroupName("");
    setAddingGroup(false);
  };

  const handleAddSymbol = (groupName: string) => {
    const sym = newSymbol.trim().toUpperCase();
    if (sym) addSymbol(groupName, sym);
    setNewSymbol("");
    setAddingSymbol(null);
  };

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {visibleGroups.map((group) => (
          <div key={group.name} className="glass-card overflow-hidden">
            {/* Group header */}
            <div
              className="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-glass-white-hover transition-colors"
              onClick={() => setActiveGroup(activeGroup === group.name ? null : group.name)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, group: group.name, symbol: "" });
              }}
            >
              {renaming === group.name ? (
                <input
                  className="flex-1 bg-surface border border-surface-border rounded px-1 py-0.5 text-xs text-white outline-none"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => { if (renameValue.trim()) renameGroup(group.name, renameValue.trim()); setRenaming(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { if (renameValue.trim()) renameGroup(group.name, renameValue.trim()); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }}
                  autoFocus
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                  <span className="text-gray-300 font-medium text-[10px] uppercase tracking-wider">{group.name}</span>
                  <span className="text-gray-600 text-[9px] font-mono">{group.symbols.length}</span>
                </div>
              )}
              <div className="flex items-center gap-0.5">
                <button
                  className="text-gray-600 hover:text-white text-[9px] p-0.5 rounded hover:bg-glass-white transition-colors"
                  onClick={(e) => { e.stopPropagation(); setAddingSymbol(group.name); }}
                >
                  +
                </button>
                <button
                  className="text-gray-600 hover:text-accent-red text-[9px] p-0.5 rounded hover:bg-glass-white transition-colors"
                  onClick={(e) => { e.stopPropagation(); removeGroup(group.name); }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Symbols */}
            <div className="space-y-px pb-1">
              {group.symbols.map((sym) => {
                const price = quotes[sym] ? (quotes[sym].bid + quotes[sym].ask) / 2 : null;
                return (
                  <div
                    key={sym}
                    className="flex items-center justify-between px-3 py-1 cursor-pointer hover:bg-glass-white-hover transition-colors rounded mx-0.5 group/sym"
                    onClick={() => onSelectSymbol(sym)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, group: group.name, symbol: sym });
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 font-mono text-[10px]">{sym.replace("USDT", "").replace("USD", "")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {price && (
                        <span className="text-gray-300 font-mono text-[10px] tabular-nums">
                          ${price.toFixed(2)}
                        </span>
                      )}
                      <button
                        className="text-gray-700 hover:text-accent-red text-[8px] opacity-0 group-hover/sym:opacity-100 transition-all"
                        onClick={(e) => { e.stopPropagation(); removeSymbol(group.name, sym); }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inline add symbol */}
            {addingSymbol === group.name && (
              <div className="px-2 pb-2">
                <div className="flex gap-1">
                  <input
                    className="flex-1 bg-[#0a0b14] border border-surface-border rounded px-2 py-1 text-[10px] text-white outline-none focus:border-accent-blue/50 transition-colors"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddSymbol(group.name); if (e.key === "Escape") { setAddingSymbol(null); setNewSymbol(""); } }}
                    placeholder="Symbol..."
                    autoFocus
                  />
                  <button
                    className="text-[10px] text-accent-blue hover:text-white px-1 transition-colors"
                    onClick={() => handleAddSymbol(group.name)}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add group button */}
        {addingGroup ? (
          <div className="glass-card p-2">
            <div className="flex gap-1">
              <input
                className="flex-1 bg-[#0a0b14] border border-surface-border rounded px-2 py-1 text-xs text-white outline-none focus:border-accent-blue/50"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddGroup(); if (e.key === "Escape") { setAddingGroup(false); setNewGroupName(""); } }}
                placeholder="Group name..."
                autoFocus
              />
              <button className="btn-ghost text-xs" onClick={handleAddGroup}>+</button>
            </div>
          </div>
        ) : (
          <button
            className="w-full text-[10px] text-gray-600 hover:text-white py-1 rounded transition-colors"
            onClick={() => setAddingGroup(true)}
          >
            + Add Group
          </button>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#0f1120] border border-surface-border rounded-lg shadow-glass py-1 min-w-[120px] animate-scale-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.symbol && (
            <button
              className="w-full text-left px-3 py-1 text-[10px] text-gray-400 hover:text-white hover:bg-glass-white-hover transition-colors"
              onClick={() => { removeSymbol(contextMenu.group, contextMenu.symbol); setContextMenu(null); }}
            >
              ✕ Remove {contextMenu.symbol}
            </button>
          )}
          <button
            className="w-full text-left px-3 py-1 text-[10px] text-gray-400 hover:text-white hover:bg-glass-white-hover transition-colors"
            onClick={() => { setRenaming(contextMenu.group); setRenameValue(contextMenu.group); setContextMenu(null); }}
          >
            ✏ Rename Group
          </button>
          <div className="border-t border-surface-border/50 my-1" />
          {["#4d7cff", "#00d97c", "#ff4757", "#ffc53d", "#9b59ff", "#00d4ff", "#ff8c42"].map((color) => (
            <button
              key={color}
              className="w-full text-left px-3 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-glass-white-hover transition-colors flex items-center gap-2"
              onClick={() => { setGroupColor(contextMenu.group, color); setContextMenu(null); }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {color}
            </button>
          ))}
          <div className="border-t border-surface-border/50 my-1" />
          <button
            className="w-full text-left px-3 py-1 text-[10px] text-accent-red/70 hover:text-accent-red hover:bg-glass-white-hover transition-colors"
            onClick={() => { removeGroup(contextMenu.group); setContextMenu(null); }}
          >
            ✕ Delete Group
          </button>
        </div>
      )}

      {/* Click outside to close context menu */}
      {contextMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
      )}
    </div>
  );
}
