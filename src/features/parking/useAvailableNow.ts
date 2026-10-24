import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';

import { getLotsAvailableNow } from './api';

const REFRESH_MS = 60_000;

/**
 * Mapa id → "disponible ahora" para las cocheras que se muestran, que se vuelve a pedir cada
 * minuto: una cochera puede cerrar o llenarse mientras el mapa está abierto.
 *
 * Si la consulta falla (por ejemplo, la migración 0073 todavía no se corrió) devuelve un mapa vacío,
 * y el mapa pinta todas las cocheras como siempre: sin dato no se marca ninguna como "cerrada".
 */
export function useAvailableNow(lotIds: string[]): Record<string, boolean> {
  const idsKey = [...lotIds].sort().join(',');

  const { data } = useQuery({
    queryKey: queryKeys.parkingLots.availableNow(idsKey),
    queryFn: () => getLotsAvailableNow(lotIds),
    enabled: lotIds.length > 0,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
  });

  return data ?? {};
}
