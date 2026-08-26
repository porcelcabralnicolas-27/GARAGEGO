import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Href } from 'expo-router';

import { BackHeader } from '@/components/ui/BackHeader';
import { Banner } from '@/components/ui/Banner';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import {
  getMessagingErrorMessage,
  getThreadMessages,
  resolveThread,
  sendThreadMessage,
  subscribeToThreadMessages,
  threadKeyOf,
} from '@/features/messaging/api';
import { markMessageNotificationsAsRead } from '@/features/notifications/api';
import type { Message, ThreadRole } from '@/features/messaging/types';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';

type ChatViewProps = {
  parkingLotId: string;
  peerId: string;
  role: ThreadRole;
  userId: string;
  title: string;
  backHref: Href;
};

/** Cada mensaje, precedido por la fecha cuando arranca un día distinto al del mensaje anterior. */
type ChatRow = { kind: 'day'; key: string; label: string } | { kind: 'message'; key: string; message: Message };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return 'Hoy';
  if (sameDay(date, yesterday)) return 'Ayer';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function buildRows(messages: Message[]): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDay: string | null = null;

  for (const message of messages) {
    const day = new Date(message.createdAt).toDateString();
    if (day !== lastDay) {
      rows.push({ kind: 'day', key: `day-${day}`, label: formatDayLabel(message.createdAt) });
      lastDay = day;
    }
    rows.push({ kind: 'message', key: message.id, message });
  }

  return rows;
}

export function ChatView({ parkingLotId, peerId, role, userId, title, backHref }: ChatViewProps) {
  const { colors, typography } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [anchorBookingId, setAnchorBookingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatRow>>(null);
  // El callback de realtime se registra una sola vez: necesita leer la lista de reservas
  // actualizada, no la que existía al montar.
  const bookingIdsRef = useRef<string[]>([]);

  const thread = useMemo(() => ({ parkingLotId, peerId, role }), [parkingLotId, peerId, role]);

  const applyResolved = useCallback(
    async (bookingIds: string[], anchor: string | null) => {
      bookingIdsRef.current = bookingIds;
      setAnchorBookingId(anchor);
      setMessages(await getThreadMessages(bookingIds));
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        const resolved = await resolveThread(thread, userId);
        if (cancelled) return;

        bookingIdsRef.current = resolved.bookingIds;
        setAnchorBookingId(resolved.anchorBookingId);

        const loaded = await getThreadMessages(resolved.bookingIds);
        if (cancelled) return;
        setMessages(loaded);

        markMessageNotificationsAsRead(userId, resolved.bookingIds).catch(() => {});

        unsubscribe = subscribeToThreadMessages(
          threadKeyOf(parkingLotId, peerId),
          resolved.bookingIds,
          (message) => {
            setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
            // Estando dentro del chat, un mensaje entrante no debería dejar el badge encendido.
            if (message.senderId !== userId) {
              markMessageNotificationsAsRead(userId, bookingIdsRef.current).catch(() => {});
            }
          },
          async (unknownBookingId) => {
            // Puede ser una reserva nueva de este mismo hilo (el usuario volvió a reservar acá).
            const next = await resolveThread(thread, userId).catch(() => null);
            if (!next || !next.bookingIds.includes(unknownBookingId)) return;
            await applyResolved(next.bookingIds, next.anchorBookingId);
          }
        );
      } catch (error) {
        if (!cancelled) setErrorMessage(getMessagingErrorMessage(error));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [thread, parkingLotId, peerId, userId, applyResolved]);

  const rows = useMemo(() => buildRows(messages), [messages]);

  useEffect(() => {
    if (rows.length > 0) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [rows.length]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || isSending) return;
    setIsSending(true);
    setErrorMessage(null);
    setDraft('');
    try {
      const message = await sendThreadMessage({ thread, userId, content, anchorBookingId });
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    } catch (error) {
      setErrorMessage(`No se pudo enviar el mensaje: ${getMessagingErrorMessage(error)}`);
      setDraft(content);
    } finally {
      setIsSending(false);
    }
  };

  const canWrite = anchorBookingId !== null;

  return (
    <Screen>
      <BackHeader href={backHref} />
      <Text style={[typography.titleLarge, { color: colors.onBackground, marginBottom: 12 }]} numberOfLines={1}>
        {title}
      </Text>

      {errorMessage ? <Banner message={errorMessage} /> : null}
      {!isLoading && !canWrite ? <Banner message="Esta conversación ya no tiene reservas asociadas." /> : null}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!isLoading && messages.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 12 }]}>
            Todavía no hay mensajes. Escribí el primero.
          </Text>
        ) : null}

        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(item) => item.key}
          style={styles.flex}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
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
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
});
