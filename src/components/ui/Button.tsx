import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme';

type ButtonVariant = 'filled' | 'outlined' | 'text';
type ButtonSize = 'default' | 'compact';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ label, onPress, variant = 'filled', size = 'default', disabled, loading }: ButtonProps) {
  const { colors, typography } = useTheme();
  const isDisabled = disabled || loading;

  const backgroundColor =
    variant === 'filled' ? (isDisabled ? colors.surfaceVariant : colors.primary) : 'transparent';
  const textColor =
    variant === 'filled' ? (isDisabled ? colors.onSurfaceVariant : colors.onPrimary) : colors.accent;
  const borderColor = variant === 'outlined' ? colors.outline : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        size === 'compact' ? styles.baseCompact : styles.base,
        { backgroundColor, borderColor, opacity: pressed && !isDisabled ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[size === 'compact' ? typography.label : typography.titleMedium, { color: textColor }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  baseCompact: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
});
