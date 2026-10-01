import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
  newPasswordSchema,
  recoveryCodeSchema,
  type ForgotPasswordFormValues,
  type NewPasswordFormValues,
  type RecoveryCodeFormValues,
} from '@/features/auth/schemas';
import { useAuthStore } from '@/store/useAuthStore';
import { spacing, useTheme } from '@/theme';

type Step = 'email' | 'code' | 'password';

// Recuperación en tres pasos, en la misma pantalla: 1) el correo, 2) el código que llega por mail,
// 3) la contraseña nueva. El link del mail abre la app directo en el paso 2 con el correo ya
// cargado (`?email=`); el usuario también puede volver a la app y escribir el código a mano.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const setPasswordRecoveryInProgress = useAuthStore((s) => s.setPasswordRecoveryInProgress);

  const [email, setEmail] = useState<string | null>(emailParam?.trim() || null);
  const [verified, setVerified] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  const step: Step = !email ? 'email' : verified ? 'password' : 'code';

  // Verificar el código abre una sesión: si el usuario se va sin cambiar la clave, se cierra,
  // para que quien solo "probó" el código no quede logueado sin haber elegido contraseña.
  const sessionOpenRef = useRef(false);
  useEffect(
    () => () => {
      if (sessionOpenRef.current) {
        sessionOpenRef.current = false;
        signOut().catch(() => {});
        setPasswordRecoveryInProgress(false);
      }
    },
    [setPasswordRecoveryInProgress]
  );

  const emailForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const codeForm = useForm<RecoveryCodeFormValues>({
    resolver: zodResolver(recoveryCodeSchema),
    defaultValues: { code: '' },
  });
  const passwordForm = useForm<NewPasswordFormValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
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

  const onVerifyCode = async (values: RecoveryCodeFormValues) => {
    if (!email) return;
    setErrorMessage(null);
    // El guard de navegación tiene que saberlo antes: verificar el código abre la sesión al
    // instante y, sin esto, lo sacaría de la pantalla antes de elegir la contraseña.
    setPasswordRecoveryInProgress(true);
    try {
      await verifyRecoveryCode(email, values.code);
      sessionOpenRef.current = true;
      setInfoMessage(null);
      setVerified(true);
    } catch (error) {
      setPasswordRecoveryInProgress(false);
      setErrorMessage(getAuthErrorMessage(error));
    }
  };

  const onChangePassword = async (values: NewPasswordFormValues) => {
    setErrorMessage(null);
    try {
      await updatePassword(values.password);
      sessionOpenRef.current = false;
      await signOut();
      setPasswordRecoveryInProgress(false);
      router.replace({ pathname: '/(auth)/login', params: { passwordChanged: '1' } });
    } catch (error) {
      // Se queda en este paso con la sesión abierta, para que pueda reintentar con otra clave.
      setErrorMessage(getAuthErrorMessage(error));
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
        <AuthHeading title={step === 'password' ? 'Nueva contraseña' : 'Recuperar contraseña'} />

        {step === 'email' ? (
          <>
            <Text style={[typography.bodyMedium, styles.intro, { color: colors.onSurfaceVariant }]}>
              Escribí tu correo y te enviamos un código para crear una contraseña nueva. Si entrás con
              Google, también te sirve para crearte una contraseña.
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
        ) : null}

        {step === 'code' ? (
          <>
            <Text style={[typography.bodyMedium, styles.intro, { color: colors.onSurfaceVariant }]}>
              Ingresá el código que enviamos a {email}.
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

            <View style={styles.spacer} />

            <Button
              label="Verificar código"
              onPress={codeForm.handleSubmit(onVerifyCode)}
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
        ) : null}

        {step === 'password' ? (
          <>
            <Text style={[typography.bodyMedium, styles.intro, { color: colors.onSurfaceVariant }]}>
              Código verificado. Elegí tu contraseña nueva.
            </Text>

            {errorMessage ? <Banner message={errorMessage} /> : null}

            <Controller
              control={passwordForm.control}
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
              control={passwordForm.control}
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
              onPress={passwordForm.handleSubmit(onChangePassword)}
              loading={passwordForm.formState.isSubmitting}
              disabled={passwordForm.formState.isSubmitting}
            />
          </>
        ) : null}

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
