import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline, Rect } from 'react-native-svg';

import { radius, spacing, useTheme } from '@/theme';

const ICON_COLOR = '#4B4B57';

/** Barras ascendentes con una flecha de crecimiento encima, solo contorno. */
function ChartIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Rect x={10} y={46} width={9} height={12} stroke={ICON_COLOR} strokeWidth={2.5} strokeLinejoin="round" />
      <Rect x={23} y={40} width={9} height={18} stroke={ICON_COLOR} strokeWidth={2.5} strokeLinejoin="round" />
      <Rect x={36} y={32} width={9} height={26} stroke={ICON_COLOR} strokeWidth={2.5} strokeLinejoin="round" />
      <Rect x={49} y={24} width={9} height={34} stroke={ICON_COLOR} strokeWidth={2.5} strokeLinejoin="round" />
      <Polyline
        points="6,32 20,22 30,28 56,6"
        stroke={ICON_COLOR}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline
        points="45,6 56,6 56,17"
        stroke={ICON_COLOR}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Tarjeta grande de color de marca con el ícono de estadísticas a la izquierda y el texto en
// blanco, con una sombra suave violácea. Se usa en Perfil para abrir el dashboard del propietario.
export function StatsButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, typography } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={styles.row}>
        <ChartIcon size={64} />
        <Text style={[typography.titleMedium, styles.label]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 104,
    borderRadius: radius.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    shadowColor: '#6C63FF',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  label: {
    color: '#FFFFFF',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
