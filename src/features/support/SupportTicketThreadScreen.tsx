import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { markTicketNotificationsAsRead } from '@/features/notifications/api';
import {
  getSupportErrorMessage,
  getTicket,
  getTicketMessages,
  sendTicketMessage,
  subscribeToTicketMessages,
} from '@/features/support/api';
import {
  TICKET_CATEGORY_LABELS,
  type ReporterRole,
  type SupportMessage,
  type SupportTicket,
} from '@/features/support/types';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, spacing, useTheme } from '@/theme';

const LIST_HREF = {
  client: '/(client)/profile/support',
  owner: '/(owner)/profile/support',
} as const;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SupportTicketThreadScreen({
  role,
  ticketId,
}: {
  role: ReporterRole;
  ticketId: string;
}) {
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const listRef = useRef<FlatList<SupportMessage>>(null);

  const load = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([getTicket(ticketId), getTicketMessages(ticketId)]);
      setTicket(t);
      setMessages(m);
    } catch (error) {
      setErrorMessage(getSupportErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeToTicketMessages(ticketId, (message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      if (message.authorRole === 'admin') {
        // Puede haber cambiado el estado (reabierto no aplica acá) o llegado una respuesta.
        getTicket(ticketId).then(setTicket).catch(() => {});
      }
    });
    return unsubscribe;
  }, [ticketId, load]);

  // Al abrir (y al volver a enfocar) se marcan como leídas las notificaciones de este ticket.
  useFocusEffect(
    useCallback(() => {
      if (profile) void markTicketNotificationsAsRead(profile.id, ticketId).catch(() => {});
    }, [profile, ticketId])
  );

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!profile || !body || isSending) return;
    setIsSending(true);
    setErrorMessage(null);
    setDraft('');
    try {
      const message = await sendTicketMessage({ ticketId, authorId: profile.id, body });
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      if (ticket?.status === 'resolved') setTicket({ ...ticket, status: 'open' });
    } catch (error) {
      setErrorMessage(`No se pudo enviar: ${getSupportErrorMessage(error)}`);
      setDraft(body);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title={ticket ? ticket.code : 'Consulta'} backHref={LIST_HREF[role]} />

      {errorMessage ? <Banner message={errorMessage} /> : null}

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

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.flex}
          contentContainerStyle={{ paddingVertical: spacing.md }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
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
                    {formatTime(item.createdAt)}
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
