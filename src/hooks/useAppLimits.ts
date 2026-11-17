import { useQuery } from '@tanstack/react-query';

import { appLimits, fetchAppLimits, type AppLimits } from '@/lib/appLimits';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Límites configurados en el panel (0093). Devuelve siempre un valor: mientras carga, o si la
 * consulta falla, los vigentes (al principio, los de siempre). Se vuelven a pedir cada 5 minutos
 * como mucho, y al abrir la app.
 */
export function useAppLimits(): AppLimits {
  const query = useQuery({
    queryKey: queryKeys.appLimits,
    queryFn: fetchAppLimits,
    staleTime: 5 * 60_000,
  });
  return query.data ?? appLimits();
}
