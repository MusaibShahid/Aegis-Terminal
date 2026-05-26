from __future__ import annotations

from collections import defaultdict
from typing import Any

VALUE_AREA_PCT = 0.70


def compute_vpvr(ticks: list[dict], bucket_price: float = 1.0) -> dict[str, Any]:
    buckets: dict[float, float] = defaultdict(float)

    for t in ticks:
        price = round(t["price"] / bucket_price) * bucket_price
        buckets[price] += t["volume"]

    if not buckets:
        return {"levels": [], "poc": 0, "vah": 0, "val": 0, "total_volume": 0}

    levels = sorted(buckets.items())
    total_vol = sum(v for _, v in levels)
    max_vol = max(v for _, v in levels)
    poc_price = max(buckets, key=buckets.get)

    sorted_by_vol = sorted(levels, key=lambda x: -x[1])
    cum = 0.0
    included_prices = set()
    for price, vol in sorted_by_vol:
        cum += vol
        included_prices.add(price)
        if cum / total_vol >= VALUE_AREA_PCT:
            break

    included = [p for p in included_prices if p in {l[0] for l in levels}]
    vah = max(included) if included else poc_price
    val = min(included) if included else poc_price

    level_data = []
    for price, vol in levels:
        level_data.append({
            "price": price,
            "volume": vol,
            "is_poc": price == poc_price,
            "in_value_area": val <= price <= vah,
        })

    return {
        "levels": level_data,
        "poc": poc_price,
        "vah": vah,
        "val": val,
        "total_volume": total_vol,
    }
