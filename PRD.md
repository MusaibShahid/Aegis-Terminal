# Aegis Terminal — Product Requirements Document (PRD)

**Version:** 1.1.0  
**Date:** 2026-05-29  
**Status:** Active Development  

---

## 1. Executive Summary

Aegis Terminal is a multi-asset trading terminal for crypto, forex, and precious metals. It provides real-time charting, paper trading, backtesting, automated trading bots, and live MT5 execution through a professional-grade web interface.

**Tech Stack:** Python 3.12 (FastAPI) backend, React 18 + TypeScript (Vite) frontend, SQLite storage, WebSocket real-time data.

---

## 2. Product Goals

| Goal | Description |
|------|-------------|
| Real-time Data | Sub-second candle/quote delivery from Binance + MT5 |
| Paper Trading | Full simulated trading with order book, slippage, fees |
| Backtesting | Historical strategy replay with performance metrics |
| Bot Trading | Automated strategies (EMA, RSI, MACD, Bollinger) |
| Live Execution | MT5 bridge for real forex/gold/silver trading |
| Advanced Analytics | Footprint, delta, VPVR, SMC, AI analysis |

---

## 3. File Structure

```
Aegis Terminal/
├── .github/
│   └── workflows/
│       └── ci.yml                          # CI: backend tests, frontend typecheck, Docker build
├── backend/
│   ├── main.py                             # FastAPI app, lifespan, broadcast loops
│   ├── config.py                           # Pydantic Settings (.env loader)
│   ├── dependencies.py                     # DependencyManager (feature readiness)
│   ├── tick_engine.py                      # TickEngine: tick→candle, delta, sessions
│   ├── time_engine.py                      # TimeEngine: countdown broadcasts
│   ├── ai_assistant.py                     # AI market analysis (rule-based)
│   ├── ai_trade_assistant.py               # AI trade setup with entry/SL/TP
│   ├── logging_setup.py                    # Structured logging config
│   ├── mt5_worker.py                       # MT5 subprocess (stdin/stdout IPC)
│   ├── api/
│   │   └── routes.py                       # All REST endpoints (~900 lines)
│   ├── websocket/
│   │   ├── manager.py                      # ConnectionManager (WS broadcast)
│   │   └── handlers.py                     # WS message routing (~30 types)
│   ├── connectors/
│   │   ├── binance.py                      # Binance WS/REST connector
│   │   ├── binance_depth.py                # Binance depth/orderbook WS
│   │   ├── data_service.py                 # DataService (orchestrates connectors)
│   │   └── mt5_bridge.py                   # MT5 subprocess bridge
│   ├── execution/
│   │   ├── paper_trading.py                # PaperTradingEngine (~1200 lines)
│   │   ├── orderbook.py                    # OrderBookSimulator (VWAP fills)
│   │   ├── bot.py                          # TradingBot + BotOrchestrator
│   │   ├── live_trading.py                 # LiveTradingEngine (MT5 execution)
│   │   ├── risk.py                         # RiskEngine (position sizing, limits)
│   │   └── backtest.py                     # Backtest runner
│   ├── analytics/
│   │   ├── footprint.py                    # Footprint, delta, cumulative delta
│   │   ├── vpvr.py                         # Volume Profile Visible Range
│   │   └── smc.py                          # Smart Money Concepts (BOS, CHoCH, FVG)
│   ├── indicators/
│   │   └── calculator.py                   # 14 indicators (SMA, EMA, WMA, HMA, RSI, MACD, etc.)
│   ├── aggregation/
│   │   └── candle_aggregator.py            # 1m→higher TF aggregation
│   ├── storage/
│   │   ├── database.py                     # SQLite schema (12 tables)
│   │   └── models.py                       # Pydantic CRUD models
│   ├── instruments/
│   │   └── registry.py                     # 18 instruments (10 crypto, 2 metals, 6 forex)
│   ├── alerts/
│   │   └── engine.py                       # Alert evaluation with trigger-once
│   ├── strategies/
│   │   └── engine.py                       # Strategy engine + BacktestEngine
│   ├── replay/
│   │   └── engine.py                       # Historical tick replay
│   ├── data_engine/
│   │   ├── engine.py                       # Data fetch orchestrator
│   │   ├── fetch.py                        # History candle fetcher
│   │   └── event_bus.py                    # Async event bus
│   ├── tests/
│   │   ├── test_orderbook.py               # OrderBook unit tests
│   │   ├── test_paper_trading.py           # PaperTrading tests
│   │   ├── test_paper_trading_fuzz.py      # Hypothesis fuzz tests
│   │   └── test_paper_trading_integration.py
│   ├── requirements.txt                    # Python dependencies
│   ├── Dockerfile                          # Backend container
│   └── pyproject.toml                      # Build config + pytest
├── frontend/
│   ├── index.html                          # HTML shell
│   ├── src/
│   │   ├── main.tsx                        # React root
│   │   ├── App.tsx                         # App init (WS, depth, deps)
│   │   ├── index.css                       # Tailwind + custom styles
│   │   ├── types/
│   │   │   └── index.ts                    # TypeScript types (~340 lines)
│   │   ├── websocket/
│   │   │   └── client.ts                   # WSClient (reconnect, heartbeat)
│   │   ├── charts/
│   │   │   ├── ChartPane.tsx               # Main candlestick chart
│   │   │   ├── FootprintChart.tsx          # Footprint volume chart
│   │   │   ├── FootprintOverlay.tsx        # Canvas footprint overlay
│   │   │   ├── footprintCanvas.ts          # Canvas rendering functions
│   │   │   ├── DeltaChart.tsx              # Delta analysis chart
│   │   │   ├── VPVRChart.tsx               # Volume Profile chart
│   │   │   ├── DOMLadder.tsx               # Depth of Market ladder
│   │   │   ├── HeatmapChart.tsx            # Volume heatmap
│   │   │   ├── SMCOverlay.tsx              # Smart Money overlay
│   │   │   ├── OscillatorPanel.tsx         # RSI, MACD, Stoch, CCI, etc.
│   │   │   ├── DrawingLayer.tsx            # Chart drawing tools canvas
│   │   │   ├── DrawingTools.tsx            # Drawing tool UI
│   │   │   ├── CandleCountdown.tsx         # Candle close timer
│   │   │   ├── CandleTooltip.tsx           # OHLCV tooltip
│   │   │   └── ChartTimer.tsx              # Chart time display
│   │   ├── components/
│   │   │   ├── FeatureGuard.tsx            # Dependency-based feature gating
│   │   │   ├── IndicatorPanel.tsx          # Indicator selector
│   │   │   ├── IndicatorConfigModal.tsx    # Indicator config UI
│   │   │   ├── PairSelector.tsx            # Symbol search/selector
│   │   │   ├── PineScriptPanel.tsx         # Pine Script editor
│   │   │   ├── StatusBar.tsx               # Bottom status bar
│   │   │   ├── Toolbar.tsx                 # Top toolbar
│   │   │   ├── ToolsDrawer.tsx             # Tools panel
│   │   │   └── WorkspaceTabs.tsx           # Workspace tab bar
│   │   ├── sidebar/
│   │   │   ├── Sidebar.tsx                 # 13-tab sidebar container
│   │   │   ├── WatchlistSidebar.tsx        # Watchlist management
│   │   │   ├── InstrumentSearch.tsx        # Instrument search
│   │   │   ├── AlertPanel.tsx              # Alert configuration
│   │   │   ├── BacktestPanel.tsx           # Backtest UI
│   │   │   ├── BotPanel.tsx                # Bot management
│   │   │   ├── SignalLogPanel.tsx          # Signal history
│   │   │   ├── PositionPanel.tsx           # Position monitor
│   │   │   ├── PaperTradingPanel.tsx       # Paper trading UI
│   │   │   ├── LiveTradingPanel.tsx        # Live trading UI
│   │   │   ├── JournalPanel.tsx            # Trade journal
│   │   │   ├── ReplayPanel.tsx             # Chart replay controls
│   │   │   └── TemplatePanel.tsx           # Layout templates
│   │   ├── stores/
│   │   │   ├── useMarketStore.ts           # Candles, quotes
│   │   │   ├── useFootprintStore.ts        # Footprint, VPVR, delta
│   │   │   ├── useDOMStore.ts              # Depth of Market
│   │   │   ├── useLayoutStore.ts           # Workspaces, panes
│   │   │   ├── useConnectionStore.ts       # WS connection status
│   │   │   ├── useCountdownStore.ts        # Candle countdowns
│   │   │   ├── useDependencyStore.ts       # Feature readiness
│   │   │   ├── useDrawingStore.ts          # Chart drawings
│   │   │   ├── useInstrumentStore.ts       # Instrument registry
│   │   │   ├── useWatchlistStore.ts        # Watchlists
│   │   │   ├── useAlertStore.ts            # Alerts
│   │   │   ├── useBotStore.ts              # Trading bots (persisted)
│   │   │   ├── usePaperTradingStore.ts     # Paper trading
│   │   │   ├── useLiveTradingStore.ts      # Live trading
│   │   │   ├── useReplayStore.ts           # Chart replay
│   │   │   ├── useJournalStore.ts          # Trade journal
│   │   │   └── useToolStore.ts             # Drawing tools
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts             # WS message routing
│   │   │   ├── useDepthStream.ts           # Depth WS subscription
│   │   │   ├── useCandleHistory.ts         # Candle history fetcher
│   │   │   ├── useIndicatorLines.ts        # Indicator calculations
│   │   │   ├── useAnalytics.ts             # Footprint data fetcher
│   │   │   ├── useAutoFit.ts               # Chart auto-fit
│   │   │   ├── useChartExport.ts           # Chart PNG export
│   │   │   ├── useKeyboardShortcuts.ts     # Keyboard shortcuts
│   │   │   └── useResponsive.ts            # Responsive breakpoints
│   │   ├── ai/
│   │   │   ├── AIPanel.tsx                 # AI analysis UI
│   │   │   └── AITradeAssistant.tsx        # AI trade setup UI
│   │   ├── api/
│   │   │   ├── paperTrading.ts             # Paper trading REST client
│   │   │   └── liveTrading.ts              # Live trading REST client
│   │   ├── layouts/
│   │   │   ├── Workspace.tsx               # Main workspace layout
│   │   │   └── Pane.tsx                    # Individual pane component
│   │   ├── utils/
│   │   │   ├── format.ts                   # Number/date/interval formatting
│   │   │   └── requestCache.ts             # Fetch cache with TTL
│   │   └── workers/
│   │       ├── indicatorWorker.ts          # Web Worker for indicators
│   │       └── useWorker.ts                # Worker hook
│   ├── package.json                        # Node dependencies
│   ├── tsconfig.json                       # TypeScript config
│   ├── vite.config.ts                      # Vite + Vitest config
│   ├── tailwind.config.js                  # Tailwind CSS config
│   ├── postcss.config.js                   # PostCSS config
│   └── Dockerfile                          # Frontend container (nginx)
├── loadtest/
│   ├── locustfile.py                       # Locust load tests
│   └── docker-compose.loadtest.yml
├── data/
│   └── screenshots/                        # Trade screenshots
├── docker-compose.yml                      # Backend + nginx orchestration
├── nginx.conf                              # Reverse proxy config
├── README.md                               # Project documentation
└── .gitignore
```

---

## 4. Architecture

### 4.1 Data Flow

```
Binance WS ──┐
              ├──> DataService ──> CandleAggregator ──> WebSocket ──> Frontend
Binance REST ─┘         │
                        ├──> TickEngine (footprint, delta, sessions)
MT5 Subprocess ─────────┤
                        ├──> PaperTradingEngine (order matching)
                        ├──> BotOrchestrator (strategy evaluation)
                        └──> TimeEngine (countdowns)

Binance Depth WS ──> OrderBookSimulator ──> DOM broadcast
```

### 4.2 Real-time Communication

- **WebSocket** (`/ws/market`): Candle updates, quotes, analytics, alerts, bot signals, paper trading events
- **REST** (`/api/*`): History, CRUD operations, backtesting, AI analysis

### 4.3 Supported Instruments

| Category | Symbols | Source |
|----------|---------|--------|
| Crypto | BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, ADAUSDT, DOGEUSDT, AVAXUSDT, DOTUSDT, LINKUSDT, MATICUSDT | Binance |
| Metals | XAUUSD (Gold), XAGUSD (Silver) | Binance (mapped to XAUUSDT/XAGUSDT) |
| Forex | EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, NZDUSD | Binance (mapped) |

---

## 5. Key Features

### 5.1 Charting
- Candlestick charts via lightweight-charts library
- Multi-timeframe: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w
- 14 technical indicators (SMA, EMA, WMA, HMA, RSI, MACD, Stochastic, CCI, Williams %R, ATR, Bollinger, Keltner, Parabolic SAR, VWAP)
- Supertrend, ADX, Ichimoku Cloud, CRT (Candle Range Theory)
- Footprint chart (bid/ask volume at price)
- Delta analysis (buy vs sell pressure)
- VPVR (Volume Profile Visible Range)
- Smart Money Concepts overlay
- Drawing tools (trendlines, horizontal lines, fibonacci)
- Chart replay engine

### 5.2 Trading
- Paper trading with order book simulation, slippage, fees
- Order types: market, limit, stop, stop-limit
- Position tracking with mark-to-market P&L
- Risk engine (max position, max daily loss, cooldown)
- Live MT5 execution (forex, metals)

### 5.3 Automation
- Bot orchestrator with configurable strategies
- EMA crossover, RSI, MACD, Bollinger strategies
- Signal generation → paper or live execution
- Backtesting engine with Sharpe, drawdown, profit factor

### 5.4 AI
- Rule-based market analysis (EMA, RSI, MACD)
- Trade setup suggestions with entry/SL/TP

---

## 6. API Surface

### REST Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/history` | Candle history |
| GET | `/api/footprint` | Footprint data |
| GET | `/api/delta` | Delta data |
| GET | `/api/vpvr` | VPVR data |
| GET | `/api/instruments` | Instrument registry |
| GET | `/api/dependencies` | Feature readiness |
| GET | `/api/ai/analyze` | AI analysis |
| GET | `/api/ai/trade-setup` | AI trade setup |
| CRUD | `/api/watchlists` | Watchlists |
| CRUD | `/api/layouts` | Layouts |
| CRUD | `/api/drawings` | Drawings |
| CRUD | `/api/alerts` | Alerts |
| CRUD | `/api/journal` | Trade journal |
| GET/POST | `/api/paper/*` | Paper trading |
| GET/POST | `/api/live/*` | Live trading |
| POST | `/api/backtest` | Run backtest |
| POST | `/api/screenshots` | Upload screenshot |

### WebSocket Messages (→ Server)
`subscribe`, `ping`, `replay_*`, `bot_*`, `paper_*`, `live_*`

### WebSocket Messages (→ Client)
`candle`, `quote`, `footprint`, `vpvr`, `delta`, `candle_time`, `bot_signal`, `alert_triggered`, `paper_*`, `live_*`

---

## 7. Database Schema

SQLite with 12 tables:
- `layouts`, `watchlists`, `drawings`, `alerts`
- `ticks` (raw tick data)
- `bot_configs`, `bot_orders` (automation)
- `templates` (layout templates)
- `trade_journal` (journal entries)
- `paper_accounts`, `paper_positions`, `paper_orders`, `paper_closed_trades`

---

## 8. Infrastructure

- **Docker Compose**: Backend (Python/FastAPI:8000) + nginx (SPA:80)
- **nginx**: Reverse proxy `/api` and `/ws` to backend, serves static SPA
- **CI/CD**: GitHub Actions (pytest, typecheck, vitest, Docker build)

---

## 9. Recent Fixes (2026-05-29)

45+ bugs fixed across backend and frontend:

**Critical:** Tick memory leak, triple-counted ticks, pane ID collision after reload, heatmap wrong properties, depth stream not subscribing, HMA/stochastic indicator errors

**High:** Alert re-firing, missing XAUUSD broadcast, path traversal vulnerability, CORS wildcard, profit factor miscalculation, missing timeframes

**Performance:** Candle store array copy optimization, Ichimoku O(n) rolling max/min, parallel WS broadcast, indicator memo deduplication

**XAUUSD/Gold fix (2026-05-29):**
- Removed XAUUSDT/XAGUSDT, using only XAUUSD/XAGUSD as canonical symbols
- Fixed AI endpoints to use fetch_history_candles with MT5 fallback
- Fixed instrument registry source for metals and forex
- AI analyze and trade setup now work for XAUUSD (real MT5 data)
- Watchlist defaults updated to use XAUUSD/XAGUSD
- Added bot trade markers on chart (ChartPane + Pane integration)

**Chart UX fixes (2026-05-29):**
- Fixed tooltip position (now tracks crosshair, hides on mouse leave)
- Fixed tooltip candle lookup (closest match instead of exact)
- Fixed DrawingLayer canvas pixel overflow (CSS vs physical pixels)
- Fixed DrawingLayer re-render on chart scroll/zoom
- Fixed useMarketStore state mutation (always creates new arrays)
- Fixed PaperTradingPanel symbol list (XAUUSD instead of XAUUSDT)
- Added fullscreen mode (Ctrl+Shift+F or button, Esc to exit)
- Added missing indicator config definitions (ADX, CRT)
- Replaced all hardcoded colors with design tokens across all components

**UI Redesign (2026-05-29):**
- Bloomberg/TradingView style design system
- Lucide React icons replacing all emoji
- Consistent color tokens (bg-surface, text-text-primary, etc.)
- Professional button/input/card/badge components
- ~30 files redesigned

**All tests passing:** 165 backend tests, TypeScript clean, Vite builds clean.

---

## 10. Feature Status (Verified 2026-05-29)

### Working Features

| Feature | Status | Data Source | Notes |
|---------|--------|-------------|-------|
| **Candlestick Charts** | WORKING | Binance WS + MT5 | Real-time for all 16 symbols |
| **Candle History** | WORKING | Binance REST + MT5 | 1000 candle buffer |
| **Footprint Charts** | WORKING | Tick Engine | Bid/ask volume at price |
| **Delta Analysis** | WORKING | Tick Engine | Buy vs sell pressure |
| **VPVR** | WORKING | Tick Engine | Volume Profile Visible Range |
| **Heatmap** | WORKING | Footprint Store | Fixed: bid_volume/ask_volume props |
| **14 Indicators** | WORKING | Frontend calc | SMA, EMA, WMA, HMA, RSI, MACD, Stoch, CCI, Williams %R, ATR, Bollinger, Keltner, SAR, VWAP |
| **Supertrend/ADX/Ichimoku** | WORKING | Frontend calc | Fixed: Ichimoku O(n) optimization |
| **Pine Script** | WORKING | Frontend eval | Custom indicator scripting |
| **Drawing Tools** | WORKING | Canvas + Store | Trendlines, horizontals, fibonacci |
| **Bot Trade Markers** | NEW | Bot + Paper Stores | Arrow markers on chart for buy/sell |
| **Paper Trading** | WORKING | SQLite | Market/limit/stop orders, P&L tracking |
| **Bot Orchestrator** | WORKING | Strategy Engine | EMA, RSI, MACD, Bollinger strategies |
| **Backtesting** | WORKING | Paper Trading | Sharpe, drawdown, profit factor |
| **AI Analysis** | WORKING | MT5 → Binance → Mock | Fixed: symbol mapping, MT5 fallback |
| **AI Trade Setup** | WORKING | MT5 → Binance → Mock | Entry/SL/TP with confidence |
| **Chart Replay** | WORKING | Tick Engine | Historical playback with speed control |
| **Trade Journal** | WORKING | SQLite | Screenshots, notes |
| **Alerts** | WORKING | Alert Engine | Fixed: trigger-once for non-crossing |
| **Watchlists** | WORKING | Store + DB | 3 default groups (Crypto, Metals, Forex) |
| **Multi-Workspace** | WORKING | Store + DB | Fixed: paneCounter rehydration |
| **DOM Ladder** | PARTIAL | Depth WS | Needs depth_stream ready |
| **Live MT5 Trading** | WORKING | MT5 Bridge | Risk engine, position sync |
| **Session Detection** | WORKING | Tick Engine | Fixed: NY > London > Asian priority |
| **Candle Countdowns** | WORKING | Time Engine | Per-symbol, per-interval |
| **Keyboard Shortcuts** | WORKING | React hooks | Drawing, navigation |
| **Chart Export** | WORKING | Canvas API | PNG export |

### Data Sources

| Source | Symbols | Status |
|--------|---------|--------|
| **Binance WebSocket** | BTC, ETH, SOL, BNB, ADA, XRP, DOGE, AVAX, DOT, LINK + forex (EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, NZDUSD) | WORKING |
| **Binance WebSocket** | XAUUSD, XAGUSD (mapped from Binance stream) | WORKING (via MT5) |
| **MT5 Bridge** | XAUUSD, XAGUSD, forex pairs | WORKING (account 5050929083) |
| **Mock Data** | Fallback for any symbol | WORKING |

### Known Limitations

| Issue | Impact | Workaround |
|-------|--------|------------|
| DOM Ladder shows empty | depth_stream not ready | Needs Binance depth subscription fix |
| XAUUSD uses MT5 only | No Binance Spot for gold | MT5 provides real-time data |
| Bot strategies are basic | Only 4 strategies | Extend BotOrchestrator for custom strategies |
| No mobile responsive | Desktop only | Use desktop browser |

---

## 11. Supported Instruments (16)

| Symbol | Name | Market | Source |
|--------|------|--------|--------|
| BTCUSDT | Bitcoin | Crypto | Binance |
| ETHUSDT | Ethereum | Crypto | Binance |
| SOLUSDT | Solana | Crypto | Binance |
| BNBUSDT | BNB | Crypto | Binance |
| ADAUSDT | Cardano | Crypto | Binance |
| XRPUSDT | Ripple | Crypto | Binance |
| DOGEUSDT | Dogecoin | Crypto | Binance |
| AVAXUSDT | Avalanche | Crypto | Binance |
| DOTUSDT | Polkadot | Crypto | Binance |
| LINKUSDT | Chainlink | Crypto | Binance |
| XAUUSD | Gold | Metal | MT5 |
| XAGUSD | Silver | Metal | MT5 |
| EURUSD | Euro/USD | Forex | Binance/MT5 |
| GBPUSD | GBP/USD | Forex | Binance/MT5 |
| USDJPY | USD/JPY | Forex | Binance/MT5 |
| AUDUSD | AUD/USD | Forex | Binance/MT5 |
| USDCAD | USD/CAD | Forex | Binance/MT5 |
| NZDUSD | NZD/USD | Forex | Binance/MT5 |
