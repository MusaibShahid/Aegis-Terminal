import { useState } from "react";

// In-memory templates for now
const DEFAULT_TEMPLATES = [
  { id: "default", name: "Default", description: "Single candle chart" },
  { id: "analytics", name: "Analytics", description: "Chart + footprint + delta" },
  { id: "depth", name: "Depth", description: "Chart + DOM ladder" },
];

export function TemplatePanel() {
  const [templates] = useState(DEFAULT_TEMPLATES);
  const [applying, setApplying] = useState<string | null>(null);

  const handleApply = async (templateId: string) => {
    setApplying(templateId);
    try {
      await fetch(`/api/layout/template/${templateId}`, { method: "POST" });
      window.location.reload();
    } catch {
      // ignore
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="flex flex-col h-full text-xs p-2 space-y-1.5">
      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          <span className="text-xs">No templates available</span>
        </div>
      ) : (
        templates.map((t) => (
          <div key={t.id} className="glass-card rounded-lg p-2.5 group hover:bg-glass-white-hover transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white/80 text-[11px] font-medium">{t.name}</div>
                <div className="text-[9px] text-gray-600 mt-0.5">{t.description}</div>
              </div>
              <button
                className="btn-primary bg-accent-blue/15 text-accent-blue border border-accent-blue/25 hover:bg-accent-blue/25 text-[9px] disabled:opacity-40"
                onClick={() => handleApply(t.id)}
                disabled={applying === t.id}
              >
                {applying === t.id ? (
                  <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse inline-block" />
                ) : (
                  "Apply"
                )}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
