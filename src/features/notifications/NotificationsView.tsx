import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, View, Text } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LinkText } from '@/components/ui/LinkText';
import { Screen } from '@/components/ui/Screen';
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
import { useTheme } from '@/theme';

export function NotificationsView({ role }: { role: 'client' | 'owner' }) {
  const router = useRouter();
  const { colors, typography } = useTheme();
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
    listNotifications(profile.id)
      .then(setNotifications)
      .catch(() => setErrorMessage('No se pudieron cargar tus notificaciones.'))
      .finally(() => setIsLoading(false));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!profile) return;
    return subscribeToNotifications(profile.id, (notification) => {
      setNotifications((current) => [notification, ...current]);
    });
  }, [profile]);

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
    markAllNotificationsAsRead(profile.id).catch(() => load());
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
      await deleteAllNotifications(profile.id);
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
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={[typography.displayLarge, { color: colors.onBackground, flex: 1 }]}>Notificaciones</Text>
      </View>

      {notifications.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
          {hasUnread ? <LinkText label="Marcar todas como leídas" onPress={handleMarkAllAsRead} /> : null}
          <LinkText label="Borrar todas" onPress={() => setIsConfirmingDeleteAll(true)} />
        </View>
      ) : null}

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && notifications.length === 0 && !errorMessage ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          Todavía no tenés notificaciones. Acá vas a ver novedades sobre tus reservas.
        </Text>
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
