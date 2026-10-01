import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { formatMoney } from '@/lib/money';
import type { BookingStatus } from '@/features/booking/types';
import { BOOKING_STATUS_LABELS } from '@/features/booking/types';
import { spacing, useTheme } from '@/theme';

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
  actualStartAt?: string | null;
  vehicleLabel?: string | null;
  overtimeMinutes?: number;
  overtimeCharge?: number;
  actions?: ReactNode;
  /** Si se pasa, la tarjeta entera se vuelve pulsable (p. ej. para abrir el detalle). */
  onPress?: () => void;
};

export function BookingCard({
  title,
  subtitle,
  date,
  startTime,
  endTime,
  totalPrice,
  status,
  actualStartAt,
  vehicleLabel,
  overtimeMinutes = 0,
  overtimeCharge = 0,
  actions,
  onPress,
}: BookingCardProps) {
  const { colors, typography } = useTheme();

  const isInProgress = status === 'confirmed' && !!actualStartAt;
  // Finalizada sin entrada: la cerró el sistema porque el conductor nunca llegó (0066).
  const isNoShow = status === 'completed' && !actualStartAt;
  const statusLabel = isInProgress ? 'En curso' : isNoShow ? 'No se presentó' : BOOKING_STATUS_LABELS[status];

  return (
    <Card onPress={onPress} accessibilityLabel={onPress ? `Ver la reserva de ${title}` : undefined}>
      <View style={styles.headerRow}>
        <Text style={[typography.titleMedium, { color: colors.onSurface, flex: 1 }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[typography.label, { color: statusColor(status, colors) }]}>{statusLabel}</Text>
      </View>
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
        {subtitle}
      </Text>
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginTop: 4 }]}>
        {date} · {startTime.slice(0, 5)} - {endTime.slice(0, 5)}
      </Text>
      {vehicleLabel ? (
        <View style={styles.vehicleRow}>
          <Ionicons name="car-outline" size={14} color={colors.onSurfaceVariant} />
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginLeft: 4 }]} numberOfLines={1}>
            {vehicleLabel}
          </Text>
        </View>
      ) : null}
      <Text style={[typography.titleMedium, { color: colors.accent, marginTop: 4 }]}>{formatMoney(totalPrice)}</Text>
      {overtimeCharge > 0 ? (
        <Text style={[typography.label, { color: colors.error, marginTop: 2 }]}>
          + {formatMoney(overtimeCharge)} por {overtimeMinutes} min de exceso
        </Text>
      ) : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
