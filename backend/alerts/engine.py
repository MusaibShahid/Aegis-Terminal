from __future__ import annotations

import json
from typing import Any

import structlog

logger = structlog.get_logger()


class AlertEngine:
    def __init__(self) -> None:
        self._alerts: list[dict[str, Any]] = []
        self._on_alert = None
        self._prev: dict[int, float] = {}
        self._triggered: set[int] = set()  # Track non-crossing alerts that have already fired

    def load(self, alerts: list[dict[str, Any]]) -> None:
        self._alerts = alerts
        self._prev.clear()

    def set_handler(self, handler) -> None:
        self._on_alert = handler

    def add_alert(self, alert: dict[str, Any]) -> None:
        self._alerts.append(alert)

    def remove_alert(self, alert_id: int) -> None:
        self._alerts = [a for a in self._alerts if a.get("id") != alert_id]
        self._prev.pop(alert_id, None)
        self._triggered.discard(alert_id)

    async def check(self, data: dict[str, Any]) -> None:
        for alert in self._alerts:
            if not alert.get("enabled", True):
                continue
            alert_id = alert.get("id", 0)
            triggered = self._evaluate(alert, data)
            if triggered and self._on_alert:
                # For non-crossing alerts, only fire once (not every tick)
                cond = alert.get("condition", {})
                if isinstance(cond, str):
                    import json as _json
                    try:
                        cond = _json.loads(cond)
                    except Exception:
                        cond = {}
                op = cond.get("operator", ">")
                if op in ("crosses_above", "crosses_below"):
                    await self._on_alert({**alert, "triggered_at": data.get("timestamp", 0)})
                elif alert_id not in self._triggered:
                    self._triggered.add(alert_id)
                    await self._on_alert({**alert, "triggered_at": data.get("timestamp", 0)})

    def _evaluate(self, alert: dict[str, Any], data: dict[str, Any]) -> bool:
        try:
            cond = json.loads(alert["condition"]) if isinstance(alert["condition"], str) else alert["condition"]
            atype = alert.get("type", "price")
            field = cond.get("field", "close")
            op = cond.get("operator", ">")
            value = cond.get("value", 0)
            current = data.get(field, 0)
            alert_id = alert.get("id", 0)

            if op in ("crosses_above", "crosses_below"):
                prev = self._prev.get(alert_id, current)
                self._prev[alert_id] = current
                if op == "crosses_above":
                    return prev <= value and current > value
                else:
                    return prev >= value and current < value

            if atype == "price":
                return self._compare(current, op, value)
            elif atype == "volume":
                return self._compare(data.get("volume", 0), op, value)
            elif atype == "delta":
                return self._compare(data.get("delta", 0), op, value)
            elif atype == "indicator":
                indicator_val = data.get("indicator", {}).get(cond.get("indicator", ""), 0)
                return self._compare(indicator_val, op, value)
            return False
        except Exception:
            return False

    def _compare(self, a: float, op: str, b: float) -> bool:
        if op == ">" or op == "gt":
            return a > b
        elif op == ">=" or op == "gte":
            return a >= b
        elif op == "<" or op == "lt":
            return a < b
        elif op == "<=" or op == "lte":
            return a <= b
        elif op == "==" or op == "eq":
            return abs(a - b) < 0.0001
        return False

    @property
    def alerts(self) -> list[dict[str, Any]]:
        return self._alerts
