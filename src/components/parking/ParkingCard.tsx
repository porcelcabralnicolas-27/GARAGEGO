import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

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
    <Pressable
      onPress={onPress}
      style={[styles.container, { backgroundColor: colors.surfaceVariant, borderColor: colors.outline }]}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: colors.primaryContainer }]}>
          <Ionicons name="car" size={28} color={colors.onPrimaryContainer} />
        </View>
      )}

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
        <View style={styles.row}>
          <Text style={[typography.bodyMedium, { color: colors.accent }]}>${pricePerHour.toFixed(2)}/hora</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={colors.onSurfaceVariant} />
            <Text style={[typography.label, { color: colors.onSurfaceVariant, marginLeft: 4 }]}>
              {ratingAvg.toFixed(1)}
            </Text>
          </View>
        </View>
        {isActive === false ? (
          <Text style={[typography.label, { color: colors.error, marginTop: 4 }]}>Inactivo</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  image: {
    width: 88,
    height: 88,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    padding: 10,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
