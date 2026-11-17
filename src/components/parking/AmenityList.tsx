import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { Amenity } from '@/features/parking/types';
import { useCatalogs } from '@/hooks/useCatalogs';
import { amenitiesOf, amenityName } from '@/lib/catalogs';
import { t } from '@/lib/i18n';
import { spacing, useTheme } from '@/theme';

/** Ícono de Ionicons para un servicio (el catálogo guarda el nombre base, 0094). */
function iconOf(base: string): keyof typeof Ionicons.glyphMap {
  const name = `${base}-outline`;
  return (name in Ionicons.glyphMap ? name : 'checkmark-circle-outline') as keyof typeof Ionicons.glyphMap;
}

export function AmenityList({ amenities }: { amenities: Amenity[] }) {
  const { colors, typography } = useTheme();
  const { amenities: catalog } = useCatalogs();

  if (amenities.length === 0) {
    return (
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
        {t('El propietario no indicó servicios.')}
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {amenitiesOf(amenities, catalog).map((entry) => (
        <View key={entry.code} style={styles.row}>
          <Ionicons name={iconOf(entry.icon)} size={18} color={colors.accent} />
          <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>{amenityName(entry)}</Text>
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
