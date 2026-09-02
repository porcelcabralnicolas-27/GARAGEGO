import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthHeading } from '@/components/ui/AuthHeading';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { LinkText } from '@/components/ui/LinkText';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { getAuthErrorMessage, requestPasswordReset } from '@/features/auth/api';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/features/auth/schemas';
import { spacing, useTheme } from '@/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setErrorMessage(null);
    try {
      await requestPasswordReset(values.email);
      setSent(true);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    }
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <AuthHeading title="Recuperar contraseña" />
        <Text style={[typography.bodyMedium, styles.intro, { color: colors.onSurfaceVariant }]}>
          Te enviaremos un enlace a tu correo para restablecer tu contraseña.
        </Text>

        {errorMessage ? <Banner message={errorMessage} /> : null}
        {sent ? (
          <Banner variant="success" message="Si el correo existe, te enviamos un enlace de recuperación." />
        ) : null}

        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label="Correo electrónico"
              placeholder="tucorreo@ejemplo.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={field.value}
              onChangeText={field.onChange}
              errorMessage={fieldState.error?.message}
            />
          )}
        />

        <View style={styles.spacer} />

        <Button
          label="Enviar enlace"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          disabled={isSubmitting}
        />

        <View style={styles.spacer} />

        <LinkText label="Volver a iniciar sesión" onPress={() => router.replace('/(auth)/login')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  spacer: {
    height: spacing.md,
  },
});
