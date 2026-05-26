import { useCallback, useEffect, useRef, useState } from "react";

import { StatusBar } from "../components/StatusBar";
import { useLayoutStore } from "../stores/useLayoutStore";
import { Sidebar } from "../sidebar/Sidebar";
import { Pane } from "./Pane";

export function Workspace() {
  const panes = useLayoutStore((s) => s.panes);
  const updatePane = useLayoutStore((s) => s.updatePane);
  const addPane = useLayoutStore((s) => s.addPane);
  const removePane = useLayoutStore((s) => s.removePane);
  const linkedMode = useLayoutStore((s) => s.linkedMode);
  const toggleLinkedMode = useLayoutStore((s) => s.toggleLinkedMode);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const resizeTick = useRef(0);

  const [paneHeights, setPaneHeights] = useState<number[]>(() =>
    panes.map(() =>
      Math.max(150, Math.floor((window.innerHeight - 28) / Math.max(panes.length, 1)))
    )
  );

  const dragRef = useRef<{ idx: number; startY: number; startH: number } | null>(null);

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

  // Force resize tick after panes change (for hidden panes that need deferred init)
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
    <div className="h-screen flex flex-col overflow-hidden bg-surface">
      {/* Top bar */}
      <div className="h-7 bg-surface-alt border-b border-surface-border flex items-center px-2 gap-2 shrink-0 z-10">
        <span className="text-xs text-gray-400 font-semibold">Aegis Terminal</span>
        <div className="flex items-center gap-1 ml-auto">
          <button
            className={`text-[10px] px-2 py-0.5 rounded ${
              linkedMode
                ? "bg-accent-blue text-white"
                : "bg-surface text-gray-400 hover:text-white"
            }`}
            onClick={toggleLinkedMode}
          >
            Linked
          </button>
          <button
            className="text-[10px] px-2 py-0.5 rounded bg-surface text-gray-400 hover:text-white"
            onClick={() => addPane()}
          >
            + Pane
          </button>
          <button
            className="text-[10px] px-2 py-0.5 rounded bg-surface text-gray-400 hover:text-white"
            onClick={() => {
              if (panes.length > 1) {
                removePane(panes[panes.length - 1].id);
                syncHeights();
              }
            }}
          >
            - Pane
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <Sidebar onSelectSymbol={handleSelectSymbol} />
        <div ref={containerRef} className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {panes.map((pane, i) => (
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
                  className="h-1 bg-surface-border cursor-row-resize hover:bg-accent-blue/30 shrink-0 transition-colors z-10"
                  onMouseDown={(e) => handleMouseDown(i, e)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
