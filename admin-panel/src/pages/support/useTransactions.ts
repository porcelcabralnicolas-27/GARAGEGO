import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchTransactionsPage,
  fetchTransactionSummary,
  type PanelTransaction,
  type TransactionCursor,
  type TransactionFilters,
  type TransactionSummary,
} from './transactionsApi';

export type TransactionsState = {
  transactions: PanelTransaction[];
  summary: TransactionSummary | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refetch: () => void;
  loadMore: () => void;
};

/** Cuánto se espera después de la última tecla antes de buscar en el servidor. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Movimientos paginados con los filtros aplicados en el servidor. Al cambiar un filtro se vuelve
 * a la primera página; "cargar más" agrega la siguiente con el mismo filtro.
 */
export function useTransactions(filters: TransactionFilters): TransactionsState {
  const [transactions, setTransactions] = useState<PanelTransaction[]>([]);
  const [cursor, setCursor] = useState<TransactionCursor | null>(null);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada carga desde cero incrementa esto: si mientras tanto cambió el filtro, la respuesta
  // vieja se descarta en vez de pisar la lista del filtro nuevo.
  const requestId = useRef(0);

  const { type, status, search } = filters;
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const [page, sum] = await Promise.all([
        fetchTransactionsPage({ type, status, search: debouncedSearch }, null),
        fetchTransactionSummary(),
      ]);
      if (id !== requestId.current) return;
      setTransactions(page.rows);
      setCursor(page.nextCursor);
      setSummary(sum);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las transacciones.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [type, status, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const page = await fetchTransactionsPage({ type, status, search: debouncedSearch }, cursor);
      if (id !== requestId.current) return;
      setTransactions((current) => [...current, ...page.rows]);
      setCursor(page.nextCursor);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'No se pudieron cargar más transacciones.');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, type, status, debouncedSearch]);

  return {
    transactions,
    summary,
    loading,
    loadingMore,
    hasMore: cursor !== null,
    error,
    refetch: () => void load(),
    loadMore: () => void loadMore(),
  };
}
