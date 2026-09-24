import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { markTicketNotificationsAsRead } from '@/features/notifications/api';
import {
  getSupportErrorMessage,
  getTicket,
  getTicketMessagesPage,
  sendTicketMessage,
  subscribeToTicketMessages,
} from '@/features/support/api';
import {
  TICKET_CATEGORY_LABELS,
  type ReporterRole,
  type SupportMessage,
  type SupportTicket,
} from '@/features/support/types';
import { appendNewest, newestFirst, type MessageCursor, type Page } from '@/lib/pagination';
import { queryKeys } from '@/lib/queryKeys';
import { formatDayMonthTime } from '@/lib/time';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, spacing, useTheme } from '@/theme';

const LIST_HREF = {
  client: '/(client)/profile/support',
  owner: '/(owner)/profile/support',
} as const;

type MessagePages = InfiniteData<Page<SupportMessage, MessageCursor>, MessageCursor | null>;

export function SupportTicketThreadScreen({
  role,
  ticketId,
}: {
  role: ReporterRole;
  ticketId: string;
}) {
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ticketKey = useMemo(() => queryKeys.tickets.thread(ticketId), [ticketId]);
  const messagesKey = useMemo(() => queryKeys.tickets.messages(ticketId), [ticketId]);

  // Con la pantalla cerrada no hay suscripción, así que lo que haya en cache puede estar
  // incompleto: al volver a entrar se muestra al instante y se completa con un refetch.
  const { data: ticket = null, error: ticketError } = useQuery({
    queryKey: ticketKey,
    queryFn: () => getTicket(ticketId),
    staleTime: 0,
  });

  // Los mensajes se paginan hacia atrás: primero los más recientes, y los anteriores al subir.
  const messagesQuery = useInfiniteQuery({
    queryKey: messagesKey,
    queryFn: ({ pageParam }) => getTicketMessagesPage(ticketId, pageParam),
    initialPageParam: null as MessageCursor | null,
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 0,
  });
  const messages = newestFirst(messagesQuery.data);

  useEffect(() => {
    return subscribeToTicketMessages(ticketId, (message) => {
      queryClient.setQueryData<MessagePages>(messagesKey, (current) => appendNewest(current, message));
      if (message.authorRole === 'admin') {
        // Puede haber cambiado el estado (reabierto no aplica acá) o llegado una respuesta.
        getTicket(ticketId)
          .then((fresh) => queryClient.setQueryData<SupportTicket>(ticketKey, fresh))
          .catch(() => {});
      }
    });
  }, [ticketId, queryClient, ticketKey, messagesKey]);

  // Al abrir (y al volver a enfocar) se marcan como leídas las notificaciones de este ticket.
  useFocusEffect(
    useCallback(() => {
      if (profile) void markTicketNotificationsAsRead(profile.id, ticketId).catch(() => {});
    }, [profile, ticketId])
  );

  const handleSend = async () => {
    const body = draft.trim();
    if (!profile || !body || isSending) return;
    setIsSending(true);
    setErrorMessage(null);
    setDraft('');
    try {
      const message = await sendTicketMessage({ ticketId, authorId: profile.id, body });
      queryClient.setQueryData<MessagePages>(messagesKey, (current) => appendNewest(current, message));
      // Responder un ticket resuelto lo reabre del lado del servidor; se refleja igual acá.
      queryClient.setQueryData<SupportTicket>(ticketKey, (current) =>
        current?.status === 'resolved' ? { ...current, status: 'open' } : current
      );
    } catch (error) {
      setErrorMessage(`No se pudo enviar: ${getSupportErrorMessage(error)}`);
      setDraft(body);
    } finally {
      setIsSending(false);
    }
  };

  const loadError = ticketError ?? messagesQuery.error;
  const visibleError = errorMessage ?? (loadError ? getSupportErrorMessage(loadError) : null);
  const isLoading = messagesQuery.isLoading;

  return (
    <Screen>
      <ScreenHeader title={ticket ? ticket.code : 'Consulta'} backHref={LIST_HREF[role]} />

      {visibleError ? <Banner message={visibleError} /> : null}

      {ticket ? (
        <View style={[styles.header, { borderColor: colors.outline }]}>
          <Text style={[typography.titleMedium, { color: colors.onSurface }]} numberOfLines={2}>
            {ticket.subject}
          </Text>
          <Text style={[typography.label, { color: colors.onSurfaceVariant, marginTop: 2 }]}>
            {TICKET_CATEGORY_LABELS[ticket.category]} ·{' '}
            {ticket.status === 'open' ? 'Abierto' : 'Resuelto'}
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {!isLoading && messages.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
            Todavía no hay mensajes.
          </Text>
        ) : null}

        {/* Invertida: el mensaje más nuevo queda abajo sin tener que scrollear a mano, y al
            llegar arriba de todo se cargan los anteriores. */}
        <FlatList
          inverted
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.flex}
          contentContainerStyle={{ paddingVertical: spacing.md }}
          onEndReached={() => {
            if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) messagesQuery.fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={<LoadMoreFooter isFetching={messagesQuery.isFetchingNextPage} />}
          renderItem={({ item }) => {
            const mine = item.authorRole === 'user';
            return (
              <View style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
                <View
                  style={[
                    styles.bubble,
                    { backgroundColor: mine ? colors.primary : colors.surfaceVariant },
                  ]}
                >
                  {!mine ? (
                    <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 2 }]}>
                      Soporte GarageGo
                    </Text>
                  ) : null}
                  <Text
                    style={[typography.bodyMedium, { color: mine ? colors.onPrimary : colors.onSurface }]}
                  >
                    {item.body}
                  </Text>
                  <Text
                    style={[
                      typography.label,
                      styles.time,
                      { color: mine ? colors.onPrimary : colors.onSurfaceVariant },
                    ]}
                  >
                    {formatDayMonthTime(item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        {ticket?.status === 'resolved' ? (
          <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: spacing.sm }]}>
            Este ticket está resuelto. Si respondés, se vuelve a abrir.
          </Text>
        ) : null}

        <View style={styles.inputRow}>
          <View style={styles.inputField}>
            <TextField
              label=""
              placeholder="Escribí un mensaje…"
              value={draft}
              onChangeText={setDraft}
              multiline
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={isSending || draft.trim().length === 0}
            style={[
              styles.sendButton,
              { backgroundColor: colors.primary, opacity: isSending || draft.trim().length === 0 ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="send" size={18} color={colors.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  time: {
    alignSelf: 'flex-end',
    marginTop: 2,
    opacity: 0.7,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 8,
  },
  inputField: {
    flex: 1,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
});
