import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { createBooking, getBookingErrorMessage } from '@/features/booking/api';
import { computeBookingPrice } from '@/features/booking/pricing';
import { getParkingLot } from '@/features/parking/api';
import type { ParkingLot } from '@/features/parking/types';
import { getTopupErrorMessage, topupWallet } from '@/features/profile/api';
import { formatMoney } from '@/lib/money';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, spacing, useTheme } from '@/theme';

/** Montos de la recarga de prueba, los mismos que ofrece el perfil. */
const TOPUP_PRESETS = [1000, 3000, 5000];

const DAY_LABELS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function formatLongDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const dd = date.getDate().toString().padStart(2, '0');
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${DAY_LABELS[date.getDay()]} ${dd}/${mm}`;
}

/** Una fila del resumen de la reserva: etiqueta a la izquierda, valor a la derecha. */
function SummaryRow({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.summaryRow}>
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[typography.bodyMedium, styles.summaryValue, { color: colors.onSurface }]}>{value}</Text>
    </View>
  );
}

export default function PaymentScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { parkingId, date, startTime, endTime, vehicleId } = useLocalSearchParams<{
    parkingId: string;
    date: string;
    startTime: string;
    endTime: string;
    vehicleId: string;
  }>();

  const walletBalance = useAuthStore((s) => s.walletBalance);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);

  const [lot, setLot] = useState<ParkingLot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [toppingUpAmount, setToppingUpAmount] = useState<number | null>(null);
  const isPayingRef = useRef(false);

  useEffect(() => {
    getParkingLot(parkingId)
      .then(setLot)
      .catch(() => setLoadError('No se pudo cargar este estacionamiento.'));
  }, [parkingId]);

  // El precio se recalcula acá en vez de viajar por parámetros: así lo que se muestra sale
  // siempre del precio vigente del estacionamiento. El monto que se cobra de verdad lo calcula
  // `create_booking` en el servidor.
  const total = lot ? computeBookingPrice(lot.pricePerHour, startTime, endTime) : null;
  const hasEnoughBalance = total !== null && walletBalance !== null && walletBalance >= total;

  const handleTopUp = async (amount: number) => {
    setToppingUpAmount(amount);
    setErrorMessage(null);
    try {
      await topupWallet(amount);
      reloadProfile();
    } catch (error) {
      setErrorMessage(getTopupErrorMessage(error));
    } finally {
      setToppingUpAmount(null);
    }
  };

  const handlePay = async () => {
    if (isPayingRef.current) return;
    isPayingRef.current = true;
    setIsPaying(true);
    setErrorMessage(null);
    try {
      const bookingId = await createBooking({ parkingLotId: parkingId, date, startTime, endTime, vehicleId });
      reloadProfile();
      // `replace` y no `push`: una vez cobrada la reserva, volver atrás a esta pantalla y
      // tocar "Pagar" de nuevo crearía una segunda reserva.
      router.replace({
        pathname: '/(client)/search/booking/[parkingId]/result',
        params: { parkingId, status: 'success', bookingId },
      });
    } catch (error) {
      const message = getBookingErrorMessage(error);
      const isPaymentFailure =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message).includes('insufficient_balance')
          : false;

      // Solo el saldo insuficiente es un fallo de pago y se lleva la pantalla de error. El
      // resto (horario tomado, buffer, horario pasado) son problemas de disponibilidad: se
      // muestran acá mismo para que el usuario pueda volver y elegir otro horario.
      if (isPaymentFailure) {
        router.push({
          pathname: '/(client)/search/booking/[parkingId]/result',
          params: { parkingId, status: 'error', reason: message },
        });
      } else {
        setErrorMessage(message);
      }
    } finally {
      isPayingRef.current = false;
      setIsPaying(false);
    }
  };

  const backHref = {
    pathname: '/(client)/search/booking/[parkingId]' as const,
    params: { parkingId },
  };

  if (loadError) {
    return (
      <Screen>
        <ScreenHeader title="Pago" backHref={backHref} />
        <Banner message={loadError} />
      </Screen>
    );
  }

  if (!lot || total === null) {
    return (
      <Screen>
        <ScreenHeader title="Pago" backHref={backHref} />
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView>
        <ScreenHeader title="Pago" backHref={backHref} />

        {errorMessage ? <Banner message={errorMessage} /> : null}

        <Text style={[typography.titleLarge, styles.heading, { color: colors.onSurface }]}>
          Elegí el método de pago
        </Text>

        {/* Resumen de lo que se está por pagar */}
        <Card>
          <SummaryRow label="Lugar" value={lot.name} />
          <SummaryRow label="Fecha" value={formatLongDate(date)} />
          <SummaryRow label="Horario" value={`${startTime} – ${endTime}`} />
          <View style={[styles.divider, { backgroundColor: colors.outline }]} />
          <View style={styles.totalRow}>
            <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Total</Text>
            <Text style={[typography.titleLarge, { color: colors.accent }]}>{formatMoney(total)}</Text>
          </View>
        </Card>

        {/* Billetera — único método real hoy (Fase 8, Q2·A) */}
        <Card>
          <View style={styles.methodRow}>
            <View style={[styles.methodIcon, { backgroundColor: colors.primaryContainer }]}>
              <Ionicons name="wallet-outline" size={22} color={colors.onPrimaryContainer} />
            </View>
            <View style={styles.methodBody}>
              <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Billetera GarageGo</Text>
              <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
                Saldo: {walletBalance !== null ? formatMoney(walletBalance) : '—'}
              </Text>
            </View>
            <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
          </View>

          {!hasEnoughBalance ? (
            <>
              <Text style={[typography.bodyMedium, styles.topUpNote, { color: colors.error }]}>
                Te falta saldo para esta reserva. Recargá para continuar.
              </Text>
              <Text style={[typography.label, styles.topUpHint, { color: colors.onSurfaceVariant }]}>
                Recarga de prueba (todavía no hay pasarela de pago real)
              </Text>
              <View style={styles.topUpRow}>
                {TOPUP_PRESETS.map((amount) => (
                  <Button
                    key={amount}
                    label={`+ ${formatMoney(amount)}`}
                    size="compact"
                    variant="outlined"
                    onPress={() => handleTopUp(amount)}
                    loading={toppingUpAmount === amount}
                    disabled={toppingUpAmount !== null || isPaying}
                  />
                ))}
              </View>
            </>
          ) : null}
        </Card>

        {/* Tarjetas: el Figma las muestra, pero la app no tiene pasarela ni las guarda. Se deja
            la sección visible y deshabilitada en vez de prometer algo que no funciona. */}
        <Card>
          <View style={styles.methodRow}>
            <View style={[styles.methodIcon, { backgroundColor: colors.surfaceVariant }]}>
              <Ionicons name="card-outline" size={22} color={colors.onSurfaceVariant} />
            </View>
            <View style={styles.methodBody}>
              <Text style={[typography.titleMedium, { color: colors.onSurfaceVariant }]}>
                Tarjeta de crédito o débito
              </Text>
              <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
                No disponible por ahora
              </Text>
            </View>
            <View style={[styles.soonChip, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>PRÓXIMAMENTE</Text>
            </View>
          </View>
        </Card>

        <View style={styles.spacer} />

        <Button
          label={`Pagar ${formatMoney(total)} con billetera`}
          onPress={handlePay}
          loading={isPaying}
          disabled={isPaying || !hasEnoughBalance || toppingUpAmount !== null}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  summaryValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodBody: {
    flex: 1,
  },
  soonChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  topUpNote: {
    marginTop: spacing.md,
  },
  topUpHint: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  topUpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  spacer: {
    height: spacing.sm,
  },
});
