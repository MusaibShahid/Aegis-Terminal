import type { ReactNode } from "react";
import { useDependencyStore } from "../stores/useDependencyStore";

interface Props {
  feature: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function FeatureGuard({ feature, fallback, children }: Props) {
  const isReady = useDependencyStore((s) => s.isReady(feature));
  const status = useDependencyStore((s) => s.features[feature]);

  if (!isReady) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <div className="flex flex-col items-center justify-center h-full text-[10px] text-text-tertiary p-4">
        <div className="glass-card rounded-lg p-4 text-center max-w-[200px] space-y-2">
          <svg className="w-8 h-8 mx-auto opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div className="text-xs text-text-secondary uppercase tracking-widest">
            {feature.replace(/_/g, " ")}
          </div>
          <div className="text-[9px] text-text-muted leading-relaxed">
            Service unavailable
          </div>
          {status?.missing?.length ? (
            <div className="text-[8px] text-text-muted bg-surface-hover/50 rounded px-2 py-1">
              Requires: {status.missing.join(", ")}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
