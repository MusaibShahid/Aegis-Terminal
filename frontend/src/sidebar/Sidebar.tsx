import { useState } from "react";
import { FeatureGuard } from "../components/FeatureGuard";
import { AITradeAssistant } from "../ai/AITradeAssistant";
import { InstrumentSearch } from "./InstrumentSearch";
import { AlertPanel } from "./AlertPanel";
import { BacktestPanel } from "./BacktestPanel";
import { BotPanel } from "./BotPanel";
import { PositionPanel } from "./PositionPanel";
import { ReplayPanel } from "./ReplayPanel";
import { TemplatePanel } from "./TemplatePanel";
import { WatchlistSidebar } from "./WatchlistSidebar";
import { JournalPanel } from "./JournalPanel";
import { useConnectionStore } from "../stores/useConnectionStore";

type Tab = "watchlists" | "instruments" | "alerts" | "backtest" | "bots" | "positions" | "replay" | "templates" | "ai" | "journal";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "watchlists", label: "Watchlist", icon: "◉" },
  { id: "instruments", label: "Browse", icon: "🔍" },
  { id: "alerts", label: "Alerts", icon: "⚡" },
  { id: "backtest", label: "Backtest", icon: "📈" },
  { id: "bots", label: "Bots", icon: "⚙" },
  { id: "positions", label: "Positions", icon: "📊" },
  { id: "journal", label: "Journal", icon: "📓" },
  { id: "replay", label: "Replay", icon: "▶" },
  { id: "templates", label: "Templates", icon: "⊞" },
  { id: "ai", label: "AI", icon: "🤖" },
];

interface Props {
  onSelectSymbol: (symbol: string) => void;
}

export function Sidebar({ onSelectSymbol }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("watchlists");
  const [collapsed, setCollapsed] = useState(false);

  const renderPanel = () => {
    switch (activeTab) {
      case "watchlists":
        return <WatchlistSidebar onSelectSymbol={onSelectSymbol} />;
      case "instruments":
        return <InstrumentSearch onSelect={onSelectSymbol} />;
      case "alerts":
        return <AlertPanel />;
      case "backtest":
        return <BacktestPanel />;
      case "bots":
        return <FeatureGuard feature="strategy_engine" fallback={<div className="text-gray-500 p-2 text-xs text-center">Bot engine unavailable</div>}>
          <BotPanel />
        </FeatureGuard>;
      case "positions":
        return <PositionPanel />;
      case "journal":
        return <JournalPanel />;
      case "replay":
        return <ReplayPanel />;
      case "templates":
        return <TemplatePanel />;
      case "ai":
        return <AITradeAssistant />;
    }
  };

  return (
    <div className="flex h-full">
      {/* Tab bar */}
      <div className="w-8 bg-surface-alt border-r border-surface-border flex flex-col items-center py-1 gap-2 shrink-0 overflow-y-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`w-6 h-6 flex items-center justify-center text-xs rounded transition-colors shrink-0 ${
              activeTab === t.id
                ? "bg-accent-blue text-white"
                : "text-gray-500 hover:text-white hover:bg-surface"
            }`}
            onClick={() => {
              if (activeTab === t.id) setCollapsed(!collapsed);
              else { setActiveTab(t.id); setCollapsed(false); }
            }}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      {/* Panel */}
      {!collapsed && (
        <div className="w-56 border-r border-surface-border bg-surface flex flex-col overflow-hidden">
          <div className="h-7 flex items-center px-2 text-xs text-gray-400 border-b border-surface-border shrink-0 uppercase tracking-wider justify-between">
            <span>{TABS.find((t) => t.id === activeTab)?.label}</span>
            <WsIndicator />
          </div>
          <div className="flex-1 overflow-hidden">{renderPanel()}</div>
        </div>
      )}
    </div>
  );
}

function WsIndicator() {
  const status = useConnectionStore((s) => s.status);
  const colors: Record<string, string> = {
    connected: "bg-accent-green",
    connecting: "bg-accent-yellow",
    disconnected: "bg-gray-500",
  };
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[status] || "bg-gray-500"}`} title={`WS: ${status}`} />
  );
}
