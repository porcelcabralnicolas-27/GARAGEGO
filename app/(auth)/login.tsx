import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthHeading } from '@/components/ui/AuthHeading';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { GoogleButton } from '@/components/ui/GoogleButton';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { getAuthErrorMessage, signInWithGoogle, signInWithPassword } from '@/features/auth/api';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas';
import { spacing, useTheme } from '@/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { passwordChanged } = useLocalSearchParams<{ passwordChanged?: string }>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setErrorMessage(null);
    try {
      await signInWithPassword(values.email, values.password);
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
        <AuthHeading title="Iniciar sesión" />

        {passwordChanged && !errorMessage ? (
          <Banner variant="success" message="Listo, ya podés entrar con tu contraseña nueva." />
        ) : null}
        {errorMessage ? <Banner message={errorMessage} /> : null}

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

        {/* Alineado a la derecha y en gris, como en el Figma (no el enlace verde centrado). */}
        <Pressable
          onPress={() => router.push('/(auth)/forgot-password')}
          hitSlop={8}
          style={styles.forgotLink}
          accessibilityRole="button"
        >
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
            ¿Olvidaste tu contraseña?
          </Text>
        </Pressable>

        <View style={styles.spacer} />

        <Button
          label="Iniciar sesión"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          disabled={isSubmitting}
        />

        <Text style={[typography.label, styles.divider, { color: colors.onSurfaceVariant }]}>O</Text>

        <GoogleButton onPress={handleGoogleSignIn} loading={isGoogleLoading} disabled={isSubmitting} />

        <Text style={[typography.bodyMedium, styles.footer, { color: colors.onSurfaceVariant }]}>
          ¿No tienes cuenta?{' '}
          <Link href="/(auth)/register">
            <Text style={{ color: colors.accent }}>Regístrate</Text>
          </Link>
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
  },
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
