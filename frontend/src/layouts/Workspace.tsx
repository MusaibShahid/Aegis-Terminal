import { useCallback, useEffect, useRef, useState } from "react";

import { StatusBar } from "../components/StatusBar";
import { ToolsDrawer } from "../components/ToolsDrawer";
import { useLayoutStore } from "../stores/useLayoutStore";
import { useToolStore } from "../stores/useToolStore";
import { useResponsive } from "../hooks/useResponsive";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { Sidebar } from "../sidebar/Sidebar";
import { Pane } from "./Pane";

export function Workspace() {
  const panes = useLayoutStore((s) => s.panes);
  const updatePane = useLayoutStore((s) => s.updatePane);
  const addPane = useLayoutStore((s) => s.addPane);
  const removePane = useLayoutStore((s) => s.removePane);
  const linkedMode = useLayoutStore((s) => s.linkedMode);
  const toggleLinkedMode = useLayoutStore((s) => s.toggleLinkedMode);
  const toggleDrawer = useToolStore((s) => s.toggleDrawer);
  const responsive = useResponsive();

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const resizeTick = useRef(0);

  const [paneHeights, setPaneHeights] = useState<number[]>(() =>
    panes.map(() =>
      Math.max(150, Math.floor((window.innerHeight - 28) / Math.max(panes.length, 1)))
    )
  );

  const dragRef = useRef<{ idx: number; startY: number; startH: number } | null>(null);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    "Ctrl+.": () => toggleDrawer(),
    "Ctrl+Shift+P": () => {
      if (panes.length > 0) addPane();
    },
    "Ctrl+Shift+M": () => toggleLinkedMode(),
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContainerWidth(e.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    resizeTick.current += 1;
  }, [panes.length]);

  const handleSelectSymbol = useCallback(
    (symbol: string) => {
      if (panes.length > 0) {
        updatePane(panes[0].id, { symbol });
      }
    },
    [panes, updatePane]
  );

  const handleMouseDown = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { idx, startY: e.clientY, startH: paneHeights[idx] };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientY - dragRef.current.startY;
      const newH = Math.max(100, dragRef.current.startH + delta);
      setPaneHeights((prev) => {
        const next = [...prev];
        next[dragRef.current!.idx] = newH;
        return next;
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const syncHeights = () => {
    const total = window.innerHeight - 28;
    const each = Math.max(150, Math.floor(total / Math.max(panes.length, 1)));
    setPaneHeights(panes.map(() => each));
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Tools Drawer overlay */}
      <ToolsDrawer />

      {/* Top bar — glass morphism header */}
      <div className="h-7 glass-card rounded-none border-x-0 border-t-0 flex items-center px-2 md:px-3 gap-1 md:gap-2 shrink-0 z-10">
        <div className="flex items-center gap-1 md:gap-2 min-w-0">
          <span className="text-sm font-bold text-gradient tracking-wide shrink-0">Aegis</span>
          <span className="text-[10px] text-gray-600 font-mono hidden sm:inline">v0.2</span>
        </div>

        {/* Tools button */}
        <button
          className="md:hidden ml-1 w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-glass-white-hover transition-all shrink-0"
          onClick={() => toggleDrawer()}
          title="Tools"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        <div className="flex items-center gap-1 ml-auto">
          {/* Keyboard shortcut hint */}
          <span className="text-[9px] text-gray-700 font-mono hidden lg:inline">
            <kbd className="text-[8px] border border-surface-border rounded px-1 py-0.5">Ctrl+.</kbd>
          </span>

          {/* Linked mode toggle */}
          <button
            className={`text-[10px] px-1.5 md:px-2 py-0.5 rounded transition-all duration-150 whitespace-nowrap ${
              linkedMode
                ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30 shadow-glow"
                : "bg-glass-white text-gray-500 hover:text-white hover:bg-glass-white-hover border border-transparent"
            }`}
            onClick={toggleLinkedMode}
            title={linkedMode ? "Linked mode active — all panes sync" : "Click to link all panes"}
          >
            <span className="flex items-center gap-1">
              {linkedMode ? "🔗" : "⊘"}
              <span className="hidden sm:inline text-[10px]">Link</span>
            </span>
          </button>

          {/* Tools button — desktop */}
          <button
            className="hidden md:flex text-[10px] px-2 py-0.5 rounded bg-glass-white text-gray-500 hover:text-white hover:bg-glass-white-hover border border-transparent transition-all duration-150 items-center gap-1"
            onClick={() => toggleDrawer()}
            title="Toggle Tools Drawer"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="hidden lg:inline text-[10px]">Tools</span>
          </button>

          {/* Pane controls */}
          <div className="flex items-center gap-1">
            <button
              className="text-[10px] px-1.5 md:px-2 py-0.5 rounded bg-glass-white text-gray-500 hover:text-white hover:bg-glass-white-hover border border-transparent transition-all duration-150 whitespace-nowrap"
              onClick={() => addPane()}
              title="Add pane"
            >
              <span className="hidden sm:inline">+</span>
              <span className="sm:hidden">+</span>
              <span className="hidden md:inline ml-0.5">Pane</span>
            </button>
            <button
              className={`text-[10px] px-1.5 md:px-2 py-0.5 rounded border border-transparent transition-all duration-150 ${
                panes.length > 1
                  ? "bg-glass-white text-gray-500 hover:text-white hover:bg-glass-white-hover"
                  : "text-gray-700 cursor-not-allowed"
              }`}
              onClick={() => {
                if (panes.length > 1) {
                  removePane(panes[panes.length - 1].id);
                  syncHeights();
                }
              }}
              title="Remove pane"
            >
              <span className="hidden sm:inline">−</span>
              <span className="sm:hidden">−</span>
              <span className="hidden md:inline ml-0.5">Pane</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <Sidebar onSelectSymbol={handleSelectSymbol} />
        <div ref={containerRef} className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {panes.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-600">
              <div className="text-center space-y-2">
                <svg className="w-10 h-10 mx-auto opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                <div className="text-xs">No panes open</div>
                <button className="btn-ghost text-[10px]" onClick={() => addPane()}>
                  + Add Pane
                </button>
              </div>
            </div>
          ) : (
            panes.map((pane, i) => (
              <div key={pane.id} className="flex flex-col shrink-0" style={{ height: paneHeights[i] || 200 }}>
                <div className="flex-1 min-h-0">
                  <Pane
                    pane={pane}
                    height={paneHeights[i] || 200}
                    containerWidth={containerWidth}
                    resizeKey={resizeTick.current}
                  />
                </div>
                {i < panes.length - 1 && (
                  <div
                    className="h-[3px] bg-surface-border relative cursor-row-resize group shrink-0 z-10"
                    onMouseDown={(e) => handleMouseDown(i, e)}
                  >
                    <div className="absolute -top-1.5 left-0 right-0 h-4" />
                    <div className="absolute inset-0 bg-surface-border group-hover:bg-accent-blue/40 group-hover:shadow-glow transition-all duration-150 rounded-full" />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
