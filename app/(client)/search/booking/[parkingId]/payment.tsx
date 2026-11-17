import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BusinessTimeNote } from '@/components/booking/BusinessTimeNote';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useGoBack } from '@/hooks/useGoBack';
import { useRegion } from '@/hooks/useRegion';
import { createBooking, getBookingErrorMessage } from '@/features/booking/api';
import { computeBookingPrice } from '@/features/booking/pricing';
import { getParkingLot } from '@/features/parking/api';
import { createPendingBooking, getPaymentErrorMessage, openCheckout, startCheckout } from '@/features/payments/api';
import { formatMoney } from '@/lib/money';
import { queryKeys } from '@/lib/queryKeys';
import { businessToDisplay, formatCalendarDayLong } from '@/lib/time';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, spacing, useTheme } from '@/theme';
import { t } from '@/lib/i18n';

type PaymentMethod = 'wallet' | 'mercadopago';

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

/** Tarjeta de un método de pago, elegible como un radio. */
function MethodOption({
  icon,
  title,
  subtitle,
  selected,
  onPress,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
  children?: ReactNode;
}) {
  const { colors, typography } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={title} style={selected ? { borderColor: colors.accent, borderWidth: 2 } : null}>
      <View style={styles.methodRow}>
        <View style={[styles.methodIcon, { backgroundColor: colors.primaryContainer }]}>
          <Ionicons name={icon} size={22} color={colors.onPrimaryContainer} />
        </View>
        <View style={styles.methodBody}>
          <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{title}</Text>
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{subtitle}</Text>
        </View>
        <Ionicons
          name={selected ? 'radio-button-on' : 'radio-button-off'}
          size={24}
          color={selected ? colors.accent : colors.onSurfaceVariant}
        />
      </View>
      {children}
    </Card>
  );
}

export default function PaymentScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, typography } = useTheme();
  const { parkingId, date, startTime, endTime, vehicleId } = useLocalSearchParams<{
    parkingId: string;
    date: string;
    startTime: string;
    endTime: string;
    vehicleId: string;
  }>();
  const goBack = useGoBack({ pathname: '/(client)/search/booking/[parkingId]', params: { parkingId } });

  const walletBalance = useAuthStore((s) => s.walletBalance);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);

  const { data: lot, isError: loadError } = useQuery({
    queryKey: queryKeys.parkingLots.detail(parkingId),
    queryFn: () => getParkingLot(parkingId),
    // El total mostrado sale de este precio: siempre el vigente, no uno en cache.
    staleTime: 0,
  });
  const region = useRegion();
  const [selectedMethod, setMethod] = useState<PaymentMethod>('wallet');
  // Mercado Pago opera solo en Argentina: en la demo de Estados Unidos se paga con la billetera.
  const method: PaymentMethod = region.mercadoPagoEnabled ? selectedMethod : 'wallet';
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const isPayingRef = useRef(false);
  // Si esta pantalla abrió el pago con Mercado Pago, al irse se borra el flujo de reserva de la
  // pila de búsqueda (igual que la pantalla de pago exitoso): la reserva ya existe y la próxima
  // búsqueda tiene que arrancar de cero.
  const leftForCheckoutRef = useRef(false);

  useEffect(
    () =>
      navigation.addListener('blur', () => {
        if (!leftForCheckoutRef.current) return;
        setTimeout(
          () => navigation.getParent()?.dispatch({ type: 'RESET', payload: { index: 0, routes: [{ name: 'index' }] } }),
          0
        );
      }),
    [navigation]
  );

  // El precio se recalcula acá en vez de viajar por parámetros: así lo que se muestra sale
  // siempre del precio vigente del estacionamiento. El monto que se cobra de verdad lo calcula
  // el servidor (create_booking / create_booking_pending_payment).
  const total = lot ? computeBookingPrice(lot.pricePerHour, startTime, endTime) : null;
  const hasEnoughBalance = total !== null && walletBalance !== null && walletBalance >= total;
  // La reserva viaja en hora de la cochera; se muestra en la de la región.
  const shownStart = businessToDisplay(date, startTime);
  const shownEnd = businessToDisplay(date, endTime);

  const payWithWallet = async () => {
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
    }
  };

  const payWithMercadoPago = async () => {
    let bookingId: string;
    try {
      // La reserva se crea primero: el lugar queda tomado mientras se paga (10 minutos).
      bookingId = await createPendingBooking({ parkingLotId: parkingId, date, startTime, endTime, vehicleId });
    } catch (error) {
      setErrorMessage(getPaymentErrorMessage(error));
      return;
    }

    leftForCheckoutRef.current = true;
    let checkoutUrl: string | null = null;
    try {
      ({ checkoutUrl } = await startCheckout({ kind: 'booking', bookingId }));
    } catch {
      // La reserva ya existe: la pantalla de procesamiento muestra el error y permite reintentar.
    }

    if (checkoutUrl) await openCheckout(checkoutUrl);
    // En la web openCheckout navega la página entera a Mercado Pago, que después vuelve a
    // /payment-return. En el celular se vuelve acá cuando se cierra el navegador.
    if (checkoutUrl && Platform.OS === 'web') return;
    router.navigate({ pathname: '/(client)/payment-return', params: { booking: bookingId } });
  };

  const handlePay = async () => {
    if (isPayingRef.current) return;
    isPayingRef.current = true;
    setIsPaying(true);
    setErrorMessage(null);
    try {
      await (method === 'wallet' ? payWithWallet() : payWithMercadoPago());
    } finally {
      isPayingRef.current = false;
      setIsPaying(false);
    }
  };

  if (loadError) {
    return (
      <Screen>
        <ScreenHeader title={t('Pago')} onBack={goBack} />
        <Banner message={t('No se pudo cargar este estacionamiento.')} />
      </Screen>
    );
  }

  if (!lot || total === null) {
    return (
      <Screen>
        <ScreenHeader title={t('Pago')} onBack={goBack} />
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{t('Cargando…')}</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView>
        <ScreenHeader title={t('Pago')} onBack={goBack} />

        {errorMessage ? <Banner message={errorMessage} /> : null}

        <Text style={[typography.titleLarge, styles.heading, { color: colors.onSurface }]}>
          {t('Elegí el método de pago')}
        </Text>

        {/* Resumen de lo que se está por pagar */}
        <Card>
          <SummaryRow label={t('Lugar')} value={lot.name} />
          <SummaryRow label={t('Fecha')} value={formatCalendarDayLong(shownStart.date)} />
          <SummaryRow label={t('Horario')} value={`${shownStart.time} – ${shownEnd.time}`} />
          <View style={[styles.divider, { backgroundColor: colors.outline }]} />
          <View style={styles.totalRow}>
            <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{t('Total')}</Text>
            <Text style={[typography.titleLarge, { color: colors.accent }]}>{formatMoney(total)}</Text>
          </View>
        </Card>

        <BusinessTimeNote />

        <MethodOption
          icon="wallet-outline"
          title={t('Billetera GarageGo')}
          subtitle={t('Saldo: {amount}', { amount: walletBalance !== null ? formatMoney(walletBalance) : '—' })}
          selected={method === 'wallet'}
          onPress={() => setMethod('wallet')}
        >
          {method === 'wallet' && !hasEnoughBalance ? (
            <Text style={[typography.bodyMedium, styles.methodNote, { color: colors.error }]}>
              {region.mercadoPagoEnabled
                ? t('Te falta saldo para esta reserva. Pagá con Mercado Pago o cargá saldo desde tu perfil.')
                : t('Te falta saldo para esta reserva.')}
            </Text>
          ) : null}
        </MethodOption>

        {region.mercadoPagoEnabled ? (
          <MethodOption
            icon="card-outline"
            title={t('Mercado Pago')}
            subtitle={t('Tarjeta de crédito, débito o dinero en tu cuenta')}
            selected={method === 'mercadopago'}
            onPress={() => setMethod('mercadopago')}
          >
            {method === 'mercadopago' ? (
              <Text style={[typography.bodyMedium, styles.methodNote, { color: colors.onSurfaceVariant }]}>
                {t('Te guardamos el lugar 10 minutos mientras completás el pago en Mercado Pago.')}
              </Text>
            ) : null}
          </MethodOption>
        ) : null}

        <View style={styles.spacer} />

        <Button
          label={
            method === 'wallet'
              ? t('Pagar {amount} con billetera', { amount: formatMoney(total) })
              : t('Pagar {amount} con Mercado Pago', { amount: formatMoney(total) })
          }
          onPress={handlePay}
          loading={isPaying}
          disabled={isPaying || (method === 'wallet' && !hasEnoughBalance)}
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
  methodNote: {
    marginTop: spacing.md,
  },
  spacer: {
    height: spacing.sm,
  },
});
