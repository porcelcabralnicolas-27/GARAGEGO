import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import type { ConversationThread } from '@/features/messaging/types';
import { formatDayMonth } from '@/lib/time';
import { radius, spacing, useTheme } from '@/theme';

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
    <Card onPress={onPress} padding="md" accessibilityLabel={`Chat con ${thread.otherPartyName}`}>
      <View style={styles.row}>
        {hasUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} /> : null}
        <Text style={[typography.titleMedium, { color: colors.onSurface, flex: 1 }]} numberOfLines={1}>
          {thread.otherPartyName}
        </Text>
        <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>
          {thread.lastMessageAt ? formatDayMonth(thread.lastMessageAt) : ''}
        </Text>
      </View>

      <Text
        style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: spacing.xs }]}
        numberOfLines={1}
      >
        {thread.parkingLotName}
      </Text>

      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
        {thread.lastMessage ?? 'Todavía no hay mensajes. Tocá para escribir.'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    marginRight: spacing.sm,
  },
});
