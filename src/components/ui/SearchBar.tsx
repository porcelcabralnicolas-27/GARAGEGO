import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

// Buscador de la pantalla de inicio. En el Figma es una píldora gris sin borde, no un campo
// blanco delineado: se lee como un control apoyado sobre el fondo, no como un input más.
export function SearchBar({ placeholder, onPress }: { placeholder: string; onPress: () => void }) {
  const { colors, typography } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      style={({ pressed }) => [
        styles.bar,
        { backgroundColor: colors.surfaceVariant, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name="search" size={18} color={colors.onSurfaceVariant} />
      <Text style={[typography.bodyLarge, styles.label, { color: colors.onSurfaceVariant }]}>{placeholder}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
  },
  label: {
    marginLeft: spacing.sm,
  },
});
