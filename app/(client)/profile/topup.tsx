import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { getPaymentErrorMessage, openCheckout, startCheckout } from '@/features/payments/api';
import { useAppLimits } from '@/hooks/useAppLimits';
import { useRegion } from '@/hooks/useRegion';
import { formatMoney } from '@/lib/money';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, shadows, spacing, useTheme } from '@/theme';

/** Un punto de la explicación de cómo funciona la recarga. */
function InfoItem({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.infoItem}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={[typography.bodyMedium, styles.infoText, { color: colors.onSurfaceVariant }]}>{text}</Text>
    </View>
  );
}

// Recarga de la billetera con Mercado Pago. Se elige el monto, se abre el checkout y la app pasa
// a la pantalla de procesamiento, que consulta en la base si el pago se acreditó (en la web,
// Mercado Pago vuelve solo a esa pantalla). Los topes los controla también el servidor
// (begin_mp_topup) y los configura el equipo en el panel (0093): acá se muestran para no dejar elegir un monto que va a rechazar.
export default function TopupScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const walletBalance = useAuthStore((s) => s.walletBalance);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);
  // La recarga es con Mercado Pago, que en la demo de Estados Unidos no está.
  const { mercadoPagoEnabled } = useRegion();
  const { topupQuickAmounts, topupMax, walletMaxBalance } = useAppLimits();

  const [amount, setAmount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const room = walletBalance !== null ? walletMaxBalance - walletBalance : null;
  const fits = (value: number) => room === null || value <= room;
  const selectedFits = amount !== null && fits(amount);

  const handleTopUp = async () => {
    if (amount === null) return;
    setIsPaying(true);
    setErrorMessage(null);
    try {
      const { checkoutUrl, attemptId } = await startCheckout({ kind: 'topup', amount });
      await openCheckout(checkoutUrl);
      if (Platform.OS !== 'web') {
        router.replace({ pathname: '/(client)/payment-return', params: { topup: attemptId } });
      }
    } catch (error) {
      setErrorMessage(getPaymentErrorMessage(error));
    } finally {
      setIsPaying(false);
      reloadProfile();
    }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Recargar saldo" backHref="/(client)/profile" />

        {errorMessage ? <Banner message={errorMessage} /> : null}
        {!mercadoPagoEnabled ? (
          <Banner variant="info" message="La recarga con Mercado Pago está disponible solo en Argentina." />
        ) : null}

        <View style={[styles.balanceCard, shadows.card, { backgroundColor: colors.surface }]}>
          <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>SALDO ACTUAL</Text>
          <Text style={[typography.displayLarge, { color: colors.accent }]}>
            {walletBalance !== null ? formatMoney(walletBalance) : '—'}
          </Text>
        </View>

        <Text style={[typography.titleMedium, styles.heading, { color: colors.onSurface }]}>
          ¿Cuánto querés cargar?
        </Text>

        <View style={styles.amountGrid}>
          {topupQuickAmounts.map((value) => {
            const selected = amount === value;
            const enabled = fits(value);
            return (
              <Pressable
                key={value}
                onPress={() => setAmount(value)}
                disabled={!enabled || isPaying}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: !enabled }}
                accessibilityLabel={`Cargar ${formatMoney(value)}`}
                style={[
                  styles.amountOption,
                  {
                    backgroundColor: selected ? colors.primaryContainer : colors.surface,
                    borderColor: selected ? colors.accent : colors.outline,
                    opacity: enabled ? 1 : 0.4,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.titleMedium,
                    { color: selected ? colors.onPrimaryContainer : colors.onSurface },
                  ]}
                >
                  {formatMoney(value)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {room !== null && room < topupQuickAmounts[0] ? (
          <Text style={[typography.bodyMedium, styles.capNote, { color: colors.error }]}>
            Llegaste al saldo máximo de {formatMoney(walletMaxBalance)}. Usá el que tenés antes de recargar.
          </Text>
        ) : null}

        <Card>
          <Text style={[typography.titleMedium, styles.infoHeading, { color: colors.onSurface }]}>
            Cómo funciona
          </Text>
          <InfoItem
            icon="card-outline"
            text="Pagás con Mercado Pago: tarjeta de crédito, débito o dinero en tu cuenta."
          />
          <InfoItem icon="flash-outline" text="El saldo se acredita apenas Mercado Pago aprueba el pago." />
          <InfoItem icon="car-outline" text="Con tu saldo pagás reservas al instante, sin volver a cargar la tarjeta." />
          <InfoItem
            icon="shield-checkmark-outline"
            text={`Podés cargar hasta ${formatMoney(topupMax)} por vez y tener hasta ${formatMoney(walletMaxBalance)} de saldo.`}
          />
        </Card>

        <View style={styles.spacer} />

        <Button
          label={amount !== null ? `Recargar ${formatMoney(amount)} con Mercado Pago` : 'Elegí un monto'}
          onPress={handleTopUp}
          loading={isPaying}
          disabled={isPaying || !selectedFits || !mercadoPagoEnabled}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceCard: {
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  heading: {
    marginBottom: spacing.md,
  },
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  amountOption: {
    // Dos por fila: el gap de la grilla se reparte entre las dos columnas.
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  capNote: {
    marginBottom: spacing.lg,
  },
  infoHeading: {
    marginBottom: spacing.md,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  infoText: {
    flex: 1,
  },
  spacer: {
    height: spacing.sm,
  },
});
