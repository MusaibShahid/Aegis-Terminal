import { useToolStore, TOOL_CATEGORIES, TOOL_CATEGORY_LABELS_MAP } from "../stores/useToolStore";

export function ToolsDrawer() {
  const { tools, drawerOpen, toggleDrawer, toggleTool, setDrawerOpen } = useToolStore();

  if (!drawerOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={() => setDrawerOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-80 max-w-[90vw] z-50 animate-slide-left bg-surface-alt/95 backdrop-blur-xl border-l border-surface-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gradient">Tools</span>
            <span className="text-[9px] text-gray-600 font-mono bg-glass-white px-1.5 py-0.5 rounded">
              {tools.filter((t) => t.enabled).length}/{tools.length}
            </span>
          </div>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-glass-white-hover transition-all"
            onClick={() => setDrawerOpen(false)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {TOOL_CATEGORIES.map((category) => {
            const categoryTools = tools.filter((t) => t.category === category);
            if (categoryTools.length === 0) return null;

            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">
                    {TOOL_CATEGORY_LABELS_MAP[category]}
                  </span>
                  <div className="flex-1 h-px bg-surface-border/30" />
                  <span className="text-[9px] text-gray-700 font-mono">
                    {categoryTools.filter((t) => t.enabled).length}/{categoryTools.length}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1">
                  {categoryTools.map((tool) => (
                    <button
                      key={tool.id}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[10px] transition-all duration-150 border ${
                        tool.enabled
                          ? "bg-accent-blue/[0.06] border-accent-blue/20 text-white hover:bg-accent-blue/[0.1]"
                          : "bg-glass-white border-transparent text-gray-500 hover:text-gray-400 hover:bg-glass-white-hover"
                      }`}
                      onClick={() => toggleTool(tool.id)}
                    >
                      {/* Toggle indicator */}
                      <span
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${
                          tool.enabled
                            ? "bg-accent-blue border-accent-blue"
                            : "border-gray-600"
                        }`}
                      >
                        {tool.enabled && (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      <span className={tool.enabled ? "text-white/80" : "text-gray-500"}>
                        {tool.icon && <span className="mr-1">{tool.icon}</span>}
                        {tool.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-surface-border/50 flex items-center justify-between shrink-0">
          <button
            className="text-[9px] text-gray-600 hover:text-white px-2 py-1 rounded hover:bg-glass-white-hover transition-all"
            onClick={() => useToolStore.getState().resetTools()}
          >
            Reset All
          </button>
          <span className="text-[9px] text-gray-700">
            Tools persist across sessions
          </span>
        </div>
      </div>
    </>
  );
}
