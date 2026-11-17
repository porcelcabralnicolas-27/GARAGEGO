import { useCallback, useEffect, useState } from 'react';

import type { ListingChangeField, LotRow, ModerationState } from '../../domain';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import { fetchChecklistItems, type ChecklistItem } from '../settings/checklistApi';
import { REVIEW_STALE_MESSAGE, fetchModerationLots, reviewLot, setLotModeration, type ReviewDecision } from './moderationApi';

/**
 * Estado de la sección Inventario con datos reales. Es deliberadamente simple: un `useEffect`
 * que trae todo y se vuelve a llamar después de cada acción. No hay caché ni paginación — el
 * inventario no llega a tener volumen para que haga falta. Si algún día lo tiene, esto se
 * reemplaza por react-query sin tocar `InventoryPage`.
 */
export type ModerationQueue = {
  rows: LotRow[];
  /** Puntos del checklist de aprobación (0092), activos e inactivos. */
  checklist: ChecklistItem[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Aprobar / rechazar / pedir cambios. Refresca la lista. Propaga el error al modal. */
  review: (
    lotId: string,
    decision: ReviewDecision,
    reason: string | null,
    fields?: ListingChangeField[],
    checkedItems?: string[],
    expectedReviewVersion?: number | null
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
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lots, items] = await Promise.all([
        fetchModerationLots(),
        // Sin la migración 0092 no hay checklist: el inventario igual se muestra.
        fetchChecklistItems().catch((err: unknown) => {
          console.warn('review_checklist_items no disponible:', err instanceof Error ? err.message : err);
          return [] as ChecklistItem[];
        }),
      ]);
      setRows(lots);
      setChecklist(items);
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
  // Lo mismo si otro admin cambia el checklist mientras se revisa.
  useRealtimeRefresh('admin-moderation-queue', ['parking_lots', 'review_checklist_items'], () => void load());

  const review = useCallback<ModerationQueue['review']>(
    async (lotId, decision, reason, fields, checkedItems, expectedReviewVersion) => {
      try {
        const result = await reviewLot(
          lotId,
          decision,
          reason,
          fields ?? null,
          checkedItems ?? [],
          expectedReviewVersion ?? null
        );
        await load();
        return result;
      } catch (err) {
        // Si cambió mientras se revisaba, se recarga para mostrar la versión nueva.
        if (err instanceof Error && err.message === REVIEW_STALE_MESSAGE) await load();
        throw err;
      }
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

  return { rows, checklist, loading, error, refetch: () => void load(), review, setModeration };
}
