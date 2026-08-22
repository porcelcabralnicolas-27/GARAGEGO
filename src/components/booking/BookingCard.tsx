import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BookingStatus } from '@/features/booking/types';
import { BOOKING_STATUS_LABELS } from '@/features/booking/types';
import { useTheme } from '@/theme';

function statusColor(status: BookingStatus, colors: ReturnType<typeof useTheme>['colors']) {
  switch (status) {
    case 'pending':
      return colors.accent;
    case 'confirmed':
      return colors.success;
    case 'cancelled':
      return colors.error;
    case 'completed':
      return colors.onSurfaceVariant;
  }
}

type BookingCardProps = {
  title: string;
  subtitle: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
  actions?: ReactNode;
};

export function BookingCard({ title, subtitle, date, startTime, endTime, totalPrice, status, actions }: BookingCardProps) {
  const { colors, typography } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceVariant, borderColor: colors.outline }]}>
      <View style={styles.headerRow}>
        <Text style={[typography.titleMedium, { color: colors.onSurface, flex: 1 }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[typography.label, { color: statusColor(status, colors) }]}>{BOOKING_STATUS_LABELS[status]}</Text>
      </View>
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
        {subtitle}
      </Text>
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginTop: 4 }]}>
        {date} · {startTime.slice(0, 5)} - {endTime.slice(0, 5)}
      </Text>
      <Text style={[typography.titleMedium, { color: colors.accent, marginTop: 4 }]}>${totalPrice.toFixed(2)}</Text>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
});
