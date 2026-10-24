import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, useTheme } from '@/theme';

type FormSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

// Agrupa campos relacionados bajo un encabezado (sección 30 de la especificación).
// El formulario de publicación era un bloque plano de campos sueltos; separarlo en secciones
// deja claro qué se está completando en cada parte.
export function FormSection({ title, description, children }: FormSectionProps) {
  const { colors, typography } = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[typography.titleMedium, { color: colors.onBackground }]}>{title}</Text>

      {description ? (
        <Text style={[typography.bodyMedium, styles.description, { color: colors.onSurfaceVariant }]}>
          {description}
        </Text>
      ) : null}

      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xxl,
  },
  description: {
    marginTop: spacing.xs,
  },
  body: {
    marginTop: spacing.lg,
  },
});
