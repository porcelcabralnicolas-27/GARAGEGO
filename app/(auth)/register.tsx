import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthHeading } from '@/components/ui/AuthHeading';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { GoogleButton } from '@/components/ui/GoogleButton';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { getAuthErrorMessage, signInWithGoogle, signUpWithPassword } from '@/features/auth/api';
import { registerSchema, type RegisterFormValues } from '@/features/auth/schemas';
import { spacing, useTheme } from '@/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setErrorMessage(null);
    try {
      await signUpWithPassword(values);
      router.replace({ pathname: '/(auth)/verify-email', params: { email: values.email } });
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <AuthHeading title="Registro" compact />

        {errorMessage ? <Banner message={errorMessage} /> : null}

        {/* En el Figma la opción de Google va arriba de los campos, no al final. */}
        <GoogleButton onPress={handleGoogleSignIn} loading={isGoogleLoading} disabled={isSubmitting} />
        <Text style={[typography.label, styles.divider, { color: colors.onSurfaceVariant }]}>O</Text>

        <Controller
          control={control}
          name="firstName"
          render={({ field, fieldState }) => (
            <TextField
              label="Nombre"
              value={field.value}
              onChangeText={field.onChange}
              errorMessage={fieldState.error?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="lastName"
          render={({ field, fieldState }) => (
            <TextField
              label="Apellido"
              value={field.value}
              onChangeText={field.onChange}
              errorMessage={fieldState.error?.message}
            />
          )}
        />

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

        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField
              label="Contraseña"
              secureTextEntry
              value={field.value}
              onChangeText={field.onChange}
              errorMessage={fieldState.error?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field, fieldState }) => (
            <TextField
              label="Confirmar contraseña"
              secureTextEntry
              value={field.value}
              onChangeText={field.onChange}
              errorMessage={fieldState.error?.message}
            />
          )}
        />

        <View style={styles.spacer} />

        <Button
          label="Registrarme"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          disabled={isSubmitting}
        />

        <Text style={[typography.bodyMedium, styles.footer, { color: colors.onSurfaceVariant }]}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/(auth)/login">
            <Text style={{ color: colors.accent }}>Inicia sesión</Text>
          </Link>
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: {
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  spacer: {
    height: spacing.md,
  },
  divider: {
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
});
