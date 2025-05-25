// ==================== hooks/usePromiserWorker.ts ====================
import { useEffect, useRef } from 'react';
import { Promiser, World } from '@/types/promiser';

export function usePromiserWorker(world: World, onUpdate: (p: Promiser[]) => void) {
  const workerRef = useRef<Worker>();

  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/promiserWorker.ts', import.meta.url), {
      type: 'module',
    });

    workerRef.current.onmessage = (e: MessageEvent<{ promisers: Promiser[] }>) => {
      onUpdate(e.data.promisers);
    };

    const interval = setInterval(() => {
      workerRef.current?.postMessage({ world });
    }, 500); // 2 ticks/sec

    return () => {
      clearInterval(interval);
      workerRef.current?.terminate();
    };
  }, [world, onUpdate]);
}
