import { useEffect } from "react";

interface ShortcutMap {
  [key: string]: () => void;
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key === " " ? "Space" : e.key;
      const ctrl = e.ctrlKey ? "Ctrl+" : "";
      const combo = `${ctrl}${key}`;
      const action = shortcuts[combo] || shortcuts[key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
