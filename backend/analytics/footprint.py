from __future__ import annotations

from collections import defaultdict
from typing import Any


def build_footprint(ticks: list[dict], bucket_price: float = 1.0) -> dict[str, Any]:
    buckets: dict[float, dict[str, float]] = defaultdict(lambda: {"bid_vol": 0.0, "ask_vol": 0.0})

    for t in ticks:
        price = round(t["price"] / bucket_price) * bucket_price
        vol = t["volume"]
        side = t.get("side", "buy")
        if side == "buy":
            buckets[price]["ask_vol"] += vol
        else:
            buckets[price]["bid_vol"] += vol

    levels = []
    max_vol = 0.0
    for price in sorted(buckets.keys()):
        bv = buckets[price]["bid_vol"]
        av = buckets[price]["ask_vol"]
        total = bv + av
        delta = av - bv
        max_vol = max(max_vol, total)
        levels.append({
            "price": price,
            "bid_volume": round(bv, 4),
            "ask_volume": round(av, 4),
            "total_volume": round(total, 4),
            "delta": round(delta, 4),
        })

    max_vol = max_vol or 1
    for lvl in levels:
        lvl["imbalance"] = round(lvl["delta"] / lvl["total_volume"], 4) if lvl["total_volume"] > 0 else 0
        lvl["intensity"] = lvl["total_volume"] / max_vol

    return {"levels": levels, "max_volume": max_vol}


def calculate_delta(ticks: list[dict]) -> dict[str, float]:
    buy_vol = sum(t["volume"] for t in ticks if t.get("side") == "buy")
    sell_vol = sum(t["volume"] for t in ticks if t.get("side") == "sell")
    return {
        "buy_volume": buy_vol,
        "sell_volume": sell_vol,
        "delta": buy_vol - sell_vol,
        "total_volume": buy_vol + sell_vol,
    }


def cumulative_delta(ticks: list[dict]) -> list[dict]:
    result = []
    cum = 0.0
    for t in ticks:
        delta = t["volume"] if t.get("side") == "buy" else -t["volume"]
        cum += delta
        result.append({"timestamp": t["timestamp"], "cumulative_delta": cum})
    return result


def detect_large_trades(ticks: list[dict], threshold_mult: float = 5.0) -> list[dict]:
    if not ticks:
        return []
    avg_vol = sum(t["volume"] for t in ticks) / len(ticks)
    threshold = avg_vol * threshold_mult
    return [t for t in ticks if t["volume"] >= threshold]
