import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';

type TextFieldProps = TextInputProps & {
  label: string;
  errorMessage?: string;
};

export function TextField({ label, errorMessage, style, onFocus, onBlur, ...inputProps }: TextFieldProps) {
  const { colors, typography } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  // Estados de la sección 10: default, focused, filled, error, disabled.
  // El borde tiene prioridad: error > focus > normal.
  const isDisabled = inputProps.editable === false;
  const borderColor = errorMessage
    ? colors.error
    : isFocused
      ? colors.primary
      : colors.outline;

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: spacing.sm }]}>
          {label}
        </Text>
      ) : null}

      <TextInput
        placeholderTextColor={colors.onSurfaceVariant}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          typography.bodyLarge,
          {
            color: isDisabled ? colors.onSurfaceVariant : colors.onSurface,
            borderColor,
            borderWidth: isFocused && !errorMessage ? 2 : 1,
            backgroundColor: isDisabled ? colors.surfaceVariant : colors.surface,
          },
          style,
        ]}
        {...inputProps}
      />

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
  input: {
    minHeight: 48,
    // Muy redondeado, como los campos del Figma (`rounded-3xl`).
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    // El padding vertical mantiene el texto centrado cuando el campo crece con `multiline`.
    paddingVertical: spacing.md,
  },
});
