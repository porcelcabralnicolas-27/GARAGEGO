import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BusinessTimeNote } from '@/components/booking/BusinessTimeNote';
import { DetailRow } from '@/components/booking/DetailRow';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { getOwnerBooking } from '@/features/booking/api';
import type { OwnerBookingDetail } from '@/features/booking/types';
import { formatMoney } from '@/lib/money';
import { queryKeys } from '@/lib/queryKeys';
import { formatCalendarDate, formatDateTime } from '@/lib/time';
import { radius, spacing, useTheme } from '@/theme';

type StatusBadge = { label: string; icon: keyof typeof Ionicons.glyphMap };

function statusBadgeOf(booking: OwnerBookingDetail): StatusBadge {
  if (booking.status === 'completed') return { label: 'FINALIZADA', icon: 'checkmark-circle' };
  if (booking.status === 'cancelled') return { label: 'CANCELADA', icon: 'close-circle' };
  if (booking.status === 'confirmed' && booking.actualStartAt) return { label: 'EN CURSO', icon: 'car-sport' };
  if (booking.status === 'confirmed') return { label: 'PRÓXIMA', icon: 'time' };
  return { label: 'PENDIENTE', icon: 'hourglass' };
}

// Detalle de una reserva recibida: los mismos datos que ve el conductor en su reserva, sin
// "Comenzar" ni "Cómo llegar" (son acciones del conductor), más quién reservó y con qué auto.
// Finalizar y cancelar siguen en el listado.
export default function OwnerBookingDetailScreen() {
  const { colors, typography } = useTheme();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const backHref = from === 'history' ? '/(owner)/bookings/history' : '/(owner)/bookings';

  const { data: booking, isError } = useQuery({
    queryKey: queryKeys.bookings.detail(id),
    queryFn: () => getOwnerBooking(id),
  });

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Reserva" backHref={backHref} />
        <Banner message="No se pudo cargar esta reserva." />
      </Screen>
    );
  }

  if (!booking) {
    return (
      <Screen>
        <ScreenHeader title="Reserva" backHref={backHref} />
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
      </Screen>
    );
  }

  const badge = statusBadgeOf(booking);
  const vehicleLabel = booking.vehicle
    ? [booking.vehicle.plate, [booking.vehicle.brand, booking.vehicle.model].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(' · ')
    : 'Sin datos';
  const hasActivity = booking.actualStartAt !== null || booking.actualEndAt !== null;

  return (
    <Screen>
      <ScrollView>
        <ScreenHeader title="Reserva" backHref={backHref} />

        <BusinessTimeNote />

        <View style={styles.centerBlock}>
          <View style={[styles.badge, { backgroundColor: colors.primaryContainer }]}>
            <Ionicons name={badge.icon} size={20} color={colors.onPrimaryContainer} />
            <Text style={[typography.label, { color: colors.onPrimaryContainer }]}>{badge.label}</Text>
          </View>
        </View>

        <Card>
          <DetailRow label="Lugar" value={booking.parkingLotName} />
          {booking.parkingLotAddress ? <DetailRow label="Dirección" value={booking.parkingLotAddress} /> : null}
          <DetailRow label="Fecha" value={formatCalendarDate(booking.date)} />
          <DetailRow label="Horario" value={`${booking.startTime.slice(0, 5)} – ${booking.endTime.slice(0, 5)}`} />
          <View style={[styles.divider, { backgroundColor: colors.outline }]} />
          <View style={styles.totalRow}>
            <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Total de la reserva</Text>
            <Text style={[typography.titleMedium, { color: colors.accent }]}>{formatMoney(booking.totalPrice)}</Text>
          </View>
        </Card>

        <Card>
          <Text style={[typography.titleMedium, styles.cardHeading, { color: colors.onSurface }]}>Conductor</Text>
          <DetailRow label="Nombre" value={booking.clientName} />
          <DetailRow label="Vehículo" value={vehicleLabel} />
        </Card>

        {hasActivity ? (
          <Card>
            <Text style={[typography.titleMedium, styles.cardHeading, { color: colors.onSurface }]}>
              Registro de actividades
            </Text>
            <DetailRow label="Entrada" value={booking.actualStartAt ? formatDateTime(booking.actualStartAt) : '—'} />
            <DetailRow label="Salida" value={booking.actualEndAt ? formatDateTime(booking.actualEndAt) : '—'} />
            {booking.overtimeCharge > 0 ? (
              <DetailRow
                label="Tiempo excedido"
                value={`${booking.overtimeMinutes} min · ${formatMoney(booking.overtimeCharge)}`}
              />
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerBlock: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  cardHeading: {
    marginBottom: spacing.md,
  },
});
