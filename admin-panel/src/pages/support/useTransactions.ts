import { useCallback, useEffect, useState } from 'react';

import {
  fetchTransactions,
  fetchTransactionSummary,
  type PanelTransaction,
  type TransactionSummary,
} from './transactionsApi';

export type TransactionsState = {
  transactions: PanelTransaction[];
  summary: TransactionSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

export function useTransactions(): TransactionsState {
  const [transactions, setTransactions] = useState<PanelTransaction[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, sum] = await Promise.all([fetchTransactions(), fetchTransactionSummary()]);
      setTransactions(list);
      setSummary(sum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las transacciones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { transactions, summary, loading, error, refetch: () => void load() };
}
