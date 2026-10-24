import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import type { TicketCategory, TicketStatus } from '../../domain';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import {
  fetchTicketCounts,
  fetchTicketMessages,
  fetchTicketsPage,
  replyToTicket,
  setTicketCategory,
  setTicketStatus,
  TICKETS_PAGE_SIZE,
  type PanelTicket,
  type PanelTicketMessage,
  type TicketCounts,
  type TicketCursor,
  type TicketFilters,
} from './ticketsApi';

/** Cuánto se espera después de la última tecla antes de buscar en el servidor. */
const SEARCH_DEBOUNCE_MS = 300;

/** Máximo de filas que el servidor devuelve de una vez (ver admin_tickets_page). */
const MAX_RELOAD_ROWS = 100;

/** Contadores por estado, para las pestañas. Se refrescan solos cuando cambia un ticket (0060). */
export function useTicketCounts(): { counts: TicketCounts; refresh: () => void } {
  const [counts, setCounts] = useState<TicketCounts>({ open: 0, resolved: 0, all: 0 });

  const refresh = useCallback(() => {
    fetchTicketCounts()
      .then(setCounts)
      .catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);
  useRealtimeRefresh('admin-ticket-counts', ['support_tickets'], refresh);

  return { counts, refresh };
}

export type TicketsState = {
  tickets: PanelTicket[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refetch: () => void;
  loadMore: () => void;
  reply: (ticketId: string, body: string) => Promise<void>;
  setStatus: (ticketId: string, status: TicketStatus) => Promise<void>;
  setCategory: (ticketId: string, category: TicketCategory) => Promise<void>;
};

/**
 * Tickets paginados, con los filtros aplicados en el servidor. Al cambiar un filtro se vuelve a
 * la primera página. Cuando cambia un ticket (respuesta nueva, cambio de estado), se recargan
 * las filas ya cargadas de una vez, para no perder las páginas que el admin ya había abierto.
 */
export function useTickets(filters: TicketFilters): TicketsState {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<PanelTicket[]>([]);
  const [cursor, setCursor] = useState<TicketCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si mientras tanto cambió el filtro, la respuesta vieja se descarta.
  const requestId = useRef(0);
  const loadedCount = useRef(0);
  loadedCount.current = tickets.length;

  const { status, category, search } = filters;
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchFirst = useCallback(
    async (limit: number, showLoading: boolean) => {
      const id = ++requestId.current;
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const page = await fetchTicketsPage({ status, category, search: debouncedSearch }, null, limit);
        if (id !== requestId.current) return;
        setTickets(page.rows);
        // Si se recargaron más filas que una página, el cursor sigue desde la última recargada.
        setCursor(page.nextCursor);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los tickets.');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [status, category, debouncedSearch]
  );

  useEffect(() => {
    void fetchFirst(TICKETS_PAGE_SIZE, true);
  }, [fetchFirst]);

  const reloadLoaded = useCallback(() => {
    const limit = Math.min(Math.max(loadedCount.current, TICKETS_PAGE_SIZE), MAX_RELOAD_ROWS);
    void fetchFirst(limit, false);
  }, [fetchFirst]);

  useRealtimeRefresh('admin-tickets-list', ['support_tickets'], reloadLoaded);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const page = await fetchTicketsPage({ status, category, search: debouncedSearch }, cursor);
      if (id !== requestId.current) return;
      setTickets((current) => [...current, ...page.rows]);
      setCursor(page.nextCursor);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'No se pudieron cargar más tickets.');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, status, category, debouncedSearch]);

  const reply = useCallback<TicketsState['reply']>(
    async (ticketId, body) => {
      if (!user) throw new Error('Sesión no disponible.');
      await replyToTicket(ticketId, user.id, body);
      reloadLoaded();
    },
    [user, reloadLoaded]
  );

  const setStatus = useCallback<TicketsState['setStatus']>(
    async (ticketId, nextStatus) => {
      await setTicketStatus(ticketId, nextStatus);
      reloadLoaded();
    },
    [reloadLoaded]
  );

  const setCategory = useCallback<TicketsState['setCategory']>(
    async (ticketId, nextCategory) => {
      await setTicketCategory(ticketId, nextCategory);
      reloadLoaded();
    },
    [reloadLoaded]
  );

  return {
    tickets,
    loading,
    loadingMore,
    hasMore: cursor !== null,
    error,
    refetch: () => void fetchFirst(TICKETS_PAGE_SIZE, true),
    loadMore: () => void loadMore(),
    reply,
    setStatus,
    setCategory,
  };
}

/** Mensajes del ticket abierto. Se piden al abrirlo y se refrescan con cada mensaje nuevo. */
export function useTicketMessages(ticket: PanelTicket | null): {
  messages: PanelTicketMessage[];
  loading: boolean;
  reload: () => void;
} {
  const [messages, setMessages] = useState<PanelTicketMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const ticketId = ticket?.id ?? null;
  const reporterName = ticket?.reporterName ?? 'Usuario';
  const requestId = useRef(0);

  const reload = useCallback(() => {
    const id = ++requestId.current;
    if (!ticketId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    fetchTicketMessages(ticketId, reporterName)
      .then((rows) => {
        if (id === requestId.current) setMessages(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [ticketId, reporterName]);

  useEffect(() => {
    setMessages([]);
    reload();
  }, [reload]);

  useRealtimeRefresh('admin-ticket-messages', ['support_ticket_messages'], reload);

  return { messages, loading, reload };
}
