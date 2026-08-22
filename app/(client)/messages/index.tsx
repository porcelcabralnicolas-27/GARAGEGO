import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Text } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Screen } from '@/components/ui/Screen';
import { ConversationListItem } from '@/features/messaging/ConversationListItem';
import { listClientConversations } from '@/features/messaging/api';
import type { ConversationThread } from '@/features/messaging/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function ClientMessagesScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);

  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    listClientConversations(profile.id)
      .then(setThreads)
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
      <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 16 }]}>Mensajes</Text>

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && threads.length === 0 && !errorMessage ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          Tus conversaciones con propietarios van a aparecer acá cuando hagas una reserva.
        </Text>
      ) : null}

      <FlatList
        data={threads}
        keyExtractor={(item) => item.bookingId}
        refreshing={isLoading}
        onRefresh={load}
        renderItem={({ item }) => (
          <ConversationListItem
            thread={item}
            onPress={() =>
              router.push({
                pathname: '/(client)/messages/[bookingId]',
                params: { bookingId: item.bookingId, title: item.otherPartyName },
              })
            }
          />
        )}
      />
    </Screen>
  );
}
