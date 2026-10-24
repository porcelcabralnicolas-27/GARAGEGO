import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

type PriceStepperProps = {
  /** Valor como string, para encajar con el estado de react-hook-form. */
  value: string;
  onChangeText: (value: string) => void;
  errorMessage?: string;
  /** Cuánto suma o resta cada botón. */
  step?: number;
  /** Mínimo permitido; los botones no bajan de acá. */
  min?: number;
  /** Texto a la derecha del número (ej. "/hr"). */
  suffix?: string;
};

// Control de precio con botones −/+ alrededor de un número editable, como en el Figma
// ("Publicá tu espacio"). El número también se puede tipear a mano: los botones son un atajo,
// no el único modo de entrada.
export function PriceStepper({
  value,
  onChangeText,
  errorMessage,
  step = 0.5,
  min = 0.5,
  suffix = '/hr',
}: PriceStepperProps) {
  const { colors, typography } = useTheme();

  const adjust = (delta: number) => {
    const current = Number(value);
    const base = Number.isFinite(current) && current > 0 ? current : min;
    const next = Math.max(min, Math.round((base + delta) * 100) / 100);
    onChangeText(next.toFixed(2));
  };

  return (
    <View>
      <View style={[styles.row, { borderColor: errorMessage ? colors.error : colors.outline }]}>
        <Pressable
          onPress={() => adjust(-step)}
          accessibilityRole="button"
          accessibilityLabel="Bajar el precio"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.surfaceVariant, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="remove" size={20} color={colors.onSurface} />
        </Pressable>

        <View style={styles.valueWrap}>
          <Text style={[typography.titleMedium, { color: colors.onSurfaceVariant }]}>$</Text>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            accessibilityLabel="Precio por hora"
            style={[typography.titleLarge, styles.input, { color: colors.onSurface }]}
          />
          <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{suffix}</Text>
        </View>

        <Pressable
          onPress={() => adjust(step)}
          accessibilityRole="button"
          accessibilityLabel="Subir el precio"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.surfaceVariant, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="add" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      {errorMessage ? (
        <Text style={[typography.label, styles.error, { color: colors.error }]}>{errorMessage}</Text>
      ) : null}
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
  // `flex: 1` + `minWidth: 0`: el bloque del número toma solo el espacio que dejan los dos botones.
  // Sin esto, en pantallas angostas el campo de texto (que en web trae un ancho propio) lo empujaba
  // y el botón "+" quedaba fuera de la pantalla.
  valueWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  input: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    padding: 0,
  },
  error: {
    marginTop: spacing.xs,
  },
});
