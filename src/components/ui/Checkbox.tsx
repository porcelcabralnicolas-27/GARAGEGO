import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  errorMessage?: string;
};

// Casilla de verificación con el estilo de los campos: borde de contorno, relleno de marca al
// tildarla y borde rojo con el mensaje debajo si falla la validación.
export function Checkbox({ checked, onChange, label, errorMessage }: CheckboxProps) {
  const { colors, typography } = useTheme();

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        style={styles.row}
      >
        <View
          style={[
            styles.box,
            {
              borderColor: errorMessage ? colors.error : checked ? colors.primary : colors.outline,
              backgroundColor: checked ? colors.primary : colors.surface,
            },
          ]}
        >
          {checked ? <Ionicons name="checkmark" size={18} color={colors.onPrimary} /> : null}
        </View>
        <Text style={[typography.bodyMedium, styles.label, { color: colors.onSurface }]}>{label}</Text>
      </Pressable>

      {errorMessage ? (
        <Text style={[typography.label, { color: colors.error, marginTop: spacing.xs }]}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
});
