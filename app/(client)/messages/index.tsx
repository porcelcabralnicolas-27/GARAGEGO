import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Text } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ConversationListItem } from '@/features/messaging/ConversationListItem';
import { listClientConversations } from '@/features/messaging/api';
import type { ConversationThread } from '@/features/messaging/types';
import { listUnreadMessageNotifications } from '@/features/notifications/api';
import { useAuthStore } from '@/store/useAuthStore';

export default function ClientMessagesScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);

  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [unreadBookingIds, setUnreadBookingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    Promise.all([listClientConversations(profile.id), listUnreadMessageNotifications(profile.id)])
      .then(([threadsResult, unreadNotifications]) => {
        setThreads(threadsResult);
        setUnreadBookingIds(new Set(unreadNotifications.map((n) => n.relatedBookingId).filter((id): id is string => id !== null)));
      })
      .catch(() => setErrorMessage('No se pudieron cargar tus mensajes.'))
      .finally(() => setIsLoading(false));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <ScreenHeader title="Mensajes" />

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && threads.length === 0 && !errorMessage ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No tenés conversaciones"
          description="Tus chats con los propietarios van a aparecer acá cuando hagas una reserva."
        />
      ) : null}

      <FlatList
        data={threads}
        keyExtractor={(item) => item.threadKey}
        refreshing={isLoading}
        onRefresh={load}
        renderItem={({ item }) => (
          <ConversationListItem
            thread={item}
            // Un hilo agrupa varias reservas: alcanza con que cualquiera tenga mensajes sin leer.
            hasUnread={item.bookingIds.some((id) => unreadBookingIds.has(id))}
            onPress={() =>
              router.push({
                pathname: '/(client)/messages/[lotId]',
                params: { lotId: item.parkingLotId, peerId: item.peerId, title: item.otherPartyName },
              })
            }
          />
        )}
      />
    </Screen>
  );
}
