import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Href } from 'expo-router';

import { BackHeader } from '@/components/ui/BackHeader';
import { Banner } from '@/components/ui/Banner';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { getMessages, sendMessage, subscribeToMessages } from '@/features/messaging/api';
import type { Message } from '@/features/messaging/types';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';

type ChatViewProps = {
  bookingId: string;
  userId: string;
  title: string;
  backHref: Href;
};

export function ChatView({ bookingId, userId, title, backHref }: ChatViewProps) {
  const { colors, typography } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    getMessages(bookingId)
      .then(setMessages)
      .catch(() => setErrorMessage('No se pudieron cargar los mensajes.'))
      .finally(() => setIsLoading(false));

    const unsubscribe = subscribeToMessages(bookingId, (message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });
    return unsubscribe;
  }, [bookingId]);

  useEffect(() => {
    if (messages.length > 0) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || isSending) return;
    setIsSending(true);
    setErrorMessage(null);
    setDraft('');
    try {
      const message = await sendMessage({ bookingId, senderId: userId, content });
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    } catch {
      setErrorMessage('No se pudo enviar el mensaje.');
      setDraft(content);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Screen>
      <BackHeader href={backHref} />
      <Text style={[typography.titleLarge, { color: colors.onBackground, marginBottom: 12 }]} numberOfLines={1}>
        {title}
      </Text>

      {errorMessage ? <Banner message={errorMessage} /> : null}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!isLoading && messages.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 12 }]}>
            Todavía no hay mensajes. Escribí el primero.
          </Text>
        ) : null}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.flex}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMine = item.senderId === userId;
            return (
              <View style={[styles.bubbleRow, { justifyContent: isMine ? 'flex-end' : 'flex-start' }]}>
                <View
                  style={[
                    styles.bubble,
                    { backgroundColor: isMine ? colors.primary : colors.surfaceVariant },
                  ]}
                >
                  <Text style={[typography.bodyMedium, { color: isMine ? colors.onPrimary : colors.onSurface }]}>
                    {item.content}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View style={styles.inputRow}>
          <View style={styles.inputField}>
            <TextField label="" placeholder="Escribí un mensaje…" value={draft} onChangeText={setDraft} />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={isSending || draft.trim().length === 0}
            style={[styles.sendButton, { backgroundColor: colors.primary, opacity: isSending ? 0.6 : 1 }]}
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
