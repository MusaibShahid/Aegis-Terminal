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
      <div className="text-[10px] text-gray-500 p-2 text-center border border-dashed border-surface-border rounded">
        {feature.replace("_", " ")} unavailable
        {status?.missing?.length ? ` (requires: ${status.missing.join(", ")})` : ""}
      </div>
    );
  }

  return <>{children}</>;
}
