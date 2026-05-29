import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, Clock, Flame, ChevronDown, Trash2, X } from "lucide-react";
import { useInstrumentStore } from "../stores/useInstrumentStore";
import { useWatchlistStore } from "../stores/useWatchlistStore";

const RECENT_KEY = "aegis_recent_pairs";
const USAGE_KEY = "aegis_pair_usage";
const MAX_RECENT = 6;

function loadRecent(): string[] {
  try { const s = localStorage.getItem(RECENT_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveRecent(pairs: string[]) { localStorage.setItem(RECENT_KEY, JSON.stringify(pairs)); }
function loadUsage(): Record<string, number> {
  try { const s = localStorage.getItem(USAGE_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
}
function saveUsage(usage: Record<string, number>) { localStorage.setItem(USAGE_KEY, JSON.stringify(usage)); }

interface Props { symbol: string; onChange: (symbol: string) => void; }
interface Instrument { symbol: string; display_name: string; market_type: string; source: string; tick_size: number; precision: number; timezone: string; }

const MARKET_LABELS: Record<string, string> = { crypto: "Crypto", forex: "Forex", metal: "Metals" };
const MARKET_ORDER: Record<string, number> = { crypto: 0, metal: 1, forex: 2 };

export function PairSelector({ symbol, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allInstruments = useInstrumentStore((s) => s.instruments);
  const fetchInstruments = useInstrumentStore((s) => s.fetch);
  const watchlistGroups = useWatchlistStore((s) => s.groups);

  useEffect(() => { if (allInstruments.length === 0) fetchInstruments(); }, [allInstruments.length, fetchInstruments]);

  const [recentPairs, setRecentPairs] = useState<string[]>(() => loadRecent());
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>(() => loadUsage());
  useEffect(() => { saveRecent(recentPairs); }, [recentPairs]);
  useEffect(() => { saveUsage(usageCounts); }, [usageCounts]);

  const favoriteSymbols = new Set(watchlistGroups.flatMap((g) => g.symbols));

  const grouped = (() => {
    const q = query.toUpperCase();
    const excludeRecent = !q && recentPairs.length > 0 ? new Set(recentPairs) : null;
    const filtered = q ? allInstruments.filter((i) => i.symbol.includes(q) || i.display_name.toUpperCase().includes(q)) : allInstruments;
    const groups: Record<string, Instrument[]> = {};
    for (const inst of filtered) {
      if (excludeRecent && excludeRecent.has(inst.symbol)) continue;
      const market = inst.market_type;
      if (!groups[market]) groups[market] = [];
      groups[market].push(inst);
    }
    const sorted = Object.entries(groups).sort(([a], [b]) => (MARKET_ORDER[a] ?? 99) - (MARKET_ORDER[b] ?? 99));
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        const aFav = favoriteSymbols.has(a.symbol) ? 0 : 1;
        const bFav = favoriteSymbols.has(b.symbol) ? 0 : 1;
        if (aFav !== bFav) return aFav - bFav;
        return a.symbol.localeCompare(b.symbol);
      });
    }
    return sorted;
  })();

  const marketFlat = grouped.flatMap(([, items]) => items);
  const flatItems = (!query && recentPairs.length > 0)
    ? [...recentPairs.map((sym) => allInstruments.find((i) => i.symbol === sym)).filter((i): i is Instrument => i !== undefined), ...marketFlat]
    : marketFlat;

  useEffect(() => { setHighlightedIdx(0); }, [query]);

  const handleOpen = useCallback(() => { setOpen(true); setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const handleSelect = useCallback((sym: string) => {
    onChange(sym); setOpen(false); setQuery("");
    setRecentPairs((prev) => [sym, ...prev.filter((s) => s !== sym)].slice(0, MAX_RECENT));
    setUsageCounts((prev) => ({ ...prev, [sym]: (prev[sym] ?? 0) + 1 }));
  }, [onChange]);

  const clearRecent = useCallback((e: React.MouseEvent) => { e.stopPropagation(); setRecentPairs([]); }, []);
  const clearUsage = useCallback((e: React.MouseEvent) => { e.stopPropagation(); setUsageCounts({}); }, []);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; symbol: string } | null>(null);
  const removeFromRecent = useCallback((sym: string) => {
    setRecentPairs((prev) => prev.filter((s) => s !== sym));
    setUsageCounts((prev) => { const n = { ...prev }; delete n[sym]; return n; });
    setContextMenu(null);
  }, []);

  const mostUsed = useMemo(() => {
    const entries = Object.entries(usageCounts).filter(([, c]) => c > 1);
    entries.sort(([, a], [, b]) => b - a);
    return entries.slice(0, 5);
  }, [usageCounts]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) { if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); handleOpen(); } return; }
    if (flatItems.length === 0) return;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setHighlightedIdx((p) => Math.min(p + 1, flatItems.length - 1)); break;
      case "ArrowUp": e.preventDefault(); setHighlightedIdx((p) => Math.max(p - 1, 0)); break;
      case "Enter": e.preventDefault(); if (flatItems[highlightedIdx]) handleSelect(flatItems[highlightedIdx].symbol); break;
      case "Escape": e.preventDefault(); setOpen(false); setQuery(""); setContextMenu(null); break;
    }
  }, [open, flatItems, highlightedIdx, handleSelect, handleOpen]);

  useEffect(() => {
    if (!listRef.current || !open) return;
    const items = listRef.current.querySelectorAll("[data-idx]");
    (items[highlightedIdx] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx, open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setQuery(""); setContextMenu(null); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault(); setQuery(""); setOpen(true); setContextMenu(null);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const currentInst = allInstruments.find((i) => i.symbol === symbol);

  return (
    <div ref={containerRef} className="relative shrink-0" onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        className={`flex items-center gap-1.5 h-7 px-2 rounded text-[11px] font-mono transition-all border ${
          open ? "bg-surface-input border-accent-blue/40 shadow-glow" : "bg-surface-input border-surface-border hover:border-accent-blue/30 hover:bg-surface-hover"
        }`}
        onClick={handleOpen}
        title="Select trading pair"
      >
        <span className="text-text-muted text-[10px]">{currentInst?.market_type === "forex" ? "$" : currentInst?.market_type === "metal" ? "\u25C6" : "\u20BF"}</span>
        <span className="text-text-primary font-semibold tracking-wide">{symbol || "SYM"}</span>
        <ChevronDown size={10} className={`text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-[280px] lg:w-[320px] max-h-[70vh] bg-surface-card border border-surface-border rounded-lg shadow-lg backdrop-blur-xl z-50 flex flex-col overflow-hidden animate-fade-in">
          {/* Search */}
          <div className="p-2 border-b border-surface-border shrink-0">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                ref={inputRef}
                className="w-full bg-surface-input border border-surface-border rounded pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-blue/50 transition-all"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pairs..."
              />
            </div>
          </div>

          {/* Results */}
          <div ref={listRef} className="flex-1 overflow-y-auto py-1 scrollbar-none">
            {/* Most Used */}
            {!query && mostUsed.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-3 py-1.5 text-[9px] uppercase tracking-widest text-text-muted font-semibold">
                  <div className="flex items-center gap-1.5"><Flame size={10} /><span>Most Used</span></div>
                  <button className="text-text-muted hover:text-text-secondary transition-colors text-[8px] uppercase" onClick={clearUsage}>Reset</button>
                </div>
                {mostUsed.map(([sym, count]) => {
                  const flatIdx = flatItems.findIndex((i) => i.symbol === sym);
                  const isHighlighted = flatIdx >= 0 && flatIdx === highlightedIdx;
                  const isActive = sym === symbol;
                  const inst = allInstruments.find((i) => i.symbol === sym);
                  return (
                    <button key={sym} data-idx={flatIdx}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-all border-l-2 ${
                        isHighlighted ? "bg-accent-blue/8 border-accent-blue/60 text-text-primary" :
                        isActive ? "bg-accent-blue/5 border-accent-blue/30 text-text-primary" :
                        "border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      }`}
                      onClick={() => handleSelect(sym)}
                      onMouseEnter={() => setHighlightedIdx(flatIdx)}
                      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, symbol: sym }); }}
                    >
                      <span className="text-[9px] w-3 text-center shrink-0 text-accent-purple/60 font-mono tabular-nums">{count}</span>
                      <span className="font-mono font-medium flex-1 text-left">{sym}</span>
                      <div className="h-1.5 w-12 rounded-full bg-surface-border overflow-hidden shrink-0">
                        <div className="h-full rounded-full bg-accent-purple/30" style={{ width: `${Math.min(100, (count / mostUsed[0][1]) * 100)}%` }} />
                      </div>
                      {inst && <span className={`text-[8px] px-1 py-0.5 rounded font-mono ${inst.source === "binance" ? "bg-accent-yellow/10 text-accent-yellow" : "bg-accent-blue/10 text-accent-blue"}`}>{inst.source}</span>}
                    </button>
                  );
                })}
                <div className="mx-3 my-1 border-t border-surface-border" />
              </div>
            )}

            {/* Recently Used */}
            {recentPairs.length > 0 && !query && (
              <div>
                <div className="flex items-center justify-between px-3 py-1.5 text-[9px] uppercase tracking-widest text-text-muted font-semibold">
                  <div className="flex items-center gap-1.5"><Clock size={10} /><span>Recent</span></div>
                  <button className="text-text-muted hover:text-text-secondary transition-colors text-[8px] uppercase" onClick={clearRecent}>Clear</button>
                </div>
                {recentPairs.filter((sym) => !mostUsed.some(([s]) => s === sym)).map((sym) => {
                  const inst = allInstruments.find((i) => i.symbol === sym);
                  const flatIdx = flatItems.findIndex((i) => i.symbol === sym);
                  const isHighlighted = flatIdx >= 0 && flatIdx === highlightedIdx;
                  const isActive = sym === symbol;
                  const count = usageCounts[sym] ?? 0;
                  return (
                    <button key={sym} data-idx={flatIdx}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-all border-l-2 ${
                        isHighlighted ? "bg-accent-blue/8 border-accent-blue/60 text-text-primary" :
                        isActive ? "bg-accent-blue/5 border-accent-blue/30 text-text-primary" :
                        "border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      }`}
                      onClick={() => handleSelect(sym)}
                      onMouseEnter={() => setHighlightedIdx(flatIdx)}
                      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, symbol: sym }); }}
                    >
                      <Clock size={9} className="shrink-0 text-text-muted" />
                      <span className="font-mono font-medium flex-1 text-left">{sym}</span>
                      {count > 0 && <span className="text-[8px] text-text-muted font-mono tabular-nums">{count}x</span>}
                      {inst && <span className={`text-[8px] px-1 py-0.5 rounded font-mono ${inst.source === "binance" ? "bg-accent-yellow/10 text-accent-yellow" : "bg-accent-blue/10 text-accent-blue"}`}>{inst.source}</span>}
                    </button>
                  );
                })}
                <div className="mx-3 my-1 border-t border-surface-border" />
              </div>
            )}

            {/* Market groups */}
            {grouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-text-muted">
                <Search size={20} className="mb-2 opacity-30" />
                <span className="text-xs">No matches found</span>
              </div>
            ) : (
              grouped.map(([market, items]) => (
                <div key={market}>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] uppercase tracking-widest text-text-muted font-semibold">
                    <span>{MARKET_LABELS[market] ?? market}</span>
                    <span className="text-text-muted font-normal">({items.length})</span>
                  </div>
                  {items.map((inst) => {
                    const flatIdx = flatItems.indexOf(inst);
                    const isHighlighted = flatIdx === highlightedIdx;
                    const isFav = favoriteSymbols.has(inst.symbol);
                    const isActive = inst.symbol === symbol;
                    return (
                      <button key={inst.symbol} data-idx={flatIdx}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-all border-l-2 ${
                          isHighlighted ? "bg-accent-blue/8 border-accent-blue/60 text-text-primary" :
                          isActive ? "bg-accent-blue/5 border-accent-blue/30 text-text-primary" :
                          "border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                        }`}
                        onClick={() => handleSelect(inst.symbol)}
                        onMouseEnter={() => setHighlightedIdx(flatIdx)}
                      >
                        <Star size={9} className={`shrink-0 ${isFav ? "text-accent-yellow fill-accent-yellow" : "text-transparent"}`} />
                        <span className="font-mono font-medium flex-1 text-left">{inst.symbol}</span>
                        <span className="text-[9px] text-text-muted truncate max-w-[80px] hidden lg:block">{inst.display_name}</span>
                        <span className={`text-[8px] px-1 py-0.5 rounded font-mono ${inst.source === "binance" ? "bg-accent-yellow/10 text-accent-yellow" : "bg-accent-blue/10 text-accent-blue"}`}>{inst.source}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 border-t border-surface-border flex items-center justify-between text-[8px] text-text-muted shrink-0">
            <span>↑↓ Navigate</span><span>↵ Select</span><span>Esc Close</span>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setContextMenu(null)} />
          <div className="fixed z-[101] bg-surface-card border border-surface-border rounded-lg shadow-lg py-1 min-w-[150px] animate-scale-in" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-accent-red/70 hover:text-accent-red hover:bg-accent-red/5 transition-colors"
              onClick={() => removeFromRecent(contextMenu.symbol)}
            >
              <Trash2 size={11} /> Remove from recent
            </button>
          </div>
        </>
      )}
    </div>
  );
}
