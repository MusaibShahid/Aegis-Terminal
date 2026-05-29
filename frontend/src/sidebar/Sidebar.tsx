import { useEffect, useState } from "react";
import {
  Eye, Search, Zap, BarChart3, Bot, Radio, PieChart,
  Wallet, Activity, BookOpen, Play, Layout, Sparkles,
} from "lucide-react";
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
import { LiveTradingPanel } from "./LiveTradingPanel";
import { SignalLogPanel } from "./SignalLogPanel";
import { useConnectionStore } from "../stores/useConnectionStore";
import { useResponsive } from "../hooks/useResponsive";

type Tab = "watchlists" | "instruments" | "alerts" | "backtest" | "bots" | "signals" | "positions" | "paper" | "live" | "journal" | "replay" | "templates" | "ai";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "watchlists", label: "Watchlist", icon: <Eye size={14} /> },
  { id: "instruments", label: "Browse", icon: <Search size={14} /> },
  { id: "alerts", label: "Alerts", icon: <Zap size={14} /> },
  { id: "backtest", label: "Backtest", icon: <BarChart3 size={14} /> },
  { id: "bots", label: "Bots", icon: <Bot size={14} /> },
  { id: "signals", label: "Signals", icon: <Radio size={14} /> },
  { id: "positions", label: "Positions", icon: <PieChart size={14} /> },
  { id: "paper", label: "Paper", icon: <Wallet size={14} /> },
  { id: "live", label: "Live", icon: <Activity size={14} /> },
  { id: "journal", label: "Journal", icon: <BookOpen size={14} /> },
  { id: "replay", label: "Replay", icon: <Play size={14} /> },
  { id: "templates", label: "Templates", icon: <Layout size={14} /> },
  { id: "ai", label: "AI", icon: <Sparkles size={14} /> },
];

interface Props {
  onSelectSymbol: (symbol: string) => void;
}

export function Sidebar({ onSelectSymbol }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("watchlists");
  const [collapsed, setCollapsed] = useState(false);
  const responsive = useResponsive();

  useEffect(() => {
    if (responsive.isMobile) setCollapsed(true);
  }, [responsive.isMobile]);

  const renderPanel = () => {
    switch (activeTab) {
      case "watchlists": return <WatchlistSidebar onSelectSymbol={onSelectSymbol} />;
      case "instruments": return <InstrumentSearch onSelect={onSelectSymbol} />;
      case "alerts": return <AlertPanel />;
      case "backtest": return <BacktestPanel />;
      case "bots": return <FeatureGuard feature="bot" fallback={<div className="text-text-tertiary p-3 text-xs text-center">Bot engine unavailable</div>}><BotPanel /></FeatureGuard>;
      case "signals": return <SignalLogPanel />;
      case "positions": return <PositionPanel />;
      case "paper": return <PaperTradingPanel />;
      case "live": return <LiveTradingPanel />;
      case "journal": return <JournalPanel />;
      case "replay": return <ReplayPanel />;
      case "templates": return <TemplatePanel />;
      case "ai": return <AITradeAssistant />;
    }
  };

  // Calculate panel width: responsive and collapsible
  const panelWidthPx = collapsed ? 0 : responsive.isTablet ? 208 : 240;

  return (
    <div className="flex h-full shrink-0" style={{ width: 40 + panelWidthPx }}>
      {/* Icon nav bar */}
      <div className="w-10 bg-surface-alt border-r border-surface-border flex flex-col items-center py-2 gap-0.5 shrink-0 overflow-y-auto scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`w-8 h-8 flex items-center justify-center rounded transition-all duration-150 shrink-0 relative ${
              activeTab === t.id
                ? "bg-accent-blue/12 text-accent-blue shadow-glow"
                : "text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
            }`}
            onClick={() => {
              if (activeTab === t.id) setCollapsed(!collapsed);
              else { setActiveTab(t.id); setCollapsed(false); }
            }}
            title={t.label}
          >
            {activeTab === t.id && (
              <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-accent-blue" />
            )}
            {t.icon}
          </button>
        ))}
      </div>

      {/* Panel — uses width transition for smooth collapse */}
      <div
        className="border-r border-surface-border bg-surface flex flex-col overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{ width: panelWidthPx }}
      >
        {!collapsed && (
          <>
            <div className="h-8 flex items-center px-3 text-[10px] text-text-tertiary border-b border-surface-border shrink-0 uppercase tracking-wider font-semibold justify-between">
              <span className="truncate">{TABS.find((t) => t.id === activeTab)?.label}</span>
              <WsIndicator />
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain">
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
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full transition-all duration-300 ${
      isConnected ? "bg-accent-green shadow-glow-green" :
      isConnecting ? "bg-accent-yellow animate-pulse" :
      "bg-text-muted"
    }`} title={`WS: ${status}`} />
  );
}
