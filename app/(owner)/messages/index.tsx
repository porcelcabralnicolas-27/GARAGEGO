import { useRouter } from 'expo-router';
import { FlatList, Text } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ConversationListItem } from '@/features/messaging/ConversationListItem';
import { useConversations } from '@/features/messaging/useConversations';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function OwnerMessagesScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const { threads, unreadBookingIds, isLoading, isError, refetch, loadMore, isFetchingMore } = useConversations(
    profile?.id,
    'owner'
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
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={<LoadMoreFooter isFetching={isFetchingMore} />}
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
