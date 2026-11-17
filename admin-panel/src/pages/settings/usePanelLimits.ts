import { useEffect, useState } from 'react';

import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import { DEFAULT_LIMITS, fetchLimits, type Limits } from './settingsApi';

// Lo vigente, compartido entre pantallas.
let current: Limits = DEFAULT_LIMITS;

/** Límites de Configuración (0093) para otras pantallas del panel. Si fallan, los de siempre. */
export function usePanelLimits(): Limits {
  const [limits, setLimits] = useState<Limits>(current);

  const load = () => {
    void fetchLimits()
      .then(({ limits: next }) => {
        current = next;
        setLimits(next);
      })
      .catch(() => undefined);
  };

  useEffect(load, []);
  useRealtimeRefresh('admin-panel-limits', ['app_settings'], load);

  return limits;
}
