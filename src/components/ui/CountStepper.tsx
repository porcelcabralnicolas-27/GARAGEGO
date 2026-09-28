import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

type CountStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Texto a la derecha del número, ya en singular o plural según el valor (ej. "autos"). */
  unit: (value: number) => string;
  accessibilityLabel: string;
};

// Contador entero con −/+, con el mismo aspecto que PriceStepper. Sin campo de texto: los
// valores son pocos y chicos, y así no hay nada que validar.
export function CountStepper({ value, onChange, min, max, unit, accessibilityLabel }: CountStepperProps) {
  const { colors, typography } = useTheme();

  const renderButton = (icon: 'remove' | 'add', next: number, label: string) => {
    const disabled = next < min || next > max;
    return (
      <Pressable
        onPress={() => onChange(next)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.surfaceVariant, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons name={icon} size={20} color={colors.onSurface} />
      </Pressable>
    );
  };

  return (
    <View
      style={[styles.row, { borderColor: colors.outline }]}
      accessible
      accessibilityLabel={`${accessibilityLabel}: ${value} ${unit(value)}`}
    >
      {renderButton('remove', value - 1, `Bajar ${accessibilityLabel.toLowerCase()}`)}
      <View style={styles.valueWrap}>
        <Text style={[typography.titleLarge, { color: colors.onSurface }]}>{value}</Text>
        <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{unit(value)}</Text>
      </View>
      {renderButton('add', value + 1, `Subir ${accessibilityLabel.toLowerCase()}`)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.sm,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
});
