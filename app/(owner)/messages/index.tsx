import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Text } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ConversationListItem } from '@/features/messaging/ConversationListItem';
import { listOwnerConversations } from '@/features/messaging/api';
import { listUnreadMessageNotifications } from '@/features/notifications/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function OwnerMessagesScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;

  const {
    data = { threads: [], unreadBookingIds: new Set<string>() },
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.messaging.ownerThreads(userId ?? ''),
    queryFn: async () => {
      const [threads, unreadNotifications] = await Promise.all([
        listOwnerConversations(userId as string),
        listUnreadMessageNotifications(userId as string, 'owner'),
      ]);
      return {
        threads,
        unreadBookingIds: new Set(
          unreadNotifications.map((n) => n.relatedBookingId).filter((id): id is string => id !== null)
        ),
      };
    },
    enabled: Boolean(userId),
  });
  const { threads, unreadBookingIds } = data;

  // Un mensaje nuevo puede llegar mientras se estaba en otra pestaña: el refetch al enfocar
  // trae el hilo actualizado sin depender de una suscripción realtime en esta lista.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch])
  );

  const errorMessage = isError ? 'No se pudieron cargar tus mensajes.' : null;

  return (
    <Screen>
      <ScreenHeader title="Mensajes" />

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && threads.length === 0 && !errorMessage ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          Tus conversaciones con clientes van a aparecer acá cuando recibas una reserva.
        </Text>
      ) : null}

      <FlatList
        data={threads}
        keyExtractor={(item) => item.threadKey}
        refreshing={isLoading}
        onRefresh={refetch}
        renderItem={({ item }) => (
          <ConversationListItem
            thread={item}
            // Un hilo agrupa varias reservas: alcanza con que cualquiera tenga mensajes sin leer.
            hasUnread={item.bookingIds.some((id) => unreadBookingIds.has(id))}
            onPress={() =>
              router.push({
                pathname: '/(owner)/messages/[lotId]',
                params: { lotId: item.parkingLotId, peerId: item.peerId, title: item.otherPartyName },
              })
            }
          />
        )}
      />
    </Screen>
  );
}
