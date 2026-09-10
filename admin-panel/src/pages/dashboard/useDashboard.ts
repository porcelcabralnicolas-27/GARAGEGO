import { useCallback, useEffect, useState } from 'react';

import {
  fetchDashboard,
  fetchGrowth,
  type DashboardData,
  type GrowthPoint,
  type GrowthRange,
} from './dashboardApi';

export type DashboardState = {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

export function useDashboard(): DashboardState {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDashboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Las sesiones en curso y la ocupación cambian solas: refresco cada 30 s.
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  return { data, loading, error, refetch: () => void load() };
}

export type GrowthState = {
  points: GrowthPoint[];
  loading: boolean;
  error: string | null;
};

export function useGrowth(range: GrowthRange): GrowthState {
  const [points, setPoints] = useState<GrowthPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGrowth(range)
      .then((p) => {
        if (!cancelled) setPoints(p);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el crecimiento.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  return { points, loading, error };
}
