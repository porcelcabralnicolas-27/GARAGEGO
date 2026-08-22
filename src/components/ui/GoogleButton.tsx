import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme';

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
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  icon: {
    marginRight: 10,
  },
});
