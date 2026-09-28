import { useEffect, useRef } from 'react';

import { supabase } from './supabase';

/** Cambios que llegan casi juntos (un trigger que toca dos filas) disparan una sola recarga. */
const DEBOUNCE_MS = 500;

/**
 * Llama a `onChange` cuando cambia cualquier fila de las tablas indicadas (Supabase Realtime,
 * migración 0060). Pensado para refrescar contadores y listas del panel en vez de pedirlos cada
 * pocos segundos. Realtime aplica la RLS del admin, que puede leer estas tablas.
 */
let channelSeq = 0;

export function useRealtimeRefresh(channelName: string, tables: string[], onChange: () => void): void {
  const savedOnChange = useRef(onChange);
  savedOnChange.current = onChange;
  const tablesKey = tables.join(',');
  // Sufijo único por instancia: dos componentes pueden llamar el hook con el mismo `channelName`
  // lógico (p. ej. AdminLayout y DashboardPage montados a la vez), y Supabase reutiliza el canal
  // por nombre — agregarle un `.on()` a uno ya suscripto tira error y rompe el árbol de React.
  const instanceId = useRef(++channelSeq);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => savedOnChange.current(), DEBOUNCE_MS);
    };

    let channel = client.channel(`${channelName}:${instanceId.current}`);
    for (const table of tablesKey.split(',')) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      client.removeChannel(channel);
    };
  }, [channelName, tablesKey]);
}
