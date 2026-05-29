import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Minus, Link2, Link2Off, Settings, LayoutGrid } from "lucide-react";

import { StatusBar } from "../components/StatusBar";
import { ToolsDrawer } from "../components/ToolsDrawer";
import { WorkspaceTabs } from "../components/WorkspaceTabs";
import { useLayoutStore } from "../stores/useLayoutStore";
import { useToolStore } from "../stores/useToolStore";
import { useResponsive } from "../hooks/useResponsive";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { Sidebar } from "../sidebar/Sidebar";
import { Pane } from "./Pane";

export function Workspace() {
  const getActiveWorkspace = useLayoutStore((s) => s.getActiveWorkspace);
  const updatePane = useLayoutStore((s) => s.updatePane);
  const addPane = useLayoutStore((s) => s.addPane);
  const removePane = useLayoutStore((s) => s.removePane);
  const linkedMode = useLayoutStore((s) => s.linkedMode);
  const toggleLinkedMode = useLayoutStore((s) => s.toggleLinkedMode);

  const workspace = getActiveWorkspace();
  const panes = workspace?.panes ?? [];
  const toggleDrawer = useToolStore((s) => s.toggleDrawer);
  const responsive = useResponsive();

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [containerHeight, setContainerHeight] = useState(600);

  // Drag-to-resize state
  const [columnSplit, setColumnSplit] = useState(0.5);
  const [rowSplit, setRowSplit] = useState(0.5);
  const [dragging, setDragging] = useState<'col' | 'row' | null>(null);
  const dragContainerRect = useRef<DOMRect | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragContainerRect.current) return;
      const rect = dragContainerRect.current;
      if (dragging === 'col') {
        setColumnSplit(Math.max(0.15, Math.min(0.85, (e.clientX - rect.left) / rect.width)));
      } else {
        setRowSplit(Math.max(0.15, Math.min(0.85, (e.clientY - rect.top) / rect.height)));
      }
    };
    const handleMouseUp = () => {
      setDragging(null);
      dragContainerRect.current = null;
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  const onDividerMouseDown = useCallback(
    (type: 'col' | 'row', e: React.MouseEvent) => {
      e.preventDefault();
      if (!containerRef.current) return;
      dragContainerRect.current = containerRef.current.getBoundingClientRect();
      setDragging(type);
    },
    []
  );

  useKeyboardShortcuts({
    "Ctrl+.": () => toggleDrawer(),
    "Ctrl+Shift+P": () => addPane(),
    "Ctrl+Shift+M": () => toggleLinkedMode(),
    "Ctrl+T": () => useLayoutStore.getState().addWorkspace(),
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let rafId: number;
    const ro = new ResizeObserver((entries) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        for (const e of entries) {
          setContainerWidth(e.contentRect.width);
          setContainerHeight(e.contentRect.height);
        }
      });
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(rafId); ro.disconnect(); };
  }, []);

  const handleSelectSymbol = useCallback(
    (symbol: string) => {
      if (panes.length > 0) updatePane(panes[0].id, { symbol });
    },
    [panes, updatePane]
  );

  const gridCols = responsive.isMobile ? 1 : 2;
  const gridRows = gridCols > 0 ? Math.ceil(panes.length / gridCols) : 1;
  const hasMultipleCols = gridCols > 1;
  const hasMultipleRows = gridRows > 1;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface">
      <ToolsDrawer />

      {/* Top bar */}
      <div className="h-9 bg-surface-alt border-b border-surface-border flex items-center px-3 gap-3 shrink-0 z-10">
        {/* Brand */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-gradient tracking-wide">Aegis</span>
          <span className="text-[10px] text-text-tertiary font-mono hidden sm:inline">Terminal</span>
        </div>

        {/* Mobile tools */}
        <button
          className="md:hidden w-7 h-7 flex items-center justify-center rounded text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          onClick={() => toggleDrawer()}
          title="Tools"
        >
          <Settings size={14} />
        </button>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Keyboard hint */}
          <span className="text-[9px] text-text-muted font-mono hidden lg:inline">
            <kbd className="text-[8px] border border-surface-border rounded px-1 py-0.5">Ctrl+.</kbd>
          </span>

          {/* Linked mode */}
          <button
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
              linkedMode
                ? "bg-accent-blue/12 text-accent-blue border border-accent-blue/25 shadow-glow"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-transparent"
            }`}
            onClick={toggleLinkedMode}
            title={linkedMode ? "Linked mode active" : "Link all panes"}
          >
            {linkedMode ? <Link2 size={12} /> : <Link2Off size={12} />}
            <span className="hidden sm:inline">Link</span>
          </button>

          {/* Tools — desktop */}
          <button
            className="hidden md:flex items-center gap-1 px-2 py-1 rounded text-[11px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors border border-transparent"
            onClick={() => toggleDrawer()}
            title="Tools"
          >
            <LayoutGrid size={12} />
            <span className="hidden lg:inline">Tools</span>
          </button>

          {/* Pane controls */}
          <div className="flex items-center gap-0.5">
            <button
              className="flex items-center gap-0.5 px-2 py-1 rounded text-[11px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors border border-transparent"
              onClick={() => addPane()}
              title="Add pane"
            >
              <Plus size={12} />
              <span className="hidden md:inline">Pane</span>
            </button>
            <button
              className={`flex items-center gap-0.5 px-2 py-1 rounded text-[11px] transition-colors border border-transparent ${
                panes.length > 1
                  ? "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                  : "text-text-muted cursor-not-allowed"
              }`}
              onClick={() => { if (panes.length > 1) removePane(panes[panes.length - 1].id); }}
              title="Remove pane"
            >
              <Minus size={12} />
              <span className="hidden md:inline">Pane</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cursor overlay when dragging */}
      {dragging && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: dragging === 'col' ? 'col-resize' : 'row-resize' }} />
      )}

      <WorkspaceTabs />

      <div className="flex flex-1 min-h-0">
        <Sidebar onSelectSymbol={handleSelectSymbol} />
        <div ref={containerRef} className="flex-1 min-w-0 overflow-hidden">
          {panes.length === 0 ? (
            <div className="h-full flex items-center justify-center text-text-tertiary">
              <div className="text-center space-y-3">
                <LayoutGrid size={32} className="mx-auto opacity-20" />
                <div className="text-sm">No panes open</div>
                <button className="btn-ghost text-xs" onClick={() => addPane()}>
                  <Plus size={14} /> Add Pane
                </button>
              </div>
            </div>
          ) : (
            <div
              className="grid w-full h-full pane-resize-container"
              style={{
                gridTemplateColumns: hasMultipleCols ? `${columnSplit}fr ${1 - columnSplit}fr` : '1fr',
                gridTemplateRows: hasMultipleRows ? `${rowSplit}fr ${1 - rowSplit}fr` : '1fr',
                gap: '2px',
              }}
            >
              {panes.map((pane, index) => {
                const colIndex = index % gridCols;
                const colWidth = hasMultipleCols
                  ? (colIndex === 0 ? columnSplit : 1 - columnSplit) * containerWidth
                  : containerWidth;
                return (
                  <div key={pane.id} className="min-h-0 min-w-0 overflow-hidden relative">
                    <Pane pane={pane} containerWidth={colWidth} containerHeight={containerHeight} />
                  </div>
                );
              })}

              {/* Vertical divider */}
              {hasMultipleCols && (
                <div
                  className={`pane-resize-handle ${dragging === 'col' ? 'dragging' : ''}`}
                  style={{ position: 'absolute', left: `calc(${columnSplit * 100}% - 6px)`, top: 0, width: '12px', height: '100%', cursor: 'col-resize', zIndex: 20 }}
                  onMouseDown={(e) => onDividerMouseDown('col', e)}
                >
                  <div className="pane-resize-handle-knob" />
                </div>
              )}

              {/* Horizontal divider */}
              {hasMultipleRows && (
                <div
                  className={`pane-resize-handle pane-resize-handle-h ${dragging === 'row' ? 'dragging' : ''}`}
                  style={{ position: 'absolute', top: `calc(${rowSplit * 100}% - 6px)`, left: 0, width: '100%', height: '12px', cursor: 'row-resize', zIndex: 20 }}
                  onMouseDown={(e) => onDividerMouseDown('row', e)}
                >
                  <div className="pane-resize-handle-knob-h" />
                </div>
              )}

              {/* Intersection dot */}
              {hasMultipleCols && hasMultipleRows && (
                <div
                  className={`pane-resize-intersection ${dragging ? 'dragging' : ''}`}
                  style={{ position: 'absolute', left: `calc(${columnSplit * 100}% - 6px)`, top: `calc(${rowSplit * 100}% - 6px)`, width: '12px', height: '12px', zIndex: 21, cursor: 'all-scroll' }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
