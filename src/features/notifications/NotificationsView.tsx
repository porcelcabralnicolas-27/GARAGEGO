import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, View, Text } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkText } from '@/components/ui/LinkText';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
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
import { getThreadRefForBooking } from '@/features/messaging/api';
import { useAuthStore } from '@/store/useAuthStore';

export function NotificationsView({ role }: { role: 'client' | 'owner' }) {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmingDeleteAll, setIsConfirmingDeleteAll] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    listNotifications(profile.id, role)
      .then(setNotifications)
      .catch(() => setErrorMessage('No se pudieron cargar tus notificaciones.'))
      .finally(() => setIsLoading(false));
  }, [profile, role]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!profile) return;
    return subscribeToNotifications(profile.id, role, (notification) => {
      setNotifications((current) => [notification, ...current]);
    });
  }, [profile, role]);

  const hasUnread = notifications.some((n) => !n.read);

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
    if (!notification.read) {
      setNotifications((current) => current.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      markNotificationAsRead(notification.id).catch(() => load());
    }
    navigateTo(notification).catch(() => {});
  };

  const handleMarkAllAsRead = () => {
    if (!profile) return;
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
    markAllNotificationsAsRead(profile.id, role).catch(() => load());
  };

  const handleDelete = (notification: AppNotification) => {
    setNotifications((current) => current.filter((n) => n.id !== notification.id));
    deleteNotification(notification.id).catch(() => {
      setErrorMessage('No se pudo borrar la notificación.');
      load();
    });
  };

  const handleConfirmDeleteAll = async () => {
    if (!profile) return;
    setIsDeletingAll(true);
    try {
      await deleteAllNotifications(profile.id, role);
      setNotifications([]);
      setIsConfirmingDeleteAll(false);
    } catch {
      setErrorMessage('No se pudieron borrar las notificaciones.');
      setIsConfirmingDeleteAll(false);
      load();
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Notificaciones" />

      {notifications.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
          {hasUnread ? <LinkText label="Marcar todas como leídas" onPress={handleMarkAllAsRead} /> : null}
          <LinkText label="Borrar todas" onPress={() => setIsConfirmingDeleteAll(true)} />
        </View>
      ) : null}

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && notifications.length === 0 && !errorMessage ? (
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
        onRefresh={load}
        renderItem={({ item }) => (
          <NotificationListItem
            notification={item}
            onPress={() => handlePress(item)}
            onDelete={() => handleDelete(item)}
          />
        )}
      />

      <ConfirmDialog
        visible={isConfirmingDeleteAll}
        title="Borrar todas las notificaciones"
        message="¿Seguro que querés borrar todas tus notificaciones? Esta acción no se puede deshacer."
        confirmLabel="Borrar todas"
        loading={isDeletingAll}
        onConfirm={handleConfirmDeleteAll}
        onCancel={() => setIsConfirmingDeleteAll(false)}
      />
    </Screen>
  );
}
