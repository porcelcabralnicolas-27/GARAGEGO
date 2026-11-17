import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { cancelBooking, getBookingErrorMessage } from '@/features/booking/api';
import {
  getBookingPaymentStatus,
  getPaymentErrorMessage,
  getTopupStatus,
  openCheckout,
  startCheckout,
  syncPayment,
  type BookingPaymentStatus,
  type TopupStatus,
} from '@/features/payments/api';
import { formatMoney } from '@/lib/money';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { spacing, useTheme } from '@/theme';
import { t } from '@/lib/i18n';

/** Cada cuánto se vuelve a mirar el estado mientras el pago está en curso. */
const POLL_MS = 3000;
/** Una segunda consulta a Mercado Pago por si el webhook se demora. */
const SECOND_SYNC_MS = 20_000;

type ReturnView = {
  icon: keyof typeof Ionicons.glyphMap | 'spinner';
  tone: 'success' | 'error' | 'neutral';
  title: string;
  body: string;
};

// Adonde vuelve el comprador desde Mercado Pago (mp-return redirige a /payment-return), y
// adonde lleva la app después de abrir el checkout. Sirve para reservas (?booking=<id>) y para
// recargas (?topup=<id del intento>).
//
// Nunca confía en lo que dice la URL (?result=success lo puede escribir cualquiera): el estado
// sale de la base, que solo cambia cuando la Edge Function verificó el pago en Mercado Pago.
export default function PaymentReturnScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, typography } = useTheme();
  const reloadProfile = useAuthStore((s) => s.reloadProfile);
  const { booking: bookingId, topup: attemptId } = useLocalSearchParams<{ booking?: string; topup?: string }>();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [synced, setSynced] = useState(false);

  const bookingQuery = useQuery({
    queryKey: queryKeys.payments.booking(bookingId ?? ''),
    queryFn: () => getBookingPaymentStatus(bookingId!),
    enabled: !!bookingId,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? POLL_MS : false),
  });
  const topupQuery = useQuery({
    queryKey: queryKeys.payments.topup(attemptId ?? ''),
    queryFn: () => getTopupStatus(attemptId!),
    enabled: !bookingId && !!attemptId,
    refetchInterval: (query) => (query.state.data?.status === 'created' ? POLL_MS : false),
  });

  // Al llegar se le pide a mp-sync que consulte Mercado Pago (por si el webhook todavía no
  // llegó), y otra vez a los 20 segundos si sigue sin resolverse.
  useEffect(() => {
    const target = bookingId ? { bookingId } : attemptId ? { attemptId } : null;
    if (!target) return;
    let cancelled = false;
    const run = () =>
      syncPayment(target).finally(() => {
        if (cancelled) return;
        setSynced(true);
        if (bookingId) bookingQuery.refetch();
        else topupQuery.refetch();
      });
    run();
    const timer = setTimeout(run, SECOND_SYNC_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, attemptId]);

  // Cuando se resuelve, se actualiza el saldo y las listas de reservas.
  const resolved =
    (bookingQuery.data && bookingQuery.data.status !== 'pending') ||
    (topupQuery.data && topupQuery.data.status !== 'created');
  const refreshedRef = useRef(false);
  useEffect(() => {
    if (!resolved || refreshedRef.current) return;
    refreshedRef.current = true;
    reloadProfile();
    queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.wallet.all });
  }, [resolved, reloadProfile, queryClient]);

  const retryPayment = async () => {
    if (!bookingId) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const { checkoutUrl } = await startCheckout({ kind: 'booking', bookingId });
      await openCheckout(checkoutUrl);
      if (Platform.OS !== 'web') {
        await syncPayment({ bookingId });
        await bookingQuery.refetch();
      }
    } catch (error) {
      setErrorMessage(getPaymentErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const cancel = async () => {
    if (!bookingId) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await cancelBooking(bookingId);
      await bookingQuery.refetch();
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const isLoading = bookingId ? bookingQuery.isLoading : topupQuery.isLoading;
  const view: ReturnView | null = isLoading
    ? null
    : bookingId
      ? describeBooking(bookingQuery.data ?? null, synced)
      : attemptId
        ? describeTopup(topupQuery.data ?? null, synced)
        : { icon: 'help-circle-outline', tone: 'neutral', title: t('Enlace de pago inválido'), body: t('Revisá tus reservas.') };

  const toneColor =
    view?.tone === 'success' ? colors.onPrimaryContainer : view?.tone === 'error' ? colors.error : colors.onSurfaceVariant;
  const bookingStatus = bookingQuery.data;

  return (
    <Screen>
      <View style={styles.container}>
        {errorMessage ? <Banner message={errorMessage} /> : null}

        {!view ? (
          <ActivityIndicator size="large" color={colors.accent} />
        ) : (
          <>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: view.tone === 'success' ? colors.primaryContainer : colors.surfaceVariant },
              ]}
            >
              {view.icon === 'spinner' ? (
                <ActivityIndicator size="large" color={colors.accent} />
              ) : (
                <Ionicons name={view.icon} size={64} color={toneColor} />
              )}
            </View>
            <Text style={[typography.titleLarge, styles.title, { color: colors.onSurface }]}>{view.title}</Text>
            <Text style={[typography.bodyMedium, styles.body, { color: colors.onSurfaceVariant }]}>{view.body}</Text>
          </>
        )}

        <View style={styles.actions}>
          {/* Reserva pagada */}
          {bookingId && bookingStatus && bookingStatus.status !== 'pending' && bookingStatus.status !== 'cancelled' ? (
            <>
              <Button
                label={t('Ver mi reserva')}
                onPress={() => router.replace({ pathname: '/(client)/bookings/[id]', params: { id: bookingId } })}
              />
              <Button label={t('Volver al inicio')} variant="outlined" onPress={() => router.replace('/(client)')} />
            </>
          ) : null}

          {/* Reserva esperando el pago */}
          {bookingId && bookingStatus?.status === 'pending' ? (
            <>
              {bookingStatus.canRetry ? (
                <Button label={t('Pagar con Mercado Pago')} onPress={retryPayment} loading={isBusy} disabled={isBusy} />
              ) : null}
              <Button label={t('Cancelar reserva')} variant="outlined" onPress={cancel} disabled={isBusy} />
            </>
          ) : null}

          {/* Reserva cancelada o vencida */}
          {bookingId && bookingStatus?.status === 'cancelled' ? (
            <>
              <Button label={t('Buscar otro lugar')} onPress={() => router.replace('/(client)')} />
              <Button label={t('Mis reservas')} variant="outlined" onPress={() => router.replace('/(client)/bookings')} />
            </>
          ) : null}

          {/* Recarga, en cualquier estado */}
          {!bookingId && attemptId ? (
            <Button
              label={t('Volver al perfil')}
              variant={topupQuery.data?.status === 'created' ? 'outlined' : 'filled'}
              onPress={() => router.replace('/(client)/profile')}
            />
          ) : null}

          {/* Reserva que no es del usuario o enlace sin datos */}
          {(bookingId && !isLoading && !bookingStatus) || (!bookingId && !attemptId) ? (
            <Button label={t('Mis reservas')} onPress={() => router.replace('/(client)/bookings')} />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

function describeBooking(status: BookingPaymentStatus | null, synced: boolean): ReturnView {
  if (!status) {
    return { icon: 'help-circle-outline', tone: 'neutral', title: t('No encontramos este pago'), body: t('Revisá tus reservas.') };
  }
  if (status.status === 'confirmed' || status.status === 'completed') {
    return {
      icon: 'checkmark',
      tone: 'success',
      title: t('¡Pago realizado con éxito!'),
      body: t('Ya reservaste tu lugar. Podés ver el comprobante y el detalle en Mis reservas.'),
    };
  }
  if (status.status === 'cancelled') {
    if (status.refundStatus === 'done') {
      return {
        icon: 'arrow-undo',
        tone: 'neutral',
        title: t('Te devolvimos el dinero'),
        body: t('La reserva se canceló y el pago volvió a tu cuenta de Mercado Pago.'),
      };
    }
    if (status.refundStatus !== 'none') {
      return {
        icon: 'arrow-undo',
        tone: 'neutral',
        title: t('Estamos devolviendo tu dinero'),
        body: t('La reserva se canceló. El pago vuelve a tu cuenta de Mercado Pago en unos minutos.'),
      };
    }
    return {
      icon: 'time-outline',
      tone: 'error',
      title: t('La reserva se canceló'),
      body: t('No recibimos el pago a tiempo o la cancelaste. El lugar quedó libre: podés reservar de nuevo.'),
    };
  }
  // Esperando el pago.
  if (status.lastPaymentStatus === 'rejected') {
    return {
      icon: 'alert',
      tone: 'error',
      title: t('El pago fue rechazado'),
      body: status.canRetry
        ? t('Probá de nuevo con otro medio de pago. Te guardamos el lugar {time} más.', { time: minutesLeft(status) })
        : t('Se terminó el tiempo para pagar esta reserva.'),
    };
  }
  if (!status.canRetry) {
    return {
      icon: 'spinner',
      tone: 'neutral',
      title: t('Verificando el pago…'),
      body: t('Si pagaste, la reserva se confirma en unos segundos. Si no, se cancela sola.'),
    };
  }
  return {
    icon: 'spinner',
    tone: 'neutral',
    title: synced ? t('Esperando la confirmación del pago…') : t('Procesando tu pago…'),
    body: t('Si ya pagaste, esperá unos segundos. Si no llegaste a pagar, podés hacerlo ahora: te guardamos el lugar {time}.', {
      time: minutesLeft(status),
    }),
  };
}

function describeTopup(status: TopupStatus | null, synced: boolean): ReturnView {
  if (!status) {
    return { icon: 'help-circle-outline', tone: 'neutral', title: t('No encontramos esta recarga'), body: t('Revisá tu saldo en el perfil.') };
  }
  if (status.status === 'approved') {
    return {
      icon: 'checkmark',
      tone: 'success',
      title: t('Recarga acreditada'),
      body: t('Se sumaron {amount} a tu billetera.', { amount: formatMoney(status.amount) }),
    };
  }
  if (status.refundStatus !== 'none') {
    return {
      icon: 'arrow-undo',
      tone: 'neutral',
      title: t('Te devolvemos el dinero'),
      body: t('No pudimos acreditar este pago y lo devolvemos a tu cuenta de Mercado Pago.'),
    };
  }
  if (status.lastPaymentStatus === 'rejected') {
    return {
      icon: 'alert',
      tone: 'error',
      title: t('El pago fue rechazado'),
      body: t('No se acreditó nada. Podés intentar de nuevo desde tu perfil con otro medio de pago.'),
    };
  }
  if (status.status === 'created') {
    return {
      icon: 'spinner',
      tone: 'neutral',
      title: synced ? t('Esperando la confirmación del pago…') : t('Procesando tu recarga…'),
      body: t('Si ya pagaste, el saldo se acredita en unos segundos.'),
    };
  }
  return {
    icon: 'close',
    tone: 'error',
    title: t('La recarga no se completó'),
    body: t('No recibimos el pago. Podés intentar de nuevo desde tu perfil.'),
  };
}

function minutesLeft(status: BookingPaymentStatus): string {
  const minutes = Math.max(1, Math.floor((status.secondsLeft ?? 0) / 60));
  return minutes === 1 ? t('1 minuto') : t('{count} minutos', { count: minutes });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  iconCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  actions: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
});
