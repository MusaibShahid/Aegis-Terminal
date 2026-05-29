import { useState, useCallback, useRef, useEffect } from "react";
import type { PineScriptIndicator, Candle } from "../types";
import { useLayoutStore } from "../stores/useLayoutStore";

interface Props {
  paneId: string;
  candles: Candle[];
}

const SAMPLE_SCRIPTS = [
  {
    name: "Simple SMA Crossover",
    code: `// Calculate SMA of close prices
function main(candles, params) {
  const period = params.period || 14;
  const closes = candles.map(c => c.close);
  const result = [];
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    result.push(sum / period);
  }
  
  return { values: result, overlay: true };
}`,
  },
  {
    name: "Momentum Oscillator",
    code: `// Momentum = close - close[n]
function main(candles, params) {
  const period = params.period || 10;
  const closes = candles.map(c => c.close);
  const result = [];
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push(0);
      continue;
    }
    result.push(closes[i] - closes[i - period]);
  }
  
  return { values: result, overlay: false };
}`,
  },
  {
    name: "Custom RSI",
    code: `// Custom RSI calculation
function main(candles, params) {
  const period = params.period || 14;
  const closes = candles.map(c => c.close);
  const result = [];
  let avgGain = 0, avgLoss = 0;
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      if (i > 0) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) avgGain += diff;
        else avgLoss += Math.abs(diff);
      }
      result.push(50);
      continue;
    }
    
    if (i === period) { avgGain /= period; avgLoss /= period; }
    else {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    }
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  
  return { values: result, overlay: false, levels: [70, 30] };
}`,
  },
];

// Sandboxed evaluation of user script
function evalScript(code: string, candles: Candle[], params: Record<string, number>): { values: (number | null)[]; overlay: boolean; levels?: number[] } {
  try {
    const fn = new Function("candles", "params", code + "\nreturn main(candles, params);");
    const result = fn(candles, params);
    if (result && Array.isArray(result.values)) {
      return {
        values: result.values.map((v: any) => (typeof v === "number" ? v : null)),
        overlay: !!result.overlay,
        levels: result.levels,
      };
    }
  } catch (e) {
    console.warn("PineScript eval error:", e);
  }
  return { values: [], overlay: false };
}

export function PineScriptPanel({ paneId, candles }: Props) {
  const addPineScript = useLayoutStore((s) => s.addPineScript);
  const removePineScript = useLayoutStore((s) => s.removePineScript);
  const updatePineScript = useLayoutStore((s) => s.updatePineScript);

  const workspace = useLayoutStore.getState().getActiveWorkspace();
  const pane = workspace?.panes.find((p) => p.id === paneId);
  const scripts = pane?.pineScripts ?? [];

  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState(SAMPLE_SCRIPTS[0].code);
  const [paramsText, setParamsText] = useState("{}");
  const [previewResult, setPreviewResult] = useState<{ values: (number | null)[]; overlay: boolean; levels?: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handlePreview = useCallback(() => {
    setError(null);
    try {
      const params = JSON.parse(paramsText || "{}");
      const result = evalScript(code, candles, params);
      setPreviewResult(result);
      if (result.values.length === 0) {
        setError("Script returned no values. Check your code.");
      }
    } catch (e) {
      setError(`Invalid params JSON: ${e}`);
    }
  }, [code, paramsText, candles]);

  const handleSave = useCallback(() => {
    if (!name.trim() || !code.trim()) return;
    const params = (() => { try { return JSON.parse(paramsText || "{}"); } catch { return {}; } })();
    const id = editingId || `pine-${Date.now()}`;

    const script: PineScriptIndicator = {
      id,
      name: name.trim(),
      code: code.trim(),
      paneId,
      color: "#a855f7",
    };

    if (editingId) {
      updatePineScript(id, script);
    } else {
      addPineScript(script);
    }

    setShowEditor(false);
    setEditingId(null);
  }, [name, code, paramsText, editingId, paneId, addPineScript, updatePineScript]);

  const handleEdit = useCallback((script: PineScriptIndicator) => {
    setEditingId(script.id);
    setName(script.name);
    setCode(script.code);
    setShowEditor(true);
  }, []);

  const handleNew = useCallback(() => {
    setEditingId(null);
    setName("Custom Script");
    setCode(SAMPLE_SCRIPTS[0].code);
    setParamsText("{}");
    setPreviewResult(null);
    setError(null);
    setShowEditor(true);
  }, []);

  // Tab key inserts spaces in textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.value = ta.value.substring(0, start) + "  " + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + 2;
        setCode(ta.value);
      }
    };
    ta.addEventListener("keydown", handler);
    return () => ta.removeEventListener("keydown", handler);
  }, [showEditor]);

  return (
    <div className="flex flex-col">
      {/* Script list */}
      {scripts.length > 0 && (
        <div className="flex items-center gap-1 px-1.5 py-1 bg-surface-alt/30 border-b border-surface-border/20 overflow-x-auto scrollbar-none shrink-0">
          {scripts.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 text-[9px] bg-purple-500/10 text-purple-400/80 border border-purple-500/15 px-1.5 py-0.5 rounded cursor-pointer hover:bg-purple-500/15 group"
              onClick={() => handleEdit(s)}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <span className="truncate max-w-[60px]">{s.name}</span>
              <button
                className="ml-0.5 text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); removePineScript(s.id); }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add button */}
      <div className="px-1.5 py-1">
        <button
          className="text-[9px] text-text-tertiary hover:text-text-primary hover:bg-surface-hover px-2 py-1 rounded transition-all flex items-center gap-1"
          onClick={handleNew}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          New Pine Script
        </button>
      </div>

      {/* Editor modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowEditor(false)}>
          <div
            className="bg-surface border border-surface-border rounded-xl shadow-2xl w-[520px] max-w-[95vw] max-h-[85vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border/50 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gradient">Pine Script Editor</span>
                <span className="text-[8px] text-text-muted font-mono bg-surface-alt px-1.5 py-0.5 rounded">BETA</span>
              </div>
              <button className="text-text-tertiary hover:text-text-primary text-sm" onClick={() => setShowEditor(false)}>✕</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {/* Name input */}
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 bg-surface-alt border border-surface-border rounded px-2 py-1.5 text-[11px] text-text-primary outline-none focus:border-accent-blue/50"
                  placeholder="Script name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Script selector */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[9px] text-text-muted mr-1">Templates:</span>
                {SAMPLE_SCRIPTS.map((s) => (
                  <button
                    key={s.name}
                    className="text-[9px] text-text-tertiary hover:text-text-primary hover:bg-surface-hover px-1.5 py-0.5 rounded border border-surface-border/30 transition-all"
                    onClick={() => { setCode(s.code); setName(s.name); }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {/* Code editor */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  className="w-full h-48 bg-surface-input border border-surface-border rounded-lg px-3 py-2.5 text-[10px] font-mono text-text-primary outline-none focus:border-accent-blue/40 resize-vertical leading-relaxed"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  spellCheck={false}
                  placeholder={`function main(candles, params) {\n  // Your custom indicator logic here\n  // Return { values: [...], overlay: true/false }\n  return { values: [], overlay: false };\n}`}
                />
                <div className="absolute bottom-1.5 right-2 text-[8px] text-text-muted font-mono">
                  {code.split("\n").length} lines
                </div>
              </div>

              {/* Params input */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-text-muted font-mono w-12">Params:</span>
                <input
                  className="flex-1 bg-surface-alt border border-surface-border rounded px-2 py-1 text-[10px] font-mono text-text-primary outline-none focus:border-accent-blue/40"
                  value={paramsText}
                  onChange={(e) => setParamsText(e.target.value)}
                  placeholder='{"period": 14}'
                />
                <button
                  className="text-[9px] text-text-tertiary hover:text-text-primary bg-surface-hover hover:bg-surface-hover px-2 py-1 rounded transition-all"
                  onClick={handlePreview}
                >
                  Preview
                </button>
              </div>

              {/* Preview result */}
              {previewResult && (
                <div className="bg-surface-alt/50 rounded-lg p-2 border border-surface-border/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-text-muted font-mono">Preview</span>
                    <span className="text-[8px] text-text-muted">
                      {previewResult.values.filter((v) => v !== null).length} values
                      {previewResult.overlay ? " • overlay" : " • sub-panel"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-mono">
                    <span className="text-text-tertiary">Min:</span>
                    <span className="text-text-secondary">
                      {Math.min(...previewResult.values.filter((v): v is number => v !== null)).toFixed(2) || "N/A"}
                    </span>
                    <span className="text-text-tertiary">Max:</span>
                    <span className="text-text-secondary">
                      {Math.max(...previewResult.values.filter((v): v is number => v !== null)).toFixed(2) || "N/A"}
                    </span>
                  </div>
                </div>
              )}

              {error && (
                <div className="text-[9px] text-accent-red bg-accent-red/5 rounded px-2 py-1">{error}</div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-surface-border/50 shrink-0">
              <span className="text-[8px] text-text-muted">Scripts are sandboxed and run locally</span>
              <div className="flex items-center gap-2">
                <button
                  className="text-[10px] text-text-tertiary hover:text-text-primary px-3 py-1.5 rounded hover:bg-surface-hover transition-all"
                  onClick={() => setShowEditor(false)}
                >
                  Cancel
                </button>
                <button
                  className="text-[10px] bg-accent-blue/15 text-accent-blue border border-accent-blue/25 hover:bg-accent-blue/25 px-3 py-1.5 rounded transition-all"
                  onClick={handleSave}
                >
                  {editingId ? "Update Script" : "Add to Chart"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compute Pine Script indicator values for chart rendering
export function computePineScriptValues(
  scripts: PineScriptIndicator[],
  candles: Candle[]
): { id: string; name: string; values: (number | null)[]; overlay: boolean; levels?: number[]; color: string }[] {
  return scripts.map((s) => {
    const params = s.params as Record<string, number> || {};
    const result = evalScript(s.code, candles, params);
    return {
      id: s.id,
      name: s.name,
      values: result.values,
      overlay: result.overlay,
      levels: result.levels,
      color: s.color || "#a855f7",
    };
  });
}
