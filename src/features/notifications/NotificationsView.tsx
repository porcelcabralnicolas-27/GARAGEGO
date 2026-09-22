import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkText } from '@/components/ui/LinkText';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { getThreadRefForBooking } from '@/features/messaging/api';
import { NotificationListItem } from '@/features/notifications/NotificationListItem';
import {
  deleteAllNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotifications,
} from '@/features/notifications/api';
import type { AppNotification } from '@/features/notifications/types';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';

export function NotificationsView({ role }: { role: 'client' | 'owner' }) {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const userId = profile?.id;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmingDeleteAll, setIsConfirmingDeleteAll] = useState(false);

  const listKey = queryKeys.notifications.list(userId ?? '', role);

  const {
    data: notifications = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: listKey,
    queryFn: () => listNotifications(userId as string, role),
    // Sin usuario no hay nada que pedir; React Query deja la query en pausa.
    enabled: Boolean(userId),
  });

  // Realtime: en vez de recargar toda la lista con cada aviso, se mete la notificación nueva
  // directo en la cache. Es el equivalente al `setNotifications([nueva, ...])` de antes.
  useEffect(() => {
    if (!userId) return;
    return subscribeToNotifications(userId, role, (notification) => {
      queryClient.setQueryData<AppNotification[]>(listKey, (current = []) => [notification, ...current]);
    });
    // listKey se arma con userId y role, así que sus dos dependencias ya están acá.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role, queryClient]);

  /**
   * Devuelve los callbacks de una mutación optimista sobre la lista: el cambio se ve al toque
   * y, si el servidor lo rechaza, la lista vuelve a como estaba.
   *
   * `onMutate` cancela los refetch en curso (si no, una respuesta vieja en vuelo pisaría el
   * cambio recién aplicado), guarda la lista anterior y aplica el cambio sobre la cache.
   * `onError` restaura lo guardado. `onSettled` invalida todo el grupo `notifications` para que
   * el badge de la pestaña Mensajes, que es otra query, no quede desfasado.
   */
  function optimisticList<TVariables>(
    update: (current: AppNotification[], variables: TVariables) => AppNotification[],
    errorText: string
  ) {
    return {
      onMutate: async (variables: TVariables) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData<AppNotification[]>(listKey);
        queryClient.setQueryData<AppNotification[]>(listKey, (current = []) => update(current, variables));
        return { previous };
      },
      onError: (_error: unknown, _variables: TVariables, context: { previous?: AppNotification[] } | undefined) => {
        if (context?.previous) queryClient.setQueryData(listKey, context.previous);
        setErrorMessage(errorText);
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      },
    };
  }

  const markAsRead = useMutation({
    mutationFn: (notification: AppNotification) => markNotificationAsRead(notification.id),
    ...optimisticList<AppNotification>(
      (current, notification) => current.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      'No se pudo marcar como leída.'
    ),
  });

  const markAllAsRead = useMutation({
    mutationFn: () => markAllNotificationsAsRead(userId as string, role),
    ...optimisticList<void>(
      (current) => current.map((n) => ({ ...n, read: true })),
      'No se pudieron marcar como leídas.'
    ),
  });

  const removeOne = useMutation({
    mutationFn: (notification: AppNotification) => deleteNotification(notification.id),
    ...optimisticList<AppNotification>(
      (current, notification) => current.filter((n) => n.id !== notification.id),
      'No se pudo borrar la notificación.'
    ),
  });

  const removeAll = useMutation({
    mutationFn: () => deleteAllNotifications(userId as string, role),
    onSuccess: () => {
      queryClient.setQueryData<AppNotification[]>(listKey, []);
      setIsConfirmingDeleteAll(false);
    },
    onError: () => {
      setErrorMessage('No se pudieron borrar las notificaciones.');
      setIsConfirmingDeleteAll(false);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });

  const hasUnread = notifications.some((n) => !n.read);
  const visibleError = errorMessage ?? (isError ? 'No se pudieron cargar tus notificaciones.' : null);

  /** Lleva a la sección que corresponde según el tipo de notificación. */
  const navigateTo = async (notification: AppNotification) => {
    if (notification.type === 'new_message') {
      if (!notification.relatedBookingId) return;
      // La notificación apunta a una reserva, pero el chat se agrupa por estacionamiento:
      // hay que traducir la reserva a su conversación.
      const thread = await getThreadRefForBooking(notification.relatedBookingId, role).catch(() => null);
      if (!thread) return;
      router.push({
        pathname: role === 'client' ? '/(client)/messages/[lotId]' : '/(owner)/messages/[lotId]',
        params: { lotId: thread.parkingLotId, peerId: thread.peerId, title: thread.title },
      });
      return;
    }

    // Revisión de una publicación por el equipo: lleva a "Mis publicaciones", donde el
    // propietario ve el estado y puede editar para reenviar a revisión.
    if (notification.type.startsWith('listing_')) {
      router.push('/(owner)/parkings');
      return;
    }

    // Soporte: abre el hilo del ticket.
    if (notification.type.startsWith('support_') && notification.relatedTicketId) {
      router.push({
        pathname:
          role === 'client'
            ? '/(client)/profile/support/[id]'
            : '/(owner)/profile/support/[id]',
        params: { id: notification.relatedTicketId },
      });
      return;
    }

    // Las notificaciones de reserva (pago, inicio, finalización, excedente) llevan al detalle
    // de esa reserva, que es donde está la acción. El propietario no tiene pantalla de detalle,
    // así que para él sigue siendo la lista.
    if (role === 'client' && notification.relatedBookingId) {
      router.push({
        pathname: '/(client)/bookings/[id]',
        params: { id: notification.relatedBookingId },
      });
      return;
    }

    router.push(role === 'client' ? '/(client)/bookings' : '/(owner)/bookings');
  };

  const handlePress = (notification: AppNotification) => {
    setErrorMessage(null);
    if (!notification.read) markAsRead.mutate(notification);
    navigateTo(notification).catch(() => {});
  };

  return (
    <Screen>
      <ScreenHeader title="Notificaciones" />

      {notifications.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
          {hasUnread ? (
            <LinkText
              label="Marcar todas como leídas"
              onPress={() => {
                setErrorMessage(null);
                markAllAsRead.mutate();
              }}
            />
          ) : null}
          <LinkText label="Borrar todas" onPress={() => setIsConfirmingDeleteAll(true)} />
        </View>
      ) : null}

      {visibleError ? <Banner message={visibleError} /> : null}

      {!isLoading && notifications.length === 0 && !visibleError ? (
        <EmptyState
          icon="notifications-outline"
          title="No tenés notificaciones"
          description="Acá vas a ver las novedades sobre tus reservas y mensajes."
        />
      ) : null}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={() => {
          setErrorMessage(null);
          refetch();
        }}
        renderItem={({ item }) => (
          <NotificationListItem
            notification={item}
            onPress={() => handlePress(item)}
            onDelete={() => {
              setErrorMessage(null);
              removeOne.mutate(item);
            }}
          />
        )}
      />

      <ConfirmDialog
        visible={isConfirmingDeleteAll}
        title="Borrar todas las notificaciones"
        message="¿Seguro que querés borrar todas tus notificaciones? Esta acción no se puede deshacer."
        confirmLabel="Borrar todas"
        loading={removeAll.isPending}
        onConfirm={() => {
          setErrorMessage(null);
          removeAll.mutate();
        }}
        onCancel={() => setIsConfirmingDeleteAll(false)}
      />
    </Screen>
  );
}
