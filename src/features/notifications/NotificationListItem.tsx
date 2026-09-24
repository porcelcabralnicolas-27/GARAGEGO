import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import type { AppNotification } from '@/features/notifications/types';
import { formatDayMonthTime } from '@/lib/time';
import { radius, spacing, useTheme } from '@/theme';

export function NotificationListItem({
  notification,
  onPress,
  onDelete,
}: {
  notification: AppNotification;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { colors, typography } = useTheme();

  return (
    <Card onPress={onPress} padding="md" accessibilityLabel={notification.title}>
      <View style={styles.row}>
        {notification.read ? null : <View style={[styles.dot, { backgroundColor: colors.accent }]} />}

        <Text style={[typography.titleMedium, { color: colors.onSurface, flex: 1 }]} numberOfLines={1}>
          {notification.title}
        </Text>

        <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>
          {formatDayMonthTime(notification.createdAt)}
        </Text>

        <IconButton
          name="trash-outline"
          size={16}
          onPress={onDelete}
          accessibilityLabel={`Borrar notificación: ${notification.title}`}
        />
      </View>

      {notification.description ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginTop: spacing.xs }]}>
          {notification.description}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    marginRight: spacing.sm,
  },
});
