import { useEffect, useRef, useCallback } from "react";

type WorkerMessage = {
  type: "result";
  id: string;
  result: any;
};

type PendingCallback = (result: any) => void;

export function useWorker(workerUrl: string) {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, PendingCallback>>(new Map());
  const counterRef = useRef(0);

  useEffect(() => {
    workerRef.current = new Worker(workerUrl);
    workerRef.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const { id, result } = e.data;
      const cb = pendingRef.current.get(id);
      if (cb) {
        cb(result);
        pendingRef.current.delete(id);
      }
    };
    return () => {
      workerRef.current?.terminate();
    };
  }, [workerUrl]);

  const postTask = useCallback(
    (type: string, data: any): Promise<any> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error("Worker not initialized"));
          return;
        }
        const id = `task_${counterRef.current++}`;
        pendingRef.current.set(id, resolve);
        workerRef.current.postMessage({ type, id, data });
      });
    },
    []
  );

  return { postTask };
}
