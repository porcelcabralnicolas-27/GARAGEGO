import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { activeRegion } from '@/lib/region';
import { deviceUsesBusinessTime, displaysBusinessTime } from '@/lib/time';
import { spacing, useTheme } from '@/theme';
import { t } from '@/lib/i18n';

/**
 * Aviso de que los horarios de reserva están en hora de Argentina. Solo aparece si el teléfono
 * está en otra zona: para quien está en Argentina no aporta nada.
 */
export function BusinessTimeNote() {
  const { colors, typography } = useTheme();
  // En la demo de Estados Unidos los horarios se muestran en hora de Nueva York: se avisa siempre.
  const showsRegionTime = !displaysBusinessTime();
  if (!showsRegionTime && deviceUsesBusinessTime()) return null;

  return (
    <View style={styles.row}>
      <Ionicons name="time-outline" size={14} color={colors.onSurfaceVariant} />
      <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>
        {showsRegionTime && activeRegion().code === 'US'
          ? t('Los horarios están en hora de Nueva York.')
          : t('Los horarios están en hora de Argentina, donde está la cochera.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
});
