import { useState, useRef, useCallback, useEffect } from "react";
import { Plus, X, Copy, Edit3, Trash2 } from "lucide-react";
import { useLayoutStore } from "../stores/useLayoutStore";

export function WorkspaceTabs() {
  const workspaces = useLayoutStore((s) => s.workspaces);
  const activeId = useLayoutStore((s) => s.activeWorkspaceId);
  const addWorkspace = useLayoutStore((s) => s.addWorkspace);
  const removeWorkspace = useLayoutStore((s) => s.removeWorkspace);
  const renameWorkspace = useLayoutStore((s) => s.renameWorkspace);
  const switchWorkspace = useLayoutStore((s) => s.switchWorkspace);
  const duplicateWorkspace = useLayoutStore((s) => s.duplicateWorkspace);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const activeTab = containerRef.current.querySelector(`[data-tab-id="${activeId}"]`) as HTMLElement | null;
    activeTab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeId]);

  const startRename = useCallback((id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  }, []);

  const commitRename = useCallback(() => {
    if (editingId && editName.trim()) renameWorkspace(editingId, editName.trim());
    setEditingId(null);
  }, [editingId, editName, renameWorkspace]);

  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  return (
    <div className="flex items-center h-7 bg-surface-alt/60 border-b border-surface-border shrink-0 overflow-hidden">
      <div ref={containerRef} className="flex items-center flex-1 overflow-x-auto scrollbar-none px-1">
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            data-tab-id={ws.id}
            className={`group relative flex items-center gap-1 px-3 py-1 text-[11px] font-mono cursor-pointer transition-all duration-100 shrink-0 select-none ${
              ws.id === activeId
                ? "text-text-primary bg-surface border-t border-l border-r border-surface-border workspace-tab-active"
                : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover border-t border-l border-r border-transparent"
            }`}
            onClick={() => switchWorkspace(ws.id)}
            onContextMenu={(e) => handleContextMenu(e, ws.id)}
            onDoubleClick={() => startRename(ws.id, ws.name)}
            style={{ maxWidth: 140 }}
          >
            {editingId === ws.id ? (
              <input
                ref={inputRef}
                className="w-16 bg-surface-input border border-accent-blue/40 rounded px-1 py-0 text-[11px] text-text-primary outline-none"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingId(null); }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="truncate">{ws.name}</span>
                <span className="text-[9px] text-text-muted tabular-nums shrink-0">{ws.panes.length}</span>
                {workspaces.length > 1 && (
                  <button
                    className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded text-text-muted hover:text-accent-red hover:bg-accent-red/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); removeWorkspace(ws.id); }}
                  >
                    <X size={8} />
                  </button>
                )}
              </>
            )}
          </div>
        ))}

        <button
          className="flex items-center justify-center w-6 h-6 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-all shrink-0"
          onClick={() => addWorkspace()}
          title="New workspace"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-surface-card border border-surface-border rounded-lg shadow-lg py-1 min-w-[140px] animate-fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            onClick={() => { duplicateWorkspace(contextMenu.id); setContextMenu(null); }}
          >
            <Copy size={11} /> Duplicate
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            onClick={() => {
              const ws = workspaces.find((w) => w.id === contextMenu.id);
              if (ws) startRename(ws.id, ws.name);
              setContextMenu(null);
            }}
          >
            <Edit3 size={11} /> Rename
          </button>
          {workspaces.length > 1 && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-accent-red/70 hover:text-accent-red hover:bg-accent-red/5 transition-colors"
              onClick={() => { removeWorkspace(contextMenu.id); setContextMenu(null); }}
            >
              <Trash2 size={11} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
