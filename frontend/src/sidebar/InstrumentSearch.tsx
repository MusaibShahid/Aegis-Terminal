import { useState, useEffect, useMemo } from "react";

interface Instrument {
  symbol: string;
  display_name: string;
  market_type: string;
  source: string;
}

interface Props {
  onSelect: (symbol: string) => void;
}

export function InstrumentSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [allInstruments, setAllInstruments] = useState<Instrument[]>([]);

  useEffect(() => {
    fetch("/api/instruments")
      .then((r) => r.json())
      .then((data) => setAllInstruments(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const q = query.toUpperCase();
    setResults(
      allInstruments.filter(
        (i) =>
          i.symbol.includes(q) || i.display_name.toUpperCase().includes(q)
      )
    );
  }, [query, allInstruments]);

  const grouped = useMemo(() => {
    const map: Record<string, Instrument[]> = {};
    for (const inst of results) {
      if (!map[inst.market_type]) map[inst.market_type] = [];
      map[inst.market_type].push(inst);
    }
    return map;
  }, [results]);

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="p-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            className="w-full bg-surface-input border border-surface-border rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-blue/50 focus:shadow-glow transition-all duration-150"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search instruments..."
            autoFocus
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
        {Object.entries(grouped).map(([type, instruments]) => (
          <div key={type}>
            <div className="text-[9px] text-text-muted uppercase tracking-wider font-semibold mb-1 px-1">
              {type}
            </div>
            {instruments.map((inst) => (
              <button
                key={inst.symbol}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors text-left group"
                onClick={() => onSelect(inst.symbol)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-text-secondary">{inst.symbol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-text-muted">{inst.source}</span>
                  <span className="text-[9px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </div>
              </button>
            ))}
          </div>
        ))}
        {query && results.length === 0 && (
          <div className="text-center text-text-muted text-[10px] py-4">No instruments found</div>
        )}
      </div>
    </div>
  );
}
