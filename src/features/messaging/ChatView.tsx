import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import type { Href } from 'expo-router';

import { BackButton } from '@/components/ui/BackButton';
import { Banner } from '@/components/ui/Banner';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import {
  getMessagingErrorMessage,
  getThreadMessagesPage,
  resolveThread,
  sendThreadMessage,
  subscribeToThreadMessages,
  threadKeyOf,
} from '@/features/messaging/api';
import { markMessageNotificationsAsRead } from '@/features/notifications/api';
import type { Message, ThreadRole } from '@/features/messaging/types';
import { appendNewest, newestFirst, type MessageCursor, type Page } from '@/lib/pagination';
import { queryKeys } from '@/lib/queryKeys';
import { addDays, businessDate, formatDate, formatTime } from '@/lib/time';
import { radius, spacing, useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';

type ChatViewProps = {
  parkingLotId: string;
  peerId: string;
  role: ThreadRole;
  userId: string;
  title: string;
  /** Estacionamiento al que pertenece la conversación; se muestra debajo del nombre. */
  lotName?: string;
  backHref: Href;
};

/** Cada mensaje, precedido por la fecha cuando arranca un día distinto al del mensaje anterior. */
type ChatRow = { kind: 'day'; key: string; label: string } | { kind: 'message'; key: string; message: Message };

function formatDayLabel(iso: string): string {
  const day = businessDate(iso);
  const today = businessDate();
  if (day === today) return 'Hoy';
  if (day === addDays(today, -1)) return 'Ayer';
  return formatDate(iso);
}

function buildRows(messages: Message[]): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDay: string | null = null;

  for (const message of messages) {
    const day = businessDate(message.createdAt);
    if (day !== lastDay) {
      rows.push({ kind: 'day', key: `day-${day}`, label: formatDayLabel(message.createdAt) });
      lastDay = day;
    }
    rows.push({ kind: 'message', key: message.id, message });
  }

  return rows;
}

type MessagePages = InfiniteData<Page<Message, MessageCursor>, MessageCursor | null>;

export function ChatView({ parkingLotId, peerId, role, userId, title, lotName, backHref }: ChatViewProps) {
  const { colors, typography } = useTheme();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const thread = useMemo(() => ({ parkingLotId, peerId, role }), [parkingLotId, peerId, role]);
  const threadKey = useMemo(
    () => queryKeys.messaging.thread(userId, role, parkingLotId, peerId),
    [userId, role, parkingLotId, peerId]
  );

  // Con el chat cerrado no hay suscripción, así que lo que haya en cache puede estar incompleto:
  // al volver a entrar se muestra al instante y se completa con un refetch (staleTime 0).
  const threadQuery = useQuery({
    queryKey: threadKey,
    queryFn: () => resolveThread(thread, userId),
    staleTime: 0,
  });
  const bookingIds = threadQuery.data?.bookingIds;
  const anchorBookingId = threadQuery.data?.anchorBookingId ?? null;
  // Como string para que la suscripción se rehaga solo si cambian las reservas del hilo, no
  // con cada mensaje nuevo que entra a la cache.
  const bookingIdsKey = bookingIds?.join(',');

  // Los mensajes se paginan hacia atrás: primero los más recientes, y los anteriores al subir.
  // La clave depende de las reservas del hilo: si se suma una reserva nueva, es otro listado.
  const messagesKey = useMemo(() => queryKeys.messaging.threadMessages(bookingIds ?? []), [bookingIds]);
  const messagesQuery = useInfiniteQuery({
    queryKey: messagesKey,
    queryFn: ({ pageParam }) => getThreadMessagesPage(bookingIds ?? [], pageParam),
    initialPageParam: null as MessageCursor | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: bookingIds !== undefined,
    staleTime: 0,
  });

  useEffect(() => {
    if (bookingIdsKey === undefined) return;
    const ids = bookingIdsKey ? bookingIdsKey.split(',') : [];
    const key = queryKeys.messaging.threadMessages(ids);

    markMessageNotificationsAsRead(userId, ids).catch(() => {});

    return subscribeToThreadMessages(
      threadKeyOf(parkingLotId, peerId),
      ids,
      (message) => {
        queryClient.setQueryData<MessagePages>(key, (current) => appendNewest(current, message));
        // Estando dentro del chat, un mensaje entrante no debería dejar el badge encendido.
        if (message.senderId !== userId) {
          markMessageNotificationsAsRead(userId, ids).catch(() => {});
        }
      },
      async (unknownBookingId) => {
        // Puede ser una reserva nueva de este mismo hilo (el usuario volvió a reservar acá). Al
        // refrescar cambian las reservas y este efecto se vuelve a suscribir con la lista nueva.
        const next = await resolveThread(thread, userId).catch(() => null);
        if (next?.bookingIds.includes(unknownBookingId)) {
          queryClient.invalidateQueries({ queryKey: threadKey });
        }
      }
    );
  }, [bookingIdsKey, thread, parkingLotId, peerId, userId, queryClient, threadKey]);

  // Filas en orden cronológico (con separador de día) y después invertidas: la lista es
  // `inverted`, así el mensaje más nuevo queda abajo sin scrollear a mano.
  const messages = useMemo(() => [...newestFirst(messagesQuery.data)].reverse(), [messagesQuery.data]);
  const rows = useMemo(() => buildRows(messages).reverse(), [messages]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || isSending) return;
    setIsSending(true);
    setErrorMessage(null);
    setDraft('');
    try {
      const message = await sendThreadMessage({ thread, userId, content, anchorBookingId });
      queryClient.setQueryData<MessagePages>(messagesKey, (current) => appendNewest(current, message));
    } catch (error) {
      setErrorMessage(`No se pudo enviar el mensaje: ${getMessagingErrorMessage(error)}`);
      setDraft(content);
    } finally {
      setIsSending(false);
    }
  };

  const data = threadQuery.data;
  const isLoading = threadQuery.isLoading || messagesQuery.isLoading;
  const loadError = threadQuery.error ?? messagesQuery.error;
  const canWrite = anchorBookingId !== null;
  const visibleError = errorMessage ?? (loadError ? getMessagingErrorMessage(loadError) : null);

  return (
    <Screen>
      <BackButton href={backHref} />
      <Text
        style={[typography.titleLarge, { color: colors.onBackground, marginBottom: lotName ? 2 : 12 }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      {lotName ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 12 }]} numberOfLines={1}>
          {lotName}
        </Text>
      ) : null}

      {visibleError ? <Banner message={visibleError} /> : null}
      {data && !canWrite ? <Banner message="Esta conversación ya no tiene reservas asociadas." /> : null}

      {/* automaticOffset mide dónde está la vista en pantalla (título arriba, tab bar abajo) y
          sube el input justo hasta el borde del teclado, en Android y en iOS. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding" automaticOffset>
        {!isLoading && messages.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 12 }]}>
            Todavía no hay mensajes. Escribí el primero.
          </Text>
        ) : null}

        <FlatList
          inverted
          data={rows}
          keyExtractor={(item) => item.key}
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onEndReached={() => {
            if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) messagesQuery.fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={<LoadMoreFooter isFetching={messagesQuery.isFetchingNextPage} />}
          renderItem={({ item }) => {
            if (item.kind === 'day') {
              return (
                <View style={styles.dayRow}>
                  <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{item.label}</Text>
                </View>
              );
            }

            const isMine = item.message.senderId === userId;
            return (
              <View style={[styles.bubbleRow, { justifyContent: isMine ? 'flex-end' : 'flex-start' }]}>
                <View style={[styles.bubble, { backgroundColor: isMine ? colors.primary : colors.surfaceVariant }]}>
                  <Text style={[typography.bodyMedium, { color: isMine ? colors.onPrimary : colors.onSurface }]}>
                    {item.message.content}
                  </Text>
                  <Text
                    style={[
                      typography.label,
                      styles.timestamp,
                      { color: isMine ? colors.onPrimary : colors.onSurfaceVariant },
                    ]}
                  >
                    {formatTime(item.message.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View style={styles.inputRow}>
          <View style={styles.inputField}>
            <TextField
              label=""
              placeholder="Escribí un mensaje…"
              value={draft}
              onChangeText={setDraft}
              editable={canWrite}
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={isSending || !canWrite || draft.trim().length === 0}
            style={[styles.sendButton, { backgroundColor: colors.primary, opacity: isSending || !canWrite ? 0.6 : 1 }]}
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
  dayRow: {
    alignItems: 'center',
    marginVertical: 10,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  timestamp: {
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
