import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppNotification } from '@/features/notifications/types';
import { useTheme } from '@/theme';

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

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
    <Pressable
      onPress={onPress}
      style={[
        styles.container,
        {
          backgroundColor: notification.read ? colors.surfaceVariant : colors.surface,
          borderColor: notification.read ? colors.outline : colors.accent,
        },
      ]}
    >
      <View style={styles.row}>
        {notification.read ? null : <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
        <Text style={[typography.titleMedium, { color: colors.onSurface, flex: 1 }]} numberOfLines={1}>
          {notification.title}
        </Text>
        <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{formatTime(notification.createdAt)}</Text>
        <Pressable onPress={onDelete} hitSlop={8} style={styles.deleteButton}>
          <Ionicons name="trash" size={16} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>
      {notification.description ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginTop: 4 }]}>{notification.description}</Text>
      ) : null}
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
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  deleteButton: {
    marginLeft: 12,
  },
});
