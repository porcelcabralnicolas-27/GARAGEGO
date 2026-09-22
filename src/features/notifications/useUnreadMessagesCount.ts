import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { queryKeys } from '@/lib/queryKeys';

import { countUnreadMessageNotifications, subscribeToMessageNotificationChanges } from './api';
import type { NotificationAudience } from './types';

/**
 * Badge de mensajes sin leer de la pestaña Mensajes.
 *
 * Migrado a React Query (piloto): la clave la comparten las dos barras de pestañas, así que si
 * el usuario cambia de rol o la pantalla se vuelve a montar, el número sale de la cache en vez
 * de pedirse de nuevo. Las acciones de NotificationsView invalidan el grupo `notifications`,
 * que incluye esta query, así que el badge se mantiene en sincronía con la lista.
 */
export function useUnreadMessagesCount(
  userId: string | undefined,
  audience: NotificationAudience
): number {
  const queryClient = useQueryClient();
  const key = queryKeys.notifications.unreadMessages(userId ?? '', audience);

  const { data = 0 } = useQuery({
    queryKey: key,
    queryFn: () => countUnreadMessageNotifications(userId as string, audience),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    if (!userId) return;
    return subscribeToMessageNotificationChanges(userId, audience, {
      // Un mensaje nuevo se suma directo sobre la cache: no hace falta ir a contar de nuevo.
      onInsert: () => queryClient.setQueryData<number>(key, (current = 0) => current + 1),
      // Leer o borrar puede afectar a varias notificaciones a la vez, así que se recuenta.
      onRead: () => queryClient.invalidateQueries({ queryKey: key }),
      onDelete: () => queryClient.invalidateQueries({ queryKey: key }),
    });
    // `key` se deriva de userId y audience, que ya están en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, audience, queryClient]);

  return data;
}
