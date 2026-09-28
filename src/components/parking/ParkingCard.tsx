import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import type { ListingStatus } from '@/features/parking/types';
import { formatPricePerHour } from '@/lib/money';
import { radius, spacing, useTheme } from '@/theme';

type ParkingCardProps = {
  name: string;
  address: string;
  pricePerHour: number;
  ratingAvg: number;
  /** Solo lo pasa el propietario. En la búsqueda no hay chapa (todo está aprobado y en vivo). */
  status?: ListingStatus;
  /** Texto secundario bajo la dirección (p. ej. el motivo del rechazo). */
  note?: string | null;
  imageUrl?: string | null;
  distanceKm?: number;
  /** Autos a la vez. Solo lo pasa el propietario: la búsqueda no trae la capacidad. */
  capacity?: number;
  onPress: () => void;
};

/** Etiqueta y tono de cada estado. `tone`: 'ok' relleno de marca, 'muted' gris, 'alert' rojo. */
const STATUS_BADGE: Record<ListingStatus, { label: string; tone: 'ok' | 'muted' | 'alert' }> = {
  active: { label: 'ACTIVA', tone: 'ok' },
  paused: { label: 'PAUSADA', tone: 'muted' },
  pending: { label: 'EN REVISIÓN', tone: 'muted' },
  changes_requested: { label: 'CORREGIR', tone: 'alert' },
  rejected: { label: 'RECHAZADA', tone: 'alert' },
  paused_by_admin: { label: 'PAUSADA', tone: 'alert' },
  suspended: { label: 'SUSPENDIDA', tone: 'alert' },
};

export function ParkingCard({
  name,
  address,
  pricePerHour,
  ratingAvg,
  status,
  note,
  imageUrl,
  distanceKm,
  capacity,
  onPress,
}: ParkingCardProps) {
  const { colors, typography } = useTheme();

  const badge = status ? STATUS_BADGE[status] : null;
  const badgeStyle =
    badge?.tone === 'ok'
      ? { backgroundColor: colors.primary, color: colors.onPrimary, borderColor: colors.primary }
      : badge?.tone === 'alert'
        ? { backgroundColor: colors.error, color: colors.onError, borderColor: colors.error }
        : { backgroundColor: colors.surfaceVariant, color: colors.onSurfaceVariant, borderColor: colors.outline };

  return (
    // padding "none": la imagen llega hasta el borde de la tarjeta.
    <Card onPress={onPress} padding="none" accessibilityLabel={name} style={styles.card}>
      <View style={styles.row}>
        <View>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: colors.primaryContainer }]}>
              <Ionicons name="car" size={28} color={colors.onPrimaryContainer} />
            </View>
          )}

          {/* Estado de la publicación: solo lo pasa el propietario (en la búsqueda todos los
              lotes ya están aprobados y en vivo). */}
          {badge ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: badgeStyle.backgroundColor, borderColor: badgeStyle.borderColor, borderWidth: 1 },
              ]}
            >
              <Text style={[typography.label, styles.badgeText, { color: badgeStyle.color }]}>
                {badge.label}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.info}>
          <Text style={[typography.titleMedium, { color: colors.onSurface }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
            {address}
          </Text>
          {note ? (
            <Text style={[typography.label, { color: colors.error, marginTop: 2 }]} numberOfLines={2}>
              {note}
            </Text>
          ) : null}
          {distanceKm !== undefined ? (
            <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{distanceKm.toFixed(1)} km</Text>
          ) : null}
          {capacity !== undefined ? (
            <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>
              Capacidad: {capacity} {capacity === 1 ? 'auto' : 'autos'}
            </Text>
          ) : null}

          <View style={styles.priceRow}>
            <Text style={[typography.titleMedium, { color: colors.accent }]}>
              {formatPricePerHour(pricePerHour)}
            </Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color={colors.onSurfaceVariant} />
              <Text style={[typography.label, { color: colors.onSurfaceVariant, marginLeft: spacing.xs }]}>
                {ratingAvg.toFixed(1)}
              </Text>
            </View>
          </View>

        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
  },
  image: {
    width: 96,
    height: 96,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  info: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
