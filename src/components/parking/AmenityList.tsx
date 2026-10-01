import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AMENITY_LABELS, type Amenity } from '@/features/parking/types';
import { spacing, useTheme } from '@/theme';

const AMENITY_ICONS: Record<Amenity, keyof typeof Ionicons.glyphMap> = {
  cameras: 'videocam-outline',
  security_staff: 'shield-checkmark-outline',
  lighting: 'bulb-outline',
  ev_charger: 'flash-outline',
  restrooms: 'water-outline',
};

export function AmenityList({ amenities }: { amenities: Amenity[] }) {
  const { colors, typography } = useTheme();

  if (amenities.length === 0) {
    return (
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
        El propietario no indicó servicios.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {amenities.map((amenity) => (
        <View key={amenity} style={styles.row}>
          <Ionicons name={AMENITY_ICONS[amenity]} size={18} color={colors.accent} />
          <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>{AMENITY_LABELS[amenity]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
