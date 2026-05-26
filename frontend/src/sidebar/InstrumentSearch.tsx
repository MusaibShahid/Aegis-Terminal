import { useEffect, useRef, useState } from "react";
import { useInstrumentStore } from "../stores/useInstrumentStore";

interface Props {
  onSelect: (symbol: string) => void;
}

const MARKET_COLORS: Record<string, string> = {
  crypto: "text-accent-yellow",
  metal: "text-accent-blue",
  forex: "text-accent-green",
};

export function InstrumentSearch({ onSelect }: Props) {
  const instruments = useInstrumentStore((s) => s.instruments);
  const marketTypes = useInstrumentStore((s) => s.marketTypes);
  const fetch = useInstrumentStore((s) => s.fetch);
  const searchApi = useInstrumentStore((s) => s.search);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<typeof instruments>([]);
  const [activeMarket, setActiveMarket] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("aegis_favorites") || "[]"); } catch { return []; }
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (query.length >= 1) {
      searchApi(query).then(setResults);
    } else {
      setResults([]);
    }
  }, [query, searchApi]);

  const toggleFavorite = (symbol: string) => {
    const next = favorites.includes(symbol)
      ? favorites.filter((s) => s !== symbol)
      : [...favorites, symbol];
    setFavorites(next);
    localStorage.setItem("aegis_favorites", JSON.stringify(next));
  };

  const filtered = activeMarket
    ? instruments.filter((i) => i.market_type === activeMarket)
    : query.length >= 1 ? results : [];

  const displayed = query.length >= 1
    ? results
    : activeMarket
      ? instruments.filter((i) => i.market_type === activeMarket)
      : instruments;

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="p-2 border-b border-surface-border space-y-1 shrink-0">
        <input
          ref={inputRef}
          className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-white outline-none focus:border-accent-blue"
          placeholder="Search instruments..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-1 flex-wrap">
          <button
            className={`text-[10px] px-1.5 py-0.5 rounded ${!activeMarket ? "bg-accent-blue text-white" : "bg-surface-alt text-gray-400 hover:text-white"}`}
            onClick={() => setActiveMarket(null)}
          >
            All
          </button>
          {marketTypes.map((m) => (
            <button
              key={m}
              className={`text-[10px] px-1.5 py-0.5 rounded ${activeMarket === m ? "bg-accent-blue text-white" : "bg-surface-alt text-gray-400 hover:text-white"}`}
              onClick={() => setActiveMarket(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {favorites.length > 0 && !query && !activeMarket && (
        <div className="border-b border-surface-border/50">
          <div className="px-2 py-1 text-gray-500 text-[10px] uppercase">Favorites</div>
          {favorites.map((sym) => {
            const inst = instruments.find((i) => i.symbol === sym);
            return (
              <div
                key={sym}
                className="flex items-center justify-between px-2 py-1 hover:bg-surface-alt cursor-pointer"
                onClick={() => onSelect(sym)}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`${MARKET_COLORS[inst?.market_type || ""] || "text-gray-300"}`}>
                    {sym}
                  </span>
                  <span className="text-gray-500">{inst?.display_name}</span>
                </div>
                <button
                  className="text-accent-yellow text-xs"
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(sym); }}
                >
                  ★
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {displayed.map((inst) => (
          <div
            key={inst.symbol}
            className="flex items-center justify-between px-2 py-1.5 hover:bg-surface-alt cursor-pointer border-b border-surface-border/20"
            onClick={() => onSelect(inst.symbol)}
          >
            <div className="flex items-center gap-2">
              <span className={`font-medium ${MARKET_COLORS[inst.market_type] || "text-gray-300"}`}>
                {inst.symbol}
              </span>
              <span className="text-gray-500">{inst.display_name}</span>
              <span className="text-[8px] uppercase text-gray-600 bg-surface-alt px-1 rounded">{inst.market_type}</span>
            </div>
            <button
              className={`text-xs ${favorites.includes(inst.symbol) ? "text-accent-yellow" : "text-gray-600 hover:text-gray-400"}`}
              onClick={(e) => { e.stopPropagation(); toggleFavorite(inst.symbol); }}
            >
              {favorites.includes(inst.symbol) ? "★" : "☆"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
