import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type StatCardProps = {
  label: string;
  value: string;
  icon: ComponentProps<typeof Ionicons>['name'];
};

export function StatCard({ label, value, icon }: StatCardProps) {
  const { colors, typography } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceVariant, borderColor: colors.outline }]}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={[typography.titleLarge, { color: colors.onSurface, marginTop: 8 }]}>{value}</Text>
      <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: '48%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
});
