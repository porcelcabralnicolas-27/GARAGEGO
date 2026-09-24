import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { usePolling } from '../lib/usePolling';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';

/** Solo una red de seguridad por si se corta Realtime; lo normal es enterarse por los eventos. */
const FALLBACK_POLL_MS = 5 * 60_000;

/**
 * Contadores de los badges de la sidebar. Dos `count` baratos que se refrescan cuando cambia
 * una cochera o un ticket (Realtime, 0060), en vez de pedirlos cada 20 s.
 */
export function usePendingCounts(): { pendingLots: number; openTickets: number } {
  const [counts, setCounts] = useState({ pendingLots: 0, openTickets: 0 });

  const load = useCallback(async () => {
    if (!supabase) return;
    const [lots, tickets] = await Promise.all([
      supabase
        .from('parking_lots')
        .select('id', { count: 'exact', head: true })
        .eq('approval_status', 'pending'),
      supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ]);
    setCounts({ pendingLots: lots.count ?? 0, openTickets: tickets.count ?? 0 });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh('admin-pending-counts', ['parking_lots', 'support_tickets'], () => void load());
  usePolling(() => void load(), FALLBACK_POLL_MS);

  return counts;
}
