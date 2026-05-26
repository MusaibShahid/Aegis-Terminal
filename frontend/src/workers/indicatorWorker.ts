// Web Worker for heavy indicator/footprint computation
// Messages: { type: "computeIndicators" | "computeFootprint", data: any }
// Responses: { type: "result", id: string, result: any }

interface WorkerMessage {
  type: "computeIndicators" | "computeFootprint";
  id: string;
  data: any;
}

function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push(sum / period);
  }
  return result;
}

function ema(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      result.push(sum / period);
    } else {
      const prev = result[i - 1]!;
      result.push((values[i] - prev) * k + prev);
    }
  }
  return result;
}

function calculateDelta(ticks: any[]): any {
  let buyVol = 0, sellVol = 0;
  for (const t of ticks) {
    if (t.side === "buy") buyVol += t.volume;
    else sellVol += t.volume;
  }
  return { buyVol, sellVol, delta: buyVol - sellVol };
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, id, data } = e.data;

  switch (type) {
    case "computeIndicators": {
      const { closes, periods } = data;
      const results: Record<string, (number | null)[]> = {};
      for (const [name, period] of Object.entries(periods) as [string, number][]) {
        if (name === "sma") results[name] = sma(closes, period);
        else if (name === "ema") results[name] = ema(closes, period);
      }
      self.postMessage({ type: "result", id, result: results });
      break;
    }
    case "computeFootprint": {
      const { ticks } = data;
      const result = calculateDelta(ticks);
      self.postMessage({ type: "result", id, result });
      break;
    }
  }
};
