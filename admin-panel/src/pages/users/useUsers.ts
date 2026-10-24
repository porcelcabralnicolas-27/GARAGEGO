import { useCallback, useEffect, useState } from 'react';

import { fetchUserDirectory, type UserDirectoryEntry } from './usersApi';

export type UsersState = {
  users: UserDirectoryEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

export function useUsers(): UsersState {
  const [users, setUsers] = useState<UserDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchUserDirectory());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el directorio.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { users, loading, error, refetch: () => void load() };
}
