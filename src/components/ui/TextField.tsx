import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

type TextFieldProps = TextInputProps & {
  label: string;
  errorMessage?: string;
};

export function TextField({ label, errorMessage, style, ...inputProps }: TextFieldProps) {
  const { colors, typography } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 6 }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.onSurfaceVariant}
        style={[
          styles.input,
          typography.bodyLarge,
          {
            color: colors.onSurface,
            borderColor: errorMessage ? colors.error : colors.outline,
            backgroundColor: colors.surface,
          },
          style,
        ]}
        {...inputProps}
      />
      {errorMessage ? (
        <Text style={[typography.label, { color: colors.error, marginTop: 4 }]}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
  },
});
