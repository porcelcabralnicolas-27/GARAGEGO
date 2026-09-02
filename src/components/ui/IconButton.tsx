import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { radius, useTheme } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type IconButtonProps = {
  name: IoniconName;
  onPress: () => void;
  /** Obligatorio: sin texto visible, es lo único que anuncia un lector de pantalla. */
  accessibilityLabel: string;
  size?: number;
  color?: string;
  disabled?: boolean;
  /** `plain` deja solo el ícono; `surface` le pone un fondo circular. */
  variant?: 'plain' | 'surface';
};

// Reemplaza el patrón de Pressable + Ionicons repetido a mano por toda la app
// (sección 8.3 de la especificación): volver, cerrar, editar, buscar, enviar.
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  size = 20,
  color,
  disabled,
  variant = 'plain',
}: IconButtonProps) {
  const { colors } = useTheme();
  const box = size * 2.2;
  const iconColor = disabled ? colors.outline : (color ?? colors.onSurfaceVariant);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        {
          width: box,
          height: box,
          backgroundColor:
            variant === 'surface' ? colors.surfaceVariant : pressed ? colors.surfaceVariant : 'transparent',
          opacity: pressed && variant === 'surface' ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name={name} size={size} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
