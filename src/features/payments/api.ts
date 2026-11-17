import { FunctionsHttpError } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { getBookingErrorMessage } from '@/features/booking/api';
import { appLimits } from '@/lib/appLimits';
import { formatMoney } from '@/lib/money';
import { supabase } from '@/lib/supabase/client';
import { t } from '@/lib/i18n';

// Pago con Mercado Pago (Checkout Pro). La app nunca ve el access token ni le habla a Mercado
// Pago: pide la orden a la Edge Function mp-create-order, abre el checkout y, al volver,
// consulta el estado en la base (que confirma el webhook o mp-sync). Ver la migración 0084.

// Los montos rápidos y los topes de recarga (por recarga y de saldo total) los configura el equipo
// en el panel y los controla begin_mp_topup (0093): `useAppLimits()` / `appLimits()`.

export type CheckoutTarget = { kind: 'booking'; bookingId: string } | { kind: 'topup'; amount: number };

/**
 * Adónde vuelve el comprador después de pagar. Mercado Pago lo manda a mp-return, que lo
 * redirige acá: el origen de la web publicada, o el esquema de la app en el celular.
 */
function returnTo(): string {
  return Platform.OS === 'web' ? window.location.origin : Linking.createURL('');
}

/** Llama a una Edge Function y, si responde con error, lo convierte en un Error con su código. */
async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(typeof payload?.error === 'string' ? payload.error : error.message);
    }
    throw error;
  }
  return data as T;
}

/** Crea la reserva esperando el pago (10 minutos). Valida igual que el pago con billetera. */
export async function createPendingBooking(params: {
  parkingLotId: string;
  date: string;
  startTime: string;
  endTime: string;
  vehicleId: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_booking_pending_payment', {
    p_parking_lot_id: params.parkingLotId,
    p_date: params.date,
    p_start_time: params.startTime,
    p_end_time: params.endTime,
    p_vehicle_id: params.vehicleId,
  });
  if (error) throw error;
  return data;
}

/** Pide la orden de Checkout Pro. Devuelve la URL de pago y el intento (sirve para la recarga). */
export async function startCheckout(target: CheckoutTarget): Promise<{ checkoutUrl: string; attemptId: string }> {
  const body =
    target.kind === 'booking'
      ? { kind: 'booking', booking_id: target.bookingId, return_to: returnTo() }
      : { kind: 'topup', amount: target.amount, return_to: returnTo() };
  const data = await invokeFunction<{ checkout_url: string; attempt_id: string }>('mp-create-order', body);
  return { checkoutUrl: data.checkout_url, attemptId: data.attempt_id };
}

/**
 * Abre el checkout. En la web navega la página entera (vuelve a /payment-return); en el
 * celular abre un navegador dentro de la app que se cierra solo cuando Mercado Pago vuelve a
 * garagego://payment-return, o cuando el usuario lo cierra. En los dos casos, lo que pasó se
 * consulta después en la base: el resultado del navegador no se usa.
 */
export async function openCheckout(checkoutUrl: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.location.assign(checkoutUrl);
    return;
  }
  await WebBrowser.openAuthSessionAsync(checkoutUrl, Linking.createURL('payment-return'));
}

/**
 * Pide a mp-sync que consulte en Mercado Pago las órdenes de esta reserva o recarga (por si el
 * webhook todavía no llegó) y que ejecute los reembolsos pendientes. Si falla no pasa nada: el
 * webhook y el barrido automático hacen lo mismo.
 */
export async function syncPayment(target: { bookingId: string } | { attemptId: string }): Promise<void> {
  const body = 'bookingId' in target ? { booking_id: target.bookingId } : { attempt_id: target.attemptId };
  await invokeFunction('mp-sync', body).catch(() => {});
}

export type BookingPaymentStatus = {
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  paymentMethod: 'wallet' | 'mercadopago';
  paymentDeadline: string | null;
  secondsLeft: number | null;
  lastPaymentStatus: string | null;
  lastPaymentDetail: string | null;
  refundStatus: 'none' | 'required' | 'done' | 'failed';
  canRetry: boolean;
};

/** null si la reserva no existe o no es del usuario. */
export async function getBookingPaymentStatus(bookingId: string): Promise<BookingPaymentStatus | null> {
  const { data, error } = await supabase.rpc('get_booking_payment_status', { p_booking_id: bookingId });
  if (error) throw error;
  const row = data[0];
  if (!row) return null;
  return {
    status: row.status,
    paymentMethod: row.payment_method,
    paymentDeadline: row.payment_deadline,
    secondsLeft: row.seconds_left,
    lastPaymentStatus: row.last_payment_status,
    lastPaymentDetail: row.last_payment_detail,
    refundStatus: row.refund_status,
    canRetry: row.can_retry,
  };
}

export type TopupStatus = {
  status: 'created' | 'approved' | 'expired' | 'superseded' | 'failed';
  amount: number;
  expiresAt: string;
  lastPaymentStatus: string | null;
  refundStatus: 'none' | 'required' | 'done' | 'failed';
};

/** null si la recarga no existe o no es del usuario. */
export async function getTopupStatus(attemptId: string): Promise<TopupStatus | null> {
  const { data, error } = await supabase.rpc('get_topup_status', { p_attempt_id: attemptId });
  if (error) throw error;
  const row = data[0];
  if (!row) return null;
  return {
    status: row.status,
    amount: row.amount,
    expiresAt: row.expires_at,
    lastPaymentStatus: row.last_payment_status,
    refundStatus: row.refund_status,
  };
}

export function getPaymentErrorMessage(error: unknown): string {
  return t(paymentErrorMessage(error));
}

function paymentErrorMessage(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (message.includes('too_many_pending_payments')) {
    return 'Tenés dos reservas esperando el pago. Pagá o cancelá alguna antes de hacer otra.';
  }
  if (message.includes('payment_window_over')) return 'Se terminó el tiempo para pagar esta reserva.';
  if (message.includes('booking_not_pending')) return 'Esta reserva ya no está esperando el pago.';
  if (message.includes('too_many_payment_attempts')) {
    return 'Llegaste al máximo de intentos de pago para esta reserva. Cancelala y reservá de nuevo.';
  }
  if (message.includes('invalid_topup_amount')) {
    const { topupMin, topupMax } = appLimits();
    return t('El monto de la recarga tiene que ser de entre {min} y {max}.', {
      min: formatMoney(topupMin),
      max: formatMoney(topupMax),
    });
  }
  if (message.includes('topup_limit_reached')) {
    return t('Con esa recarga pasarías el saldo máximo de {max}.', { max: formatMoney(appLimits().walletMaxBalance) });
  }
  // El tope cuenta también las recargas que todavía esperan el pago (0099).
  if (message.includes('topup_pending_limit')) {
    return 'Tenés recargas esperando el pago que, sumadas a esta, pasarían el saldo máximo. Terminalas o esperá a que venzan.';
  }
  if (message.includes('too_many_open_topups')) {
    return 'Tenés recargas sin terminar. Esperá unos minutos antes de iniciar otra.';
  }
  if (message.includes('mp_unavailable')) {
    return 'No pudimos conectarnos con Mercado Pago. Intentá de nuevo en unos minutos.';
  }
  if (message.includes('invalid_return_to')) return 'No se pudo iniciar el pago desde esta versión de la app.';
  return getBookingErrorMessage(error);
}
