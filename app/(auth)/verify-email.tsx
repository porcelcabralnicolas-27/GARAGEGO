import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthHeading } from '@/components/ui/AuthHeading';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { LinkText } from '@/components/ui/LinkText';
import { Screen } from '@/components/ui/Screen';
import { getAuthErrorMessage, resendSignUpConfirmation } from '@/features/auth/api';
import { spacing, useTheme } from '@/theme';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [isResending, setIsResending] = useState(false);

  const handleResend = async () => {
    if (!email) return;
    setIsResending(true);
    setStatus(null);
    try {
      await resendSignUpConfirmation(email);
      setStatus({ type: 'success', message: 'Te reenviamos el correo de confirmación.' });
    } catch (error) {
      setStatus({ type: 'error', message: getAuthErrorMessage(error) });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Screen>
      <AuthHeading title="Verifica tu correo" />
      <Text style={[typography.bodyLarge, styles.intro, { color: colors.onSurfaceVariant }]}>
        Te enviamos un enlace de confirmación{email ? ` a ${email}` : ''}. Ábrelo para activar tu cuenta y poder
        iniciar sesión.
      </Text>

      {status ? <Banner message={status.message} variant={status.type} /> : null}

      <View style={styles.spacer} />

      <Button
        label="Reenviar correo"
        onPress={handleResend}
        loading={isResending}
        disabled={isResending || !email}
      />

      <View style={styles.spacer} />

      <LinkText label="Volver a iniciar sesión" onPress={() => router.replace('/(auth)/login')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  spacer: {
    height: spacing.lg,
  },
});
