import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { radius, spacing, useTheme } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type EmptyStateProps = {
  icon: IoniconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

// Estado vacío de listas (sección 32 de la especificación): ícono, título, descripción y
// CTA opcional. Reemplaza las 12 pantallas que resolvían la lista vacía con un <Text> suelto.
export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const { colors, typography } = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
        <Ionicons name={icon} size={28} color={colors.onPrimaryContainer} />
      </View>

      <Text style={[typography.titleMedium, styles.title, { color: colors.onSurface }]}>{title}</Text>

      {description ? (
        <Text style={[typography.bodyMedium, styles.description, { color: colors.onSurfaceVariant }]}>
          {description}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} variant="outlined" onPress={onAction} fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 280,
  },
  action: {
    marginTop: spacing.xl,
  },
});
