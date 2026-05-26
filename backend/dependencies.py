from __future__ import annotations

from typing import Any

DEPENDENCY_MATRIX: dict[str, list[str]] = {
    "footprint": ["tick_engine", "aggregation"],
    "dom": ["depth_stream", "orderbook_sync"],
    "replay": ["tick_storage"],
    "ai_assistant": ["stable_candles", "indicator_engine"],
    "delta": ["tick_classification"],
    "vpvr": ["volume_aggregation"],
    "backtest": ["strategy_engine", "candle_history"],
    "bot": ["strategy_engine", "risk_engine"],
}


class DependencyManager:
    def __init__(self) -> None:
        self._status: dict[str, bool] = {
            "tick_engine": False,
            "aggregation": False,
            "depth_stream": False,
            "orderbook_sync": False,
            "tick_storage": False,
            "stable_candles": False,
            "indicator_engine": False,
            "tick_classification": False,
            "volume_aggregation": False,
            "strategy_engine": False,
            "candle_history": False,
            "risk_engine": False,
        }

    def set_ready(self, component: str, ready: bool = True) -> None:
        if component in self._status:
            self._status[component] = ready

    def is_ready(self, component: str) -> bool:
        return self._status.get(component, False)

    def feature_ready(self, feature: str) -> tuple[bool, list[str]]:
        deps = DEPENDENCY_MATRIX.get(feature, [])
        missing = [d for d in deps if not self._status.get(d, False)]
        return len(missing) == 0, missing

    def all_ready(self) -> dict[str, bool | list[str]]:
        result: dict[str, bool | list[str]] = {}
        for feature in DEPENDENCY_MATRIX:
            ready, missing = self.feature_ready(feature)
            result[feature] = {"ready": ready, "missing": missing}
        return result


dependency_manager = DependencyManager()
