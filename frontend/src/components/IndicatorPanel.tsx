import type { PaneConfig } from "../types";
import { useLayoutStore } from "../stores/useLayoutStore";

interface Props {
  pane: PaneConfig;
}

export function IndicatorPanel({ pane }: Props) {
  const updatePane = useLayoutStore((s) => s.updatePane);

  const removeIndicator = (indId: string) => {
    updatePane(pane.id, {
      indicators: pane.indicators.filter((i) => i.id !== indId),
    });
  };

  if (pane.indicators.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-surface-alt border-b border-surface-border shrink-0">
      {pane.indicators.map((ind) => (
        <span
          key={ind.id}
          className="inline-flex items-center gap-1 text-xs bg-surface text-accent-blue px-1.5 py-0.5 rounded"
        >
          {ind.type.toUpperCase()}
          <button
            className="text-gray-500 hover:text-accent-red ml-0.5"
            onClick={() => removeIndicator(ind.id)}
          >
            x
          </button>
        </span>
      ))}
    </div>
  );
}
