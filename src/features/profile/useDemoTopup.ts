import { useQuery } from '@tanstack/react-query';

import { isDemoTopupEnabled } from '@/features/profile/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Montos de la recarga de prueba, iguales en el perfil y en el pago. El servidor acepta hasta
 * $50.000 por recarga y $200.000 de saldo total (migración 0074).
 */
export const DEMO_TOPUP_AMOUNTS = [5000, 10000, 20000];

/**
 * Si se muestran los botones de recarga de prueba. Solo se esconden cuando el servidor dice
 * explícitamente que está apagada en este entorno: mientras carga, o si la consulta falla, se
 * muestran (y si estuviera apagada, el servidor rechaza la recarga con `topup_disabled`).
 */
export function useDemoTopupEnabled(): boolean {
  const { data } = useQuery({
    queryKey: queryKeys.settings.demoTopup,
    queryFn: isDemoTopupEnabled,
    staleTime: 5 * 60_000,
  });
  return data !== false;
}
