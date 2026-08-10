import { StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme';

export function PlaceholderText({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors, typography } = useTheme();

  return (
    <>
      <Text style={[styles.title, typography.titleLarge, { color: colors.onBackground }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{subtitle}</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 16,
  },
});
