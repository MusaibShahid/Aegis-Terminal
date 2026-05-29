import { useEffect, useRef, useCallback } from "react";
import type { UTCTimestamp } from "lightweight-charts";
import type { Drawing } from "../types";
import { useDrawingStore } from "../stores/useDrawingStore";
import type { ChartPaneHandle } from "./ChartPane";

interface Props {
  chartRef: React.RefObject<ChartPaneHandle | null>;
  paneId: string;
}

export function DrawingLayer({ chartRef, paneId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawings = useDrawingStore((s) =>
    s.drawings.filter((d) => d.paneId === paneId)
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const chart = chartRef.current?.chart;
    const series = chartRef.current?.series;
    if (!chart || !series) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const cssWidth = rect.width; // Use CSS width, not physical pixels

    const toX = (time: number): number | null =>
      chart.timeScale().timeToCoordinate((time / 1000) as UTCTimestamp);
    const toY = (price: number): number | null =>
      series.priceToCoordinate(price);

    for (const d of drawings) {
      drawDrawing(ctx, d, toX, toY, cssWidth);
    }
  }, [drawings, chartRef]);

  // Re-render on drawings change
  useEffect(() => {
    render();
    const rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [render]);

  // Re-render on chart scroll/zoom
  useEffect(() => {
    const chart = chartRef.current?.chart;
    if (!chart) return;
    const handler = () => { requestAnimationFrame(render); };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler); };
  }, [chartRef, render]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

function drawDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  toX: (time: number) => number | null,
  toY: (price: number) => number | null,
  cssWidth: number
) {
  ctx.save();
  ctx.strokeStyle = d.color || "#3b82f6";
  ctx.lineWidth = 1.5;

  switch (d.tool) {
    case "horizontal": {
      if (d.points.length < 1) break;
      const y = toY(d.points[0].price);
      if (y == null) break;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssWidth, y);
      ctx.stroke();
      // Price label with background
      const label = `$${d.points[0].price.toFixed(2)}`;
      ctx.font = "10px JetBrains Mono";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(11, 13, 23, 0.8)";
      ctx.fillRect(2, y - 14, tw + 6, 16);
      ctx.fillStyle = d.color || "#3b82f6";
      ctx.fillText(label, 5, y - 2);
      break;
    }

    case "trendline": {
      if (d.points.length < 2) break;
      const x0 = toX(d.points[0].time);
      const y0 = toY(d.points[0].price);
      const x1 = toX(d.points[1].time);
      const y1 = toY(d.points[1].price);
      if (x0 == null || y0 == null || x1 == null || y1 == null) break;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      break;
    }

    case "ray": {
      if (d.points.length < 2) break;
      const x0 = toX(d.points[0].time);
      const y0 = toY(d.points[0].price);
      const x1 = toX(d.points[1].time);
      const y1 = toY(d.points[1].price);
      if (x0 == null || y0 == null || x1 == null || y1 == null) break;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const slope = dx !== 0 ? dy / dx : 0;
      const extY = y0 + slope * (cssWidth - x0);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(cssWidth, extY);
      ctx.stroke();
      break;
    }

    case "rectangle": {
      if (d.points.length < 2) break;
      const rx0 = toX(d.points[0].time);
      const ry0 = toY(d.points[0].price);
      const rx1 = toX(d.points[1].time);
      const ry1 = toY(d.points[1].price);
      if (rx0 == null || ry0 == null || rx1 == null || ry1 == null) break;
      const x = Math.min(rx0, rx1);
      const y = Math.min(ry0, ry1);
      const w = Math.abs(rx1 - rx0);
      const h = Math.abs(ry1 - ry0);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = d.color || "#3b82f6";
      ctx.globalAlpha = 0.08;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      break;
    }

    case "fibonacci": {
      if (d.points.length < 2) break;
      const fy0 = toY(d.points[0].price);
      const fy1 = toY(d.points[1].price);
      if (fy0 == null || fy1 == null) break;
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const yMin = Math.min(fy0, fy1);
      const yMax = Math.max(fy0, fy1);
      const height = yMax - yMin;

      for (const lvl of levels) {
        const y = yMax - height * lvl;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cssWidth, y);
        ctx.strokeStyle = d.color || "#3b82f6";
        ctx.globalAlpha = 0.25;
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Label with background
        const label = `${(lvl * 100).toFixed(1)}%`;
        ctx.font = "9px JetBrains Mono";
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(11, 13, 23, 0.7)";
        ctx.fillRect(2, y - 12, tw + 4, 14);
        ctx.fillStyle = d.color || "#3b82f6";
        ctx.fillText(label, 4, y - 1);
      }
      break;
    }

    case "vertical": {
      if (d.points.length < 1) break;
      const vx = toX(d.points[0].time);
      if (vx == null) break;
      ctx.beginPath();
      ctx.moveTo(vx, 0);
      ctx.lineTo(vx, ctx.canvas.height / (window.devicePixelRatio || 1));
      ctx.stroke();
      break;
    }

    case "arrow": {
      if (d.points.length < 2) break;
      const ax0 = toX(d.points[0].time);
      const ay0 = toY(d.points[0].price);
      const ax1 = toX(d.points[1].time);
      const ay1 = toY(d.points[1].price);
      if (ax0 == null || ay0 == null || ax1 == null || ay1 == null) break;
      ctx.beginPath();
      ctx.moveTo(ax0, ay0);
      ctx.lineTo(ax1, ay1);
      ctx.stroke();
      // Arrowhead
      const angle = Math.atan2(ay1 - ay0, ax1 - ax0);
      const headLen = 8;
      ctx.beginPath();
      ctx.moveTo(ax1, ay1);
      ctx.lineTo(ax1 - headLen * Math.cos(angle - 0.4), ay1 - headLen * Math.sin(angle - 0.4));
      ctx.moveTo(ax1, ay1);
      ctx.lineTo(ax1 - headLen * Math.cos(angle + 0.4), ay1 - headLen * Math.sin(angle + 0.4));
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}
