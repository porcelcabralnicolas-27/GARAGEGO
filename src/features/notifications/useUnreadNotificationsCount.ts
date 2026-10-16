import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { queryKeys } from '@/lib/queryKeys';

import { countUnreadNotifications, subscribeToUnreadChanges } from './api';
import type { NotificationAudience } from './types';

/**
 * Badge de notificaciones sin leer de la pestaña Notificaciones. Cuenta todas las de la lista del
 * rol activo, así el número coincide con lo que se ve y "Marcar todas como leídas" lo deja en cero.
 */
export function useUnreadNotificationsCount(
  userId: string | undefined,
  audience: NotificationAudience
): number {
  const queryClient = useQueryClient();
  const key = queryKeys.notifications.unread(userId ?? '', audience);

  const { data = 0 } = useQuery({
    queryKey: key,
    queryFn: () => countUnreadNotifications(userId as string, audience),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    if (!userId) return;
    return subscribeToUnreadChanges(userId, audience, {
      onInsert: () => queryClient.setQueryData<number>(key, (current = 0) => current + 1),
      onChange: () => queryClient.invalidateQueries({ queryKey: key }),
    });
    // `key` se deriva de userId y audience, que ya están en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, audience, queryClient]);

  return data;
}
