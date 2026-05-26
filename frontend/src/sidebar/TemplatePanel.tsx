import { useState } from "react";
import { useLayoutStore } from "../stores/useLayoutStore";

export function TemplatePanel() {
  const panes = useLayoutStore((s) => s.panes);
  const loadLayout = useLayoutStore((s) => s.loadLayout);
  const getLayout = useLayoutStore((s) => s.getLayout);
  const [savedTemplates, setSavedTemplates] = useState<
    { name: string; data: string }[]
  >(() => {
    try {
      return JSON.parse(localStorage.getItem("aegis_templates") || "[]");
    } catch {
      return [];
    }
  });
  const [name, setName] = useState("");

  const saveCurrent = () => {
    if (!name.trim()) return;
    const layout = getLayout();
    const entry = { name: name.trim(), data: JSON.stringify(layout) };
    const updated = [...savedTemplates, entry];
    setSavedTemplates(updated);
    localStorage.setItem("aegis_templates", JSON.stringify(updated));
    setName("");
  };

  const loadTemplate = (entry: { name: string; data: string }) => {
    try {
      const layout = JSON.parse(entry.data);
      loadLayout(layout);
    } catch {
      // ignore
    }
  };

  const deleteTemplate = (idx: number) => {
    const updated = savedTemplates.filter((_, i) => i !== idx);
    setSavedTemplates(updated);
    localStorage.setItem("aegis_templates", JSON.stringify(updated));
  };

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="p-2 border-b border-surface-border space-y-1">
        <div className="flex gap-1">
          <input
            className="flex-1 bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white"
            placeholder="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="bg-accent-blue text-white px-2 rounded text-[10px] hover:bg-accent-blue/80"
            onClick={saveCurrent}
          >
            Save
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {savedTemplates.length === 0 && (
          <div className="text-gray-500 p-2 text-center">No saved templates</div>
        )}
        {savedTemplates.map((t, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-2 py-1.5 border-b border-surface-border/30 hover:bg-surface-alt cursor-pointer"
            onClick={() => loadTemplate(t)}
          >
            <span className="text-gray-300">{t.name}</span>
            <button
              className="text-gray-500 hover:text-accent-red text-[10px]"
              onClick={(e) => {
                e.stopPropagation();
                deleteTemplate(i);
              }}
            >
              x
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
