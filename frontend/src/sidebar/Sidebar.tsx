import { useEffect, useState } from "react";
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
import { PaperTradingPanel } from "./PaperTradingPanel";
import { useConnectionStore } from "../stores/useConnectionStore";
import { useResponsive } from "../hooks/useResponsive";

type Tab = "watchlists" | "instruments" | "alerts" | "backtest" | "bots" | "positions" | "paper" | "journal" | "replay" | "templates" | "ai";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "watchlists", label: "Watchlist", icon: "◉" },
  { id: "instruments", label: "Browse", icon: "🔍" },
  { id: "alerts", label: "Alerts", icon: "⚡" },
  { id: "backtest", label: "Backtest", icon: "📈" },
  { id: "bots", label: "Bots", icon: "⚙" },
  { id: "positions", label: "Positions", icon: "📊" },
  { id: "paper", label: "Paper", icon: "💰" },
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
  const responsive = useResponsive();

  // Auto-collapse sidebar on smaller screens
  useEffect(() => {
    if (responsive.isMobile) {
      setCollapsed(true);
    }
  }, [responsive.isMobile]);

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
        return <FeatureGuard feature="bot" fallback={<div className="text-gray-500 p-2 text-xs text-center">Bot engine unavailable</div>}>
          <BotPanel />
        </FeatureGuard>;
      case "positions":
        return <PositionPanel />;
      case "paper":
        return <PaperTradingPanel />;
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

  const panelWidth = collapsed ? 0 : responsive.isTablet ? "w-52" : "w-60";

  return (
    <div className="flex h-full">
      {/* Tab bar — vertical nav */}
      <div className="w-9 lg:w-10 bg-surface-alt/60 backdrop-blur-sm border-r border-surface-border flex flex-col items-center py-2 gap-0.5 lg:gap-1.5 shrink-0 overflow-y-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`w-6 lg:w-7 h-6 lg:h-7 flex items-center justify-center text-[10px] lg:text-xs rounded-lg transition-all duration-150 shrink-0 relative ${
              activeTab === t.id
                ? "bg-accent-blue/15 text-accent-blue shadow-glow"
                : "text-gray-600 hover:text-white hover:bg-glass-white-hover"
            }`}
            onClick={() => {
              if (activeTab === t.id) setCollapsed(!collapsed);
              else { setActiveTab(t.id); setCollapsed(false); }
            }}
            title={t.label}
          >
            {/* Active indicator dot */}
            {activeTab === t.id && (
              <span className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-0.5 lg:w-1 h-2 lg:h-3 rounded-full bg-accent-blue" />
            )}
            {t.icon}
          </button>
        ))}
      </div>

      {/* Panel — animated width transition */}
      <div
        className={`${panelWidth} border-r border-surface-border bg-surface/50 backdrop-blur-sm flex flex-col overflow-hidden transition-all duration-200 ease-in-out`}
        style={{ maxWidth: collapsed ? 0 : responsive.isTablet ? 208 : 240 }}
      >
        {!collapsed && (
          <>
            {/* Panel header */}
            <div className="h-7 flex items-center px-2 lg:px-3 text-[9px] lg:text-[10px] text-gray-500 border-b border-surface-border/50 shrink-0 uppercase tracking-wider font-semibold justify-between">
              <span className="truncate">{TABS.find((t) => t.id === activeTab)?.label}</span>
              <WsIndicator />
            </div>
            {/* Panel content */}
            <div className="flex-1 overflow-hidden">
              {renderPanel()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function WsIndicator() {
  const status = useConnectionStore((s) => s.status);
  const colors: Record<string, string> = {
    connected: "bg-accent-green shadow-[0_0_4px_rgba(0,217,124,0.5)]",
    connecting: "bg-accent-yellow shadow-[0_0_4px_rgba(255,197,61,0.5)]",
    disconnected: "bg-gray-600",
  };
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[status] || "bg-gray-600"} transition-all duration-300`} title={`WS: ${status}`} />
  );
}
