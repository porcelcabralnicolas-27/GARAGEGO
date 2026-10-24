import { useEffect, useRef } from 'react';

/**
 * Como `setInterval`, pero se pausa cuando la pestaña está oculta (`document.hidden`) y
 * dispara una corrida extra apenas vuelve a estar visible, para no mostrar datos viejos al
 * volver.
 *
 * Antes, el polling de la sidebar (cada 20 s) y del dashboard (cada 30 s) seguían golpeando
 * Supabase aunque nadie estuviera mirando la pestaña — auditoría técnica 2026-09-13,
 * hallazgo 3.5.
 */
export function usePolling(callback: () => void, delayMs: number): void {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => savedCallback.current(), delayMs);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        savedCallback.current();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [delayMs]);
}
