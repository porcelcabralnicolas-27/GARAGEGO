import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type BannerVariant = 'error' | 'success';

export function Banner({ message, variant = 'error' }: { message: string; variant?: BannerVariant }) {
  const { colors, typography } = useTheme();
  const backgroundColor = variant === 'error' ? colors.error : colors.success;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={[typography.bodyMedium, { color: colors.onError }]}>{message}</Text>
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
