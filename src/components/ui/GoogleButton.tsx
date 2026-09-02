import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

type GoogleButtonProps = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function GoogleButton({ onPress, loading, disabled }: GoogleButtonProps) {
  const { colors, typography } = useTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { borderColor: colors.outline, opacity: pressed && !isDisabled ? 0.85 : isDisabled ? 0.6 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onSurface} />
      ) : (
        <>
          <Ionicons name="logo-google" size={18} color={colors.onSurface} style={styles.icon} />
          <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Continuar con Google</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    // El Figma lo muestra redondeado pero no en píldora (`rounded-round-eight`, 1.5rem),
    // a diferencia de los botones de acción que sí son píldora.
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  icon: {
    marginRight: spacing.sm,
  },
});
