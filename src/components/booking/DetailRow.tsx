import { StyleSheet, Text, View } from 'react-native';

import { spacing, useTheme } from '@/theme';

/** Fila de dato del resumen de una reserva: etiqueta a la izquierda, valor a la derecha. */
export function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[typography.bodyMedium, styles.value, { color: colors.onSurface }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
});
