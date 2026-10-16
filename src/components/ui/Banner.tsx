import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type BannerVariant = 'error' | 'success' | 'info';

export function Banner({ message, variant = 'error' }: { message: string; variant?: BannerVariant }) {
  const { colors, typography } = useTheme();
  const backgroundColor =
    variant === 'error' ? colors.error : variant === 'info' ? colors.surfaceVariant : colors.success;
  const textColor = variant === 'info' ? colors.onSurface : colors.onError;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={[typography.bodyMedium, { color: textColor }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
});
