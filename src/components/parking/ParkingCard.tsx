import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { formatPricePerHour } from '@/lib/money';
import { radius, spacing, useTheme } from '@/theme';

type ParkingCardProps = {
  name: string;
  address: string;
  pricePerHour: number;
  ratingAvg: number;
  isActive?: boolean;
  imageUrl?: string | null;
  distanceKm?: number;
  onPress: () => void;
};

export function ParkingCard({
  name,
  address,
  pricePerHour,
  ratingAvg,
  isActive,
  imageUrl,
  distanceKm,
  onPress,
}: ParkingCardProps) {
  const { colors, typography } = useTheme();

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
              lotes ya están activos). */}
          {isActive !== undefined ? (
            <View
              style={[
                styles.badge,
                isActive
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: colors.surfaceVariant, borderColor: colors.outline, borderWidth: 1 },
              ]}
            >
              <Text
                style={[
                  typography.label,
                  styles.badgeText,
                  { color: isActive ? colors.onPrimary : colors.onSurfaceVariant },
                ]}
              >
                {isActive ? 'ACTIVA' : 'PAUSADA'}
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
          {distanceKm !== undefined ? (
            <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{distanceKm.toFixed(1)} km</Text>
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
