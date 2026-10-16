import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** `danger`: fondo blanco con texto y borde rojos, para acciones destructivas (p. ej. eliminar la
 *  cuenta). Es deliberadamente menos llamativo que un botón relleno para que no se toque por error. */
type ButtonVariant = 'filled' | 'outlined' | 'text' | 'danger';
type ButtonSize = 'default' | 'compact';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ícono opcional a la izquierda de la etiqueta. */
  icon?: IoniconName;
  /**
   * Controla el ancho de forma explícita. Sin definir, el botón se comporta como siempre:
   * ocupa el ancho que le dé su contenedor. `false` lo ajusta al contenido.
   */
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'filled',
  size = 'default',
  icon,
  fullWidth,
  disabled,
  loading,
}: ButtonProps) {
  const { colors, typography } = useTheme();
  const isDisabled = disabled || loading;
  const isCompact = size === 'compact';

  const isDanger = variant === 'danger';
  const isFilled = variant === 'filled';

  const backgroundColor = isDanger
    ? isDisabled
      ? colors.surfaceVariant
      : colors.surface
    : isFilled
      ? isDisabled
        ? colors.surfaceVariant
        : colors.primary
      : 'transparent';
  const textColor = isDanger
    ? isDisabled
      ? colors.onSurfaceVariant
      : colors.error
    : isFilled
      ? isDisabled
        ? colors.onSurfaceVariant
        : colors.onPrimary
      : colors.accent;
  const borderColor = isDanger
    ? isDisabled
      ? colors.outline
      : colors.error
    : variant === 'outlined'
      ? colors.outline
      : 'transparent';

  const alignSelf = fullWidth === undefined ? undefined : fullWidth ? 'stretch' : 'flex-start';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        isCompact ? styles.compact : styles.base,
        { backgroundColor, borderColor, alignSelf, opacity: pressed && !isDisabled ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={isCompact ? 16 : 20} color={textColor} /> : null}
          <Text style={[isCompact ? typography.label : typography.titleMedium, { color: textColor }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    // Píldora: es la forma que usan todos los botones de acción del Figma
    // (`rounded-full` en ACCEDER, CONTINUAR, etc.).
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  compact: {
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
