import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Text } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Screen } from '@/components/ui/Screen';
import { ConversationListItem } from '@/features/messaging/ConversationListItem';
import { listOwnerConversations } from '@/features/messaging/api';
import type { ConversationThread } from '@/features/messaging/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function OwnerMessagesScreen() {
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
    listOwnerConversations(profile.id)
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
          Tus conversaciones con clientes van a aparecer acá cuando recibas una reserva.
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
                pathname: '/(owner)/messages/[bookingId]',
                params: { bookingId: item.bookingId, title: item.otherPartyName },
              })
            }
          />
        )}
      />
    </Screen>
  );
}
