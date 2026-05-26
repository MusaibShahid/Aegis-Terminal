import { useDrawingStore } from "../stores/useDrawingStore";
import type { DrawingTool } from "../types";

const TOOLS: { tool: DrawingTool; label: string }[] = [
  { tool: "trendline", label: "↗" },
  { tool: "horizontal", label: "—" },
  { tool: "vertical", label: "⎸" },
  { tool: "ray", label: "→" },
  { tool: "arrow", label: "▲" },
  { tool: "rectangle", label: "▭" },
  { tool: "circle", label: "○" },
  { tool: "freehand", label: "✎" },
  { tool: "fibonacci", label: "Fib" },
  { tool: "text", label: "T" },
  { tool: "eraser", label: "⌫" },
];

export function DrawingToolbar() {
  const activeTool = useDrawingStore((s) => s.activeTool);
  const setActiveTool = useDrawingStore((s) => s.setActiveTool);
  const drawings = useDrawingStore((s) => s.drawings);
  const clearPane = useDrawingStore((s) => s.clearPane);
  const undo = useDrawingStore((s) => s.undo);
  const redo = useDrawingStore((s) => s.redo);

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-surface-alt border-b border-surface-border shrink-0">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`w-7 h-7 flex items-center justify-center text-xs rounded transition-colors ${
            activeTool?.tool === t.tool
              ? "bg-accent-blue text-white"
              : "text-gray-400 hover:text-white hover:bg-surface"
          }`}
          onClick={() => {
            if (t.tool === "eraser") {
              setActiveTool({ tool: "eraser" });
            } else if (activeTool?.tool === t.tool) {
              setActiveTool(null);
            } else {
              setActiveTool({ tool: t.tool });
            }
          }}
          title={t.tool}
        >
          {t.label}
        </button>
      ))}
      <div className="w-px h-5 bg-surface-border mx-1" />
      <button className="w-7 h-7 flex items-center justify-center text-xs text-gray-400 hover:text-white" onClick={undo} title="Undo">↩</button>
      <button className="w-7 h-7 flex items-center justify-center text-xs text-gray-400 hover:text-white" onClick={redo} title="Redo">↪</button>
      <div className="w-px h-5 bg-surface-border mx-1" />
      <span className="text-[10px] text-gray-500">{drawings.length}</span>
    </div>
  );
}
