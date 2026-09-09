import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

/**
 * Contadores de los badges de la sidebar, con datos reales. Dos `count` baratos, refrescados
 * cada 20 s para que sigan al día mientras el equipo trabaja. (Inventario y Soporte ya no son
 * mock; el selector `selectPendingCounts` que se usaba antes leía el estado simulado.)
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
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  return counts;
}
