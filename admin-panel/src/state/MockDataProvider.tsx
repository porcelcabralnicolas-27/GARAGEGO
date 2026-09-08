import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';

import { buildInitialState } from '../mocks/data';
import type { MockState } from '../mocks/types';
import { mockReducer, type MockAction } from './mockReducer';

const STORAGE_KEY = 'garagego-admin-mock';

/** Cada cuánto avanza el reloj de la demo. Los cronómetros de sesión suben de verdad. */
const TICK_MS = 5000;

type MockContextValue = {
  state: MockState;
  dispatch: (action: MockAction) => void;
  reset: () => void;
};

const MockContext = createContext<MockContextValue | null>(null);

/**
 * Se persiste en `sessionStorage` (no `localStorage`) a propósito: durante una demo conviene que
 * F5 no borre las aprobaciones que acabás de hacer, pero cerrar la pestaña sí devuelve todo al
 * estado inicial. Si el JSON guardado es de una versión vieja del mock y no parsea, se descarta
 * en silencio y se arranca de cero.
 */
function hydrate(): MockState {
  const fresh = buildInitialState();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const saved = JSON.parse(raw) as MockState;
    if (!Array.isArray(saved.parkingLots) || saved.parkingLots.length === 0) return fresh;
    // El reloj no se restaura: siempre arranca en el "ahora" real.
    return { ...saved, now: Date.now() };
  } catch {
    return fresh;
  }
}

export function MockDataProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(mockReducer, undefined, hydrate);
  const [baseline] = useState(() => state.onlineUserIds);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Cuota llena o storage bloqueado: la demo sigue funcionando en memoria.
    }
  }, [state]);

  // Reloj de la demo. Además de avanzar `now`, mueve la presencia un poco para que el panel de
  // "usuarios en línea" no se vea congelado. No abre ni cierra sesiones: eso confundiría al que
  // está mirando una fila justo en ese momento.
  useEffect(() => {
    const timer = setInterval(() => {
      const jitter = Math.random();
      const onlineUserIds =
        jitter < 0.25 && baseline.length > 3
          ? baseline.slice(0, baseline.length - 1)
          : baseline;
      rawDispatch({ type: 'TICK', now: Date.now(), onlineUserIds });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [baseline]);

  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignorado */
    }
    rawDispatch({ type: 'RESET', state: buildInitialState() });
  }, []);

  const value = useMemo<MockContextValue>(
    () => ({ state, dispatch: rawDispatch, reset }),
    [state, reset]
  );

  return <MockContext.Provider value={value}>{children}</MockContext.Provider>;
}

export function useMock(): MockContextValue {
  const ctx = useContext(MockContext);
  if (!ctx) throw new Error('useMock debe usarse dentro de <MockDataProvider>');
  return ctx;
}
