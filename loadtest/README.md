# Aegis Terminal — Load Testing

This directory contains load testing scenarios for the Aegis Terminal
API using [Locust](https://locust.io/).

## Quick Start

### 1. Ensure the production stack is running

```bash
cd ..
docker compose up -d
```

Verify: `curl http://localhost:8000/api/health` → `{"status":"ok"}`

### 2. Install Locust (optional — you can use Docker instead)

```bash
cd loadtest
pip install -r requirements.txt
```

### 3a. Run headless via Docker (recommended)

```bash
cd loadtest
docker compose -f docker-compose.loadtest.yml run --rm locust
```

This runs 50 users for 2 minutes and generates `loadtest_data/report.html`.

### 3b. Run with web UI via Docker

```bash
cd loadtest
docker compose -f docker-compose.loadtest.yml up -d locust-master locust-worker
# Open http://localhost:8089, set:
#   Number of users: 50
#   Spawn rate: 5
#   Host: http://backend:8000
# Click "Start swarming"
```

### 3c. Run locally (no Docker)

```bash
cd loadtest

# Headless:
locust -f locustfile.py --host=http://localhost:8000 \
    --headless -u 50 -r 5 --run-time 2m \
    --html report.html --csv report

# With web UI:
locust -f locustfile.py --host=http://localhost:8000
# Open http://localhost:8089
```

### 3d. Run against nginx (production-like)

If you want to test through the nginx proxy:

```bash
locust -f locustfile.py --host=http://localhost:80 \
    --headless -u 50 -r 5 --run-time 2m
```

## Scenarios

| User class | What it does | Weight |
|-----------|-------------|--------|
| `ChartViewerUser` | Fetches history, instruments, health | 30 % |
| `PaperTraderUser` | Paper trading: orders, positions, account | 20 % |
| `DashboardUser` | Monitors live status, bots, alerts, journal | 20 % |
| `MixedUser` | Everything above combined | 30 % |

Each user picks a persona on startup based on the weight distribution.

## Understanding the Report

The HTML report shows:
- **Requests/sec** – throughput of the API under load
- **Response times (P50, P95, P99)** – latency distribution
- **Failures** – any errors returned (network errors, 5xx, or mock data fallback)
- **Percentile chart** – how response times degrade under load

### Key thresholds for production readiness

| Metric        | Target         | Notes                                    |
|---------------|----------------|------------------------------------------|
| P95 latency   | < 500 ms       | For history and paper trading endpoints  |
| Error rate    | < 0.1 %        | Only network / 5xx errors count          |
| Throughput    | > 100 req/s    | On modest hardware through nginx         |
| WebSocket     | < 1 % drops    | Pings should consistently get pongs      |

## File Layout

```
loadtest/
├── locustfile.py              # All load test scenarios
├── docker-compose.loadtest.yml # Docker setup (master + workers + headless)
├── requirements.txt            # Python deps
├── README.md                   # This file
└── loadtest_data/              # Generated reports (gitignored)
```

## Customising the Test

Edit `locustfile.py` to:
- Add new endpoints or trading symbols
- Change user weights or spawn rates
- Add authentication headers (if needed)
- Include WebSocket connection/disconnection scenarios

## WebSocket Load Testing

The `WebSocketUser` and `ChartWSUser` classes test persistent WebSocket
connections. They:
1. Connect on user start
2. Subscribe to 2 random symbols
3. Send pings every 1–3 seconds and verify pong responses
4. Disconnect on user stop

These metrics appear as `WS` request type in the Locust report.

## Tearing Down

```bash
# Stop locust containers
docker compose -f docker-compose.loadtest.yml down

# Stop the production stack
cd ..
docker compose down
```
