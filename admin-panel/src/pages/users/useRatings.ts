import { useCallback, useEffect, useState } from 'react';

import { fetchRatings, setRatingHidden, type PanelRating } from './ratingsApi';

export type RatingsState = {
  ratings: PanelRating[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  setHidden: (ratingId: string, hidden: boolean, reason: string | null) => Promise<void>;
};

export function useRatings(): RatingsState {
  const [ratings, setRatings] = useState<PanelRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRatings(await fetchRatings());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las reseñas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setHidden = useCallback<RatingsState['setHidden']>(
    async (ratingId, hidden, reason) => {
      await setRatingHidden(ratingId, hidden, reason);
      await load();
    },
    [load]
  );

  return { ratings, loading, error, refetch: () => void load(), setHidden };
}
