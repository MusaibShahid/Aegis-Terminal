import { useDrawingStore } from "../stores/useDrawingStore";
import type { DrawingTool } from "../types";

const TOOLS: { tool: DrawingTool; label: string; name: string }[] = [
  { tool: "trendline", label: "↗", name: "Trendline" },
  { tool: "horizontal", label: "—", name: "Horizontal" },
  { tool: "vertical", label: "⎸", name: "Vertical" },
  { tool: "ray", label: "→", name: "Ray" },
  { tool: "arrow", label: "▲", name: "Arrow" },
  { tool: "rectangle", label: "▭", name: "Rectangle" },
  { tool: "circle", label: "○", name: "Circle" },
  { tool: "freehand", label: "✎", name: "Freehand" },
  { tool: "fibonacci", label: "Fib", name: "Fibonacci" },
  { tool: "text", label: "T", name: "Text" },
  { tool: "eraser", label: "⌫", name: "Eraser" },
];

export function DrawingToolbar() {
  const activeTool = useDrawingStore((s) => s.activeTool);
  const setActiveTool = useDrawingStore((s) => s.setActiveTool);
  const drawings = useDrawingStore((s) => s.drawings);
  const clearPane = useDrawingStore((s) => s.clearPane);
  const undo = useDrawingStore((s) => s.undo);
  const redo = useDrawingStore((s) => s.redo);

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 bg-surface-alt border-b border-surface-border shrink-0">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`w-7 h-7 flex items-center justify-center text-xs rounded-lg transition-all duration-150 ${
            activeTool?.tool === t.tool
              ? "bg-accent-blue/15 text-accent-blue shadow-[0_0_8px_rgba(59,130,246,0.15)]"
              : "text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
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
          title={t.name}
        >
          {t.label}
        </button>
      ))}
      <div className="w-px h-5 bg-surface-hover mx-1.5" />
      <button
        className="w-7 h-7 flex items-center justify-center text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-all"
        onClick={undo}
        title="Undo"
      >
        ↩
      </button>
      <button
        className="w-7 h-7 flex items-center justify-center text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-all"
        onClick={redo}
        title="Redo"
      >
        ↪
      </button>
      <div className="w-px h-5 bg-surface-hover mx-1.5" />
      <span className="text-[10px] text-text-tertiary tabular-nums">
        {drawings.length}
      </span>
    </div>
  );
}
