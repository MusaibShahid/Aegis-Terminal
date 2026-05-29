import { useEffect, useRef } from "react";

interface ShortcutMap {
  [key: string]: () => void;
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  // Store latest shortcuts in a ref to avoid tearing down/rebuilding
  // the event listener when shortcuts object reference changes on every render.
  const ref = useRef<ShortcutMap>(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key === " " ? "Space" : e.key;
      const ctrl = e.ctrlKey ? "Ctrl+" : "";
      const combo = `${ctrl}${key}`;
      const action = ref.current[combo] || ref.current[key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
