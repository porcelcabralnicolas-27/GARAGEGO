import { useCallback, useEffect, useState } from 'react';

import type { ListingChangeField, LotRow, ModerationState } from '../../domain';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import {
  fetchModerationLots,
  reviewLot,
  setLotModeration,
  type ReviewDecision,
} from './moderationApi';

/**
 * Estado de la sección Inventario con datos reales. Es deliberadamente simple: un `useEffect`
 * que trae todo y se vuelve a llamar después de cada acción. No hay caché ni paginación — el
 * inventario no llega a tener volumen para que haga falta. Si algún día lo tiene, esto se
 * reemplaza por react-query sin tocar `InventoryPage`.
 */
export type ModerationQueue = {
  rows: LotRow[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Aprobar / rechazar / pedir cambios. Refresca la lista. Propaga el error al modal. */
  review: (
    lotId: string,
    decision: ReviewDecision,
    reason: string | null,
    fields?: ListingChangeField[]
  ) => Promise<{ documentsPending: boolean }>;
  /** Pausar / suspender / reactivar una cochera aprobada. Refresca la lista. */
  setModeration: (
    lotId: string,
    state: ModerationState,
    reason: string | null,
    until: string | null
  ) => Promise<void>;
};

export function useModerationQueue(): ModerationQueue {
  const [rows, setRows] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchModerationLots());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el inventario.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Una cochera nueva enviada a revisión (o cambiada por otro admin) aparece sola (0060).
  useRealtimeRefresh('admin-moderation-queue', ['parking_lots'], () => void load());

  const review = useCallback<ModerationQueue['review']>(
    async (lotId, decision, reason, fields) => {
      const result = await reviewLot(lotId, decision, reason, fields ?? null);
      await load();
      return result;
    },
    [load]
  );

  const setModeration = useCallback<ModerationQueue['setModeration']>(
    async (lotId, state, reason, until) => {
      await setLotModeration(lotId, state, reason, until);
      await load();
    },
    [load]
  );

  return { rows, loading, error, refetch: () => void load(), review, setModeration };
}
