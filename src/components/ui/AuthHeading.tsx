import { StyleSheet, Text, View } from 'react-native';

import { Logo } from '@/components/ui/Logo';
import { spacing, useTheme } from '@/theme';

type AuthHeadingProps = {
  /** Se muestra centrado y en mayúsculas debajo del logo. */
  title: string;
  /** Para pantallas con muchos campos (registro): logo más chico y menos aire. */
  compact?: boolean;
};

// Encabezado común de las pantallas de autenticación: logo arriba y, debajo, un título
// centrado en mayúsculas con tracking, en gris azulado. En el Figma todas las pantallas de
// auth abren igual (INICIAR SESIÓN, REGISTRO, RECUPERAR CONTRASEÑA), así que el patrón vive
// en un solo lugar en vez de repetirse en cada archivo.
export function AuthHeading({ title, compact }: AuthHeadingProps) {
  const { colors, typography } = useTheme();

  return (
    <View style={[styles.wrapper, compact ? styles.compact : styles.regular]}>
      <Logo size={compact ? 'medium' : 'large'} />
      <Text style={[typography.titleLarge, styles.title, { color: colors.onSurfaceVariant }]}>
        {title.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  regular: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xxl,
  },
  compact: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  title: {
    marginTop: spacing.lg,
    letterSpacing: 1,
    textAlign: 'center',
  },
});
