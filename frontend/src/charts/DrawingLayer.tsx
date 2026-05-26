import { useEffect, useRef, useState, useCallback } from "react";
import { useDrawingStore } from "../stores/useDrawingStore";
import type { ChartPaneHandle } from "./ChartPane";

interface Props {
  chartRef: React.RefObject<ChartPaneHandle | null>;
  paneId: string;
}

export function DrawingLayer({ chartRef, paneId }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drawings = useDrawingStore((s) => s.drawings);
  const addDrawing = useDrawingStore((s) => s.addDrawing);
  const removeDrawing = useDrawingStore((s) => s.removeDrawing);
  const activeTool = useDrawingStore((s) => s.activeTool);
  const loadDrawings = useDrawingStore((s) => s.loadDrawings);
  const [drawing, setDrawing] = useState<{ points: { x: number; y: number }[] } | null>(null);

  useEffect(() => {
    loadDrawings(paneId);
  }, [paneId, loadDrawings]);

  const toSvgPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!activeTool || activeTool.tool === "eraser") return;
      const pt = toSvgPoint(e.clientX, e.clientY);
      setDrawing({ points: [pt] });
    },
    [activeTool, toSvgPoint]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawing) return;
      const pt = toSvgPoint(e.clientX, e.clientY);
      setDrawing((prev) =>
        prev ? { points: [prev.points[0], pt] } : null
      );
    },
    [drawing, toSvgPoint]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!drawing || !activeTool) return;
      const pt = toSvgPoint(e.clientX, e.clientY);
      if (activeTool.tool === "eraser") {
        const hit = drawings.find((d) => {
          const p0 = d.points[0];
          if (!p0) return false;
          return Math.sqrt((p0.x - pt.x) ** 2 + (p0.y - pt.y) ** 2) < 10;
        });
        if (hit) removeDrawing(hit.id ?? `_${hit._serverId}`);
        setDrawing(null);
        return;
      }

      const points =
        activeTool.tool === "horizontal"
          ? [{ x: 0, y: drawing.points[0].y }, { x: 10000, y: drawing.points[0].y }]
          : [drawing.points[0], pt];

      addDrawing({
        id: `d-${Date.now()}`,
        paneId,
        tool: activeTool.tool,
        points,
        color: activeTool.tool === "fibonacci" ? "#eab308" : "#3b82f6",
      });
      setDrawing(null);
    },
    [drawing, activeTool, paneId, addDrawing, removeDrawing, drawings, toSvgPoint]
  );

  const paneDrawings = drawings.filter((d) => d.paneId === paneId);
  const hasActiveTool = activeTool !== null;

  const renderDrawing = (d: typeof drawings[0]) => {
    if (d.points.length < 2) return null;
    const [x1, y1] = [d.points[0].x, d.points[0].y];
    const [x2, y2] = [d.points[d.points.length - 1].x, d.points[d.points.length - 1].y];

    switch (d.tool) {
      case "trendline":
      case "ray":
        return (
          <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={d.color || "#3b82f6"}
            strokeWidth={1.5}
            strokeDasharray={d.tool === "ray" ? "none" : "none"}
          />
        );
      case "horizontal":
        return (
          <line
            x1={0} y1={y1} x2={10000} y2={y1}
            stroke={d.color || "#3b82f6"} strokeWidth={1}
          />
        );
      case "vertical":
        return (
          <line
            x1={x1} y1={0} x2={x1} y2={10000}
            stroke={d.color || "#3b82f6"} strokeWidth={1}
          />
        );
      case "arrow":
        return (
          <g>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color || "#3b82f6"} strokeWidth={1.5} />
            <polygon
              points={`${x2},${y2} ${x2 - 8},${y2 - 5} ${x2 - 8},${y2 + 5}`}
              fill={d.color || "#3b82f6"}
            />
          </g>
        );
      case "circle":
        return (
          <ellipse
            cx={(x1 + x2) / 2} cy={(y1 + y2) / 2}
            rx={Math.abs(x2 - x1) / 2} ry={Math.abs(y2 - y1) / 2}
            stroke={d.color || "#3b82f6"} strokeWidth={1}
            fill="none"
          />
        );
      case "rectangle":
        return (
          <rect
            x={Math.min(x1, x2)} y={Math.min(y1, y2)}
            width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
            stroke={d.color || "#3b82f6"} strokeWidth={1}
            fill="none"
          />
        );
      case "fibonacci": {
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const top = Math.min(y1, y2);
        const bot = Math.max(y1, y2);
        const h = bot - top;
        return levels.map((lv, i) => (
          <line
            key={i}
            x1={x1} y1={top + h * lv}
            x2={x2} y2={top + h * lv}
            stroke="#eab308" strokeWidth={0.5}
            strokeDasharray="4 4"
            opacity={0.6}
          />
        ));
      }
      default:
        return null;
    }
  };

  return (
    <svg
      ref={svgRef}
      className={`absolute inset-0 w-full h-full z-20 ${
        hasActiveTool ? "cursor-crosshair" : "pointer-events-none"
      }`}
      onMouseDown={hasActiveTool ? handleMouseDown : undefined}
      onMouseMove={hasActiveTool ? handleMouseMove : undefined}
      onMouseUp={hasActiveTool ? handleMouseUp : undefined}
    >
      {paneDrawings.map((d) => (
        <g key={d.id}>{renderDrawing(d)}</g>
      ))}
      {drawing && drawing.points.length >= 2 && (
        <line
          x1={drawing.points[0].x} y1={drawing.points[0].y}
          x2={drawing.points[1].x} y2={drawing.points[1].y}
          stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 4"
          opacity={0.7}
        />
      )}
    </svg>
  );
}
