import type { FootprintLevel, Candle } from "../types";
import type { IChartApi } from "lightweight-charts";

// ---------------------------------------------------------------------------
// Footprint overlay drawing helpers — pure canvas functions
// ---------------------------------------------------------------------------

export function drawBidAsk(
  ctx: CanvasRenderingContext2D,
  visible: FootprintLevel[],
  localMax: number,
  maxPx: number,
  centerX: number,
  w: number,
  h: number,
  priceToCoordinate: (price: number) => number | null,
): void {
  for (const lvl of visible) {
    let y: number;
    try {
      const coord = priceToCoordinate(lvl.price);
      if (coord === null || coord < 0) continue;
      y = coord;
    } catch {
      continue;
    }
    if (y < -10 || y > h + 10) continue;

    const bv = lvl.bid_volume ?? 0;
    const av = lvl.ask_volume ?? 0;
    const barH = Math.max(3, Math.min(8, h / 80));

    // Bid bar (left — green)
    const bidW = (bv / localMax) * maxPx;
    if (bidW > 1.5) {
      ctx.fillStyle = "rgba(34, 197, 94, 0.45)";
      ctx.fillRect(centerX - bidW, y - barH / 2, bidW, barH);
    }

    // Ask bar (right — red)
    const askW = (av / localMax) * maxPx;
    if (askW > 1.5) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.45)";
      ctx.fillRect(centerX, y - barH / 2, askW, barH);
    }

    // Volume leader label
    const totalVol = bv + av;
    if (totalVol > localMax * 0.6) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.font = "8px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(lvl.price.toFixed(2), centerX + askW + 3, y + 3);
    }
  }

  // Faint divider at bar center
  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, h);
  ctx.stroke();
}

export function drawDelta(
  ctx: CanvasRenderingContext2D,
  visible: FootprintLevel[],
  localMax: number,
  maxPx: number,
  centerX: number,
  w: number,
  h: number,
  priceToCoordinate: (price: number) => number | null,
): void {
  for (const lvl of visible) {
    let y: number;
    try {
      const coord = priceToCoordinate(lvl.price);
      if (coord === null || coord < 0) continue;
      y = coord;
    } catch {
      continue;
    }
    if (y < -10 || y > h + 10) continue;

    const delta = lvl.delta ?? 0;
    const absDelta = Math.abs(delta);
    const barW = (absDelta / localMax) * maxPx;
    const barH = Math.max(3, Math.min(8, h / 80));

    if (barW > 1) {
      // Color: green for positive delta, red for negative, gray for zero
      if (delta > 0) {
        ctx.fillStyle = "rgba(34, 197, 94, 0.5)";
      } else {
        ctx.fillStyle = "rgba(239, 68, 68, 0.5)";
      }

      // Positive delta extends right from center, negative extends left
      const x = delta >= 0 ? centerX : centerX - barW;
      ctx.fillRect(x, y - barH / 2, barW, barH);
    }

    // Label for large deltas
    if (absDelta > localMax * 0.5) {
      ctx.fillStyle = delta > 0 ? "rgba(34, 197, 94, 0.35)" : "rgba(239, 68, 68, 0.35)";
      ctx.font = "8px 'JetBrains Mono', monospace";
      ctx.textAlign = delta >= 0 ? "left" : "right";
      const labelX = delta >= 0 ? centerX + barW + 2 : centerX - barW - 2;
      ctx.fillText(delta.toFixed(0), labelX, y + 3);
    }
  }

  // Faint zero-line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, h);
  ctx.stroke();
}

export function drawImbalance(
  ctx: CanvasRenderingContext2D,
  visible: FootprintLevel[],
  maxPx: number,
  centerX: number,
  w: number,
  h: number,
  priceToCoordinate: (price: number) => number | null,
): void {
  for (const lvl of visible) {
    let y: number;
    try {
      const coord = priceToCoordinate(lvl.price);
      if (coord === null || coord < 0) continue;
      y = coord;
    } catch {
      continue;
    }
    if (y < -10 || y > h + 10) continue;

    const imb = lvl.imbalance ?? 0;
    // imb ranges from -1 (all ask) to +1 (all bid)
    const absImb = Math.abs(imb);
    const barW = absImb * maxPx;
    const barH = Math.max(3, Math.min(8, h / 80));

    if (barW > 1) {
      // Color intensity based on imbalance strength
      const alpha = Math.min(0.7, 0.25 + absImb * 0.35);
      if (imb > 0) {
        ctx.fillStyle = `rgba(34, 197, 94, ${alpha})`;
      } else {
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
      }

      // Positive imbalance extends right from center, negative extends left
      const x = imb >= 0 ? centerX : centerX - barW;
      ctx.fillRect(x, y - barH / 2, barW, barH);
    }

    // Label for strong imbalances
    if (absImb > 0.5) {
      ctx.fillStyle = imb > 0 ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)";
      ctx.font = "8px 'JetBrains Mono', monospace";
      ctx.textAlign = imb >= 0 ? "left" : "right";
      const labelX = imb >= 0 ? centerX + barW + 2 : centerX - barW - 2;
      ctx.fillText((imb * 100).toFixed(0) + "%", labelX, y + 3);
    }
  }

  // Faint zero-line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, h);
  ctx.stroke();
}

export function drawCandleVolumes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cApi: IChartApi,
  candles: Candle[],
): void {
  // Determine which candles are visible and collect their x-positions
  interface VisCandle {
    x: number;
    volume: number;
    isUp: boolean;
  }
  const visibleCandles: VisCandle[] = [];

  const timeScale = cApi.timeScale();

  for (const c of candles) {
    try {
      const x = timeScale.timeToCoordinate((c.time / 1000) as any);
      if (x === null || x < 0 || x > w) continue;
      visibleCandles.push({ x, volume: c.volume, isUp: c.close >= c.open });
    } catch {
      continue;
    }
  }

  if (visibleCandles.length < 2) return;

  // Compute max volume among visible candles
  let maxVol = 0;
  for (const vc of visibleCandles) {
    if (vc.volume > maxVol) maxVol = vc.volume;
  }
  if (maxVol === 0) maxVol = 1;

  // Compute average candle width for bar thickness
  let totalGap = 0;
  let gapCount = 0;
  for (let i = 1; i < visibleCandles.length; i++) {
    const gap = visibleCandles[i].x - visibleCandles[i - 1].x;
    if (gap > 0 && gap < w * 0.5) {
      totalGap += gap;
      gapCount++;
    }
  }
  const avgCandleWidth = gapCount > 0 ? totalGap / gapCount : 6;
  const barWidth = Math.max(2, Math.min(avgCandleWidth * 0.7, 12));

  // Volume bars area: bottom 20% of the chart, capped at 40px
  const maxBarHeight = Math.min(40, h * 0.2);
  const volBottom = h - 2; // 2px padding from bottom

  // Draw a subtle background strip for the volume area
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
  ctx.fillRect(0, volBottom - maxBarHeight, w, maxBarHeight + 2);

  // Draw each volume bar
  for (const vc of visibleCandles) {
    const barH = Math.max(1, (vc.volume / maxVol) * maxBarHeight);
    const y = volBottom - barH;

    ctx.fillStyle = vc.isUp
      ? "rgba(34, 197, 94, 0.4)"
      : "rgba(239, 68, 68, 0.4)";

    ctx.fillRect(vc.x - barWidth / 2, y, barWidth, barH);
  }

  // Draw a thin baseline
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, volBottom);
  ctx.lineTo(w, volBottom);
  ctx.stroke();

  // Label: max vol value on the left
  ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
  ctx.font = "7px 'JetBrains Mono', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(`Vol ${maxVol.toFixed(0)}`, 3, volBottom);
}
