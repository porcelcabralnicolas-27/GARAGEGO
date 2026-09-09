import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import type { TicketCategory, TicketStatus } from '../../mocks/types';
import {
  fetchTickets,
  replyToTicket,
  setTicketCategory,
  setTicketStatus,
  type PanelTicket,
} from './ticketsApi';

/** Tickets de soporte reales. Mismo patrón simple que `useModerationQueue`. */
export type TicketsState = {
  tickets: PanelTicket[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  reply: (ticketId: string, body: string) => Promise<void>;
  setStatus: (ticketId: string, status: TicketStatus) => Promise<void>;
  setCategory: (ticketId: string, category: TicketCategory) => Promise<void>;
};

export function useTickets(): TicketsState {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<PanelTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTickets(await fetchTickets());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los tickets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reply = useCallback<TicketsState['reply']>(
    async (ticketId, body) => {
      if (!user) throw new Error('Sesión no disponible.');
      await replyToTicket(ticketId, user.id, body);
      await load();
    },
    [user, load]
  );

  const setStatus = useCallback<TicketsState['setStatus']>(
    async (ticketId, status) => {
      await setTicketStatus(ticketId, status);
      await load();
    },
    [load]
  );

  const setCategory = useCallback<TicketsState['setCategory']>(
    async (ticketId, category) => {
      await setTicketCategory(ticketId, category);
      await load();
    },
    [load]
  );

  return { tickets, loading, error, refetch: () => void load(), reply, setStatus, setCategory };
}
