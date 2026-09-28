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
import {
  getAuthErrorMessage,
  requestPasswordReset,
  signOut,
  updatePassword,
  verifyRecoveryCode,
} from '@/features/auth/api';
import {
  forgotPasswordSchema,
  recoveryCodeSchema,
  type ForgotPasswordFormValues,
  type RecoveryCodeFormValues,
} from '@/features/auth/schemas';
import { useAuthStore } from '@/store/useAuthStore';
import { spacing, useTheme } from '@/theme';

// Recuperación en dos pasos, en la misma pantalla: 1) el correo, 2) el código que llega por
// mail + la contraseña nueva. El correo queda en el estado de la pantalla, nunca en la URL.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const setPasswordRecoveryInProgress = useAuthStore((s) => s.setPasswordRecoveryInProgress);
  const [email, setEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  const emailForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const codeForm = useForm<RecoveryCodeFormValues>({
    resolver: zodResolver(recoveryCodeSchema),
    defaultValues: { code: '', password: '', confirmPassword: '' },
  });

  const onSendCode = async (values: ForgotPasswordFormValues) => {
    setErrorMessage(null);
    try {
      await requestPasswordReset(values.email);
      setEmail(values.email.trim());
      // Mismo mensaje exista o no la cuenta: no se revela qué correos están registrados.
      setInfoMessage('Si el correo tiene una cuenta, te enviamos un código. Revisá también el spam.');
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    }
  };

  const onResend = async () => {
    if (!email) return;
    setErrorMessage(null);
    setIsResending(true);
    try {
      await requestPasswordReset(email);
      setInfoMessage('Te enviamos un código nuevo. El anterior ya no sirve.');
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  };

  const onChangePassword = async (values: RecoveryCodeFormValues) => {
    if (!email) return;
    setErrorMessage(null);
    setPasswordRecoveryInProgress(true);
    let verified = false;
    try {
      await verifyRecoveryCode(email, values.code);
      verified = true;
      await updatePassword(values.password);
      await signOut();
      router.replace({ pathname: '/(auth)/login', params: { passwordChanged: '1' } });
    } catch (error) {
      // Si el código era válido pero falló el cambio, no se deja abierta la sesión de recuperación.
      if (verified) await signOut().catch(() => {});
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setPasswordRecoveryInProgress(false);
    }
  };

  const backToEmail = () => {
    setEmail(null);
    setInfoMessage(null);
    setErrorMessage(null);
    codeForm.reset();
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <AuthHeading title="Recuperar contraseña" />

        {!email ? (
          <>
            <Text style={[typography.bodyMedium, styles.intro, { color: colors.onSurfaceVariant }]}>
              Te enviaremos un código a tu correo para crear una contraseña nueva. Si entrás con Google,
              también te sirve para crearte una contraseña.
            </Text>

            {errorMessage ? <Banner message={errorMessage} /> : null}

            <Controller
              control={emailForm.control}
              name="email"
              render={({ field, fieldState }) => (
                <TextField
                  label="Correo electrónico"
                  placeholder="tucorreo@ejemplo.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  value={field.value}
                  onChangeText={field.onChange}
                  errorMessage={fieldState.error?.message}
                />
              )}
            />

            <View style={styles.spacer} />

            <Button
              label="Enviar código"
              onPress={emailForm.handleSubmit(onSendCode)}
              loading={emailForm.formState.isSubmitting}
              disabled={emailForm.formState.isSubmitting}
            />
          </>
        ) : (
          <>
            <Text style={[typography.bodyMedium, styles.intro, { color: colors.onSurfaceVariant }]}>
              Ingresá el código que enviamos a {email} y elegí tu contraseña nueva.
            </Text>

            {infoMessage ? <Banner variant="success" message={infoMessage} /> : null}
            {errorMessage ? <Banner message={errorMessage} /> : null}

            <Controller
              control={codeForm.control}
              name="code"
              render={({ field, fieldState }) => (
                <TextField
                  label="Código"
                  placeholder="123456"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={10}
                  value={field.value}
                  onChangeText={field.onChange}
                  errorMessage={fieldState.error?.message}
                />
              )}
            />

            <Controller
              control={codeForm.control}
              name="password"
              render={({ field, fieldState }) => (
                <TextField
                  label="Nueva contraseña"
                  secureTextEntry
                  autoComplete="new-password"
                  value={field.value}
                  onChangeText={field.onChange}
                  errorMessage={fieldState.error?.message}
                />
              )}
            />

            <Controller
              control={codeForm.control}
              name="confirmPassword"
              render={({ field, fieldState }) => (
                <TextField
                  label="Confirmar contraseña"
                  secureTextEntry
                  autoComplete="new-password"
                  value={field.value}
                  onChangeText={field.onChange}
                  errorMessage={fieldState.error?.message}
                />
              )}
            />

            <View style={styles.spacer} />

            <Button
              label="Guardar contraseña"
              onPress={codeForm.handleSubmit(onChangePassword)}
              loading={codeForm.formState.isSubmitting}
              disabled={codeForm.formState.isSubmitting}
            />

            <View style={styles.spacer} />

            <Button
              label="Reenviar código"
              variant="text"
              onPress={onResend}
              loading={isResending}
              disabled={isResending || codeForm.formState.isSubmitting}
            />
            <LinkText label="Usar otro correo" onPress={backToEmail} />
          </>
        )}

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
