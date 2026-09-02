import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, shadows, spacing, useTheme } from '@/theme';

type CardProps = {
  children: ReactNode;
  /** Si se pasa, la tarjeta se vuelve pulsable. */
  onPress?: () => void;
  /** `none` para tarjetas cuyo contenido llega hasta el borde, como una imagen a sangre. */
  padding?: 'none' | 'md' | 'lg';
  /** Anula el margen inferior por defecto (útil cuando la tarjeta no está en una lista). */
  spaced?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

// Contenedor común de todas las tarjetas de dominio. Antes cada una repetía el mismo bloque
// (fondo surfaceVariant + borde + radio 12 + padding 14); ahora van sobre `surface` con sombra,
// como pide la sección 12 de la especificación.
//
// La sombra y el recorte van en capas separadas a propósito: `overflow: hidden` en el mismo
// nodo que la sombra la recorta en iOS, así que el nodo exterior proyecta y el interior recorta.
export function Card({
  children,
  onPress,
  padding = 'lg',
  spaced = true,
  style,
  accessibilityLabel,
}: CardProps) {
  const { colors } = useTheme();

  const inner = (
    <View
      style={[
        styles.clip,
        {
          backgroundColor: colors.surface,
          padding: padding === 'none' ? 0 : padding === 'md' ? spacing.md : spacing.lg,
        },
      ]}
    >
      {children}
    </View>
  );

  const outer: StyleProp<ViewStyle> = [
    styles.shadow,
    shadows.card,
    { backgroundColor: colors.surface },
    spaced && styles.spaced,
    style,
  ];

  if (!onPress) return <View style={outer}>{inner}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [outer, pressed && styles.pressed]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius.lg,
  },
  clip: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  spaced: {
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.9,
  },
});
