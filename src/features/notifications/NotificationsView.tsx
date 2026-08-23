import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, View, Text } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { LinkText } from '@/components/ui/LinkText';
import { Screen } from '@/components/ui/Screen';
import { NotificationListItem } from '@/features/notifications/NotificationListItem';
import {
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotifications,
} from '@/features/notifications/api';
import type { AppNotification } from '@/features/notifications/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export function NotificationsView() {
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const handlePress = (notification: AppNotification) => {
    if (notification.read) return;
    setNotifications((current) => current.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
    markNotificationAsRead(notification.id).catch(() => load());
  };

  const handleMarkAllAsRead = () => {
    if (!profile) return;
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
    markAllNotificationsAsRead(profile.id).catch(() => load());
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <Text style={[typography.displayLarge, { color: colors.onBackground, flex: 1 }]}>Notificaciones</Text>
        {hasUnread ? <LinkText label="Marcar todas como leídas" onPress={handleMarkAllAsRead} /> : null}
      </View>

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
        renderItem={({ item }) => <NotificationListItem notification={item} onPress={() => handlePress(item)} />}
      />
    </Screen>
  );
}
