import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { getAuthErrorMessage, updatePassword } from '@/features/auth/api';
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/features/auth/schemas';
import { supabase } from '@/lib/supabase/client';
import { useTheme } from '@/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isExchangingCode, setIsExchangingCode] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (!code) {
      setSessionError('El enlace de recuperación no es válido o ya expiró.');
      setIsExchangingCode(false);
      return;
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setSessionError('El enlace de recuperación no es válido o ya expiró.');
      setIsExchangingCode(false);
    });
  }, [code]);

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setErrorMessage(null);
    try {
      await updatePassword(values.password);
      router.replace('/(auth)/login');
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    }
  };

  if (isExchangingCode) {
    return (
      <Screen>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Verificando enlace…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 24 }]}>
          Nueva contraseña
        </Text>

        {sessionError ? <Banner message={sessionError} /> : null}
        {errorMessage ? <Banner message={errorMessage} /> : null}

        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField
              label="Nueva contraseña"
              secureTextEntry
              editable={!sessionError}
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
              editable={!sessionError}
              value={field.value}
              onChangeText={field.onChange}
              errorMessage={fieldState.error?.message}
            />
          )}
        />

        <View style={styles.spacer} />

        <Button
          label="Guardar contraseña"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          disabled={isSubmitting || !!sessionError}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spacer: {
    height: 12,
  },
});
