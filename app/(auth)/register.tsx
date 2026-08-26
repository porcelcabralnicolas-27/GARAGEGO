import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { GoogleButton } from '@/components/ui/GoogleButton';
import { Logo } from '@/components/ui/Logo';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { getAuthErrorMessage, signInWithGoogle, signUpWithPassword } from '@/features/auth/api';
import { registerSchema, type RegisterFormValues } from '@/features/auth/schemas';
import { useTheme } from '@/theme';

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
        <View style={styles.logoWrapper}>
          <Logo size="medium" />
        </View>

        <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 24 }]}>Crear cuenta</Text>

        {errorMessage ? <Banner message={errorMessage} /> : null}

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

        <Text style={[typography.label, styles.divider, { color: colors.onSurfaceVariant }]}>O</Text>

        <GoogleButton onPress={handleGoogleSignIn} loading={isGoogleLoading} disabled={isSubmitting} />

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
  logoWrapper: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  footer: {
    textAlign: 'center',
    marginTop: 24,
  },
  spacer: {
    height: 12,
  },
  divider: {
    textAlign: 'center',
    marginVertical: 16,
  },
});
