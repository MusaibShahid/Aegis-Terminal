import { useEffect, useRef, useCallback, useState } from "react";
import { useDrawingStore, type Drawing } from "../stores/useDrawingStore";
import type { Candle } from "../types";
import type { ChartPaneHandle } from "./ChartPane";

interface Props {
  chartRef: React.RefObject<ChartPaneHandle | null>;
  paneId: string;
  symbol: string;
  candles: Candle[];
}

export function DrawingLayer({ chartRef, paneId, symbol, candles }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawings = useDrawingStore((s) =>
    s.drawings.filter((d) => d.paneId === paneId || d.symbol === symbol)
  );

  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw existing drawings
    for (const d of drawings) {
      drawDrawing(ctx, d);
    }

    // Draw in-progress drawing
    if (drawing) {
      drawDrawing(ctx, drawing);
    }
  }, [drawings, drawing]);

  useEffect(() => {
    render();
    const interval = setInterval(render, 100);
    return () => clearInterval(interval);
  }, [render]);

  // ... (drawing interaction handlers remain unchanged)

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

function drawDrawing(ctx: CanvasRenderingContext2D, d: Drawing) {
  ctx.save();
  ctx.strokeStyle = d.color || "#4d7cff";
  ctx.lineWidth = d.lineWidth || 1.5;
  ctx.setLineDash(d.dashed ? [4, 4] : []);

  switch (d.type) {
    case "horizontal_line":
      if (d.points.length >= 1) {
        const y = d.points[0].y;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(ctx.canvas.width, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = d.color || "#4d7cff";
        ctx.font = "10px JetBrains Mono";
        ctx.fillText(`$${d.points[0].price?.toFixed(2) || ""}`, 4, y - 4);
      }
      break;

    case "trend_line":
      if (d.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(d.points[0].x, d.points[0].y);
        ctx.lineTo(d.points[1].x, d.points[1].y);
        ctx.stroke();
      }
      break;

    case "ray":
      if (d.points.length >= 2) {
        const dx = d.points[1].x - d.points[0].x;
        const dy = d.points[1].y - d.points[0].y;
        const slope = dx !== 0 ? dy / dx : 0;
        const extX = ctx.canvas.width;
        const extY = d.points[0].y + slope * (extX - d.points[0].x);
        ctx.beginPath();
        ctx.moveTo(d.points[0].x, d.points[0].y);
        ctx.lineTo(extX, extY);
        ctx.stroke();
      }
      break;

    case "rectangle":
      if (d.points.length >= 2) {
        const x = Math.min(d.points[0].x, d.points[1].x);
        const y = Math.min(d.points[0].y, d.points[1].y);
        const w = Math.abs(d.points[1].x - d.points[0].x);
        const h = Math.abs(d.points[1].y - d.points[0].y);
        ctx.strokeRect(x, y, w, h);
        if (d.fill) {
          ctx.fillStyle = d.color || "#4d7cff";
          ctx.globalAlpha = 0.1;
          ctx.fillRect(x, y, w, h);
          ctx.globalAlpha = 1;
        }
      }
      break;

    case "fibonacci":
      if (d.points.length >= 2) {
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const y1 = d.points[0].y;
        const y2 = d.points[1].y;
        const yMin = Math.min(y1, y2);
        const yMax = Math.max(y1, y2);
        const height = yMax - yMin;

        for (const lvl of levels) {
          const y = yMax - height * lvl;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(ctx.canvas.width, y);
          ctx.strokeStyle = d.color || "#4d7cff";
          ctx.globalAlpha = 0.3;
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.setLineDash([]);
          ctx.fillStyle = d.color || "#4d7cff";
          ctx.font = "9px JetBrains Mono";
          ctx.fillText(`${(lvl * 100).toFixed(1)}%`, 4, y - 2);
          ctx.setLineDash(d.dashed ? [4, 4] : []);
        }
        ctx.setLineDash([]);
      }
      break;
  }

  ctx.restore();
}
