import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ConversationThread } from '@/features/messaging/types';
import { useTheme } from '@/theme';

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export function ConversationListItem({
  thread,
  hasUnread,
  onPress,
}: {
  thread: ConversationThread;
  hasUnread?: boolean;
  onPress: () => void;
}) {
  const { colors, typography } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, { backgroundColor: colors.surfaceVariant, borderColor: colors.outline }]}
    >
      <View style={styles.row}>
        {hasUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} /> : null}
        <Text style={[typography.titleMedium, { color: colors.onSurface, flex: 1 }]} numberOfLines={1}>
          {thread.otherPartyName}
        </Text>
        <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{formatTime(thread.lastMessageAt)}</Text>
      </View>
      <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 4 }]} numberOfLines={1}>
        {thread.parkingLotName}
      </Text>
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
        {thread.lastMessage ?? 'Todavía no hay mensajes. Tocá para escribir.'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
});
