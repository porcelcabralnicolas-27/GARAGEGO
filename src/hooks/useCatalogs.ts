import { useQuery } from '@tanstack/react-query';

import { catalogs, fetchCatalogs, type Catalogs } from '@/lib/catalogs';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Catálogos configurados en el panel (0094). Devuelve siempre un valor: mientras carga, o si la
 * consulta falla, los vigentes (al principio, las listas de siempre).
 */
export function useCatalogs(): Catalogs {
  const query = useQuery({
    queryKey: queryKeys.catalogs,
    queryFn: fetchCatalogs,
    staleTime: 5 * 60_000,
  });
  return query.data ?? catalogs();
}
