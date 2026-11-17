// Lo que hacen el webhook, mp-sync y el barrido con una orden ya consultada en la API:
// pasarle cada pago a la base (apply_mp_payment decide confirmar, acreditar o reembolsar) y
// ejecutar los reembolsos que la base dejó marcados.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { isUuid, readOrder } from './mercadopago-core.ts';
import { describeError, getOrder, refundOrderPayment, type MpOrder } from './mp-client.ts';

export type PaymentResult = { paymentId: string; result: string; refund?: 'done' | 'failed' };

/** La cuenta de Mercado Pago es de Argentina: si la orden no informa moneda, es ARS. */
const DEFAULT_CURRENCY = 'ARS';
/** Después de tantos intentos fallidos, el reembolso queda para revisión manual. */
const MAX_REFUND_ATTEMPTS = 10;

export async function processOrder(admin: SupabaseClient, order: MpOrder): Promise<PaymentResult[]> {
  const { orderId, externalReference, currency, payments } = readOrder(order);
  // Una orden sin nuestra referencia no es de GarageGo (o es la notificación de prueba).
  if (!isUuid(externalReference)) return [];

  const results: PaymentResult[] = [];
  for (const payment of payments) {
    const { data, error } = await admin.rpc('apply_mp_payment', {
      p_attempt_id: externalReference,
      p_payment_id: payment.id,
      p_order_id: orderId,
      p_status: payment.status,
      p_status_detail: payment.statusDetail ?? payment.rawStatus,
      p_amount: payment.amount,
      p_currency: currency ?? DEFAULT_CURRENCY,
    });
    if (error) throw new Error(`apply_mp_payment(${payment.id}): ${error.message}`);

    const result: PaymentResult = { paymentId: payment.id, result: String(data) };
    if (data === 'refund_required') {
      result.refund = await executeRefund(admin, payment.id, order);
    }
    results.push(result);
  }
  return results;
}

/**
 * Ejecuta el reembolso de un pago marcado como 'required' o 'failed' y lo registra. Antes de
 * pedirlo, mira la orden: si Mercado Pago ya lo reembolsó (un intento anterior que salió bien
 * pero no se llegó a registrar), solo lo registra.
 */
export async function executeRefund(
  admin: SupabaseClient,
  paymentId: string,
  knownOrder?: MpOrder
): Promise<'done' | 'failed'> {
  const { data: row, error } = await admin
    .from('mp_payments')
    .select('mp_order_id, amount, refund_status')
    .eq('mp_payment_id', paymentId)
    .maybeSingle();
  if (error) throw new Error(`mp_payments(${paymentId}): ${error.message}`);
  if (!row) return 'failed';
  if (row.refund_status === 'done') return 'done';

  const record = async (ok: boolean, refundId: string | null, message: string | null) => {
    const { error: recordError } = await admin.rpc('record_mp_refund', {
      p_payment_id: paymentId,
      p_refund_id: refundId,
      p_ok: ok,
      p_error: message,
    });
    if (recordError) throw new Error(`record_mp_refund(${paymentId}): ${recordError.message}`);
  };

  if (!row.mp_order_id || row.amount === null) {
    await record(false, null, 'El pago no tiene orden o monto registrado');
    return 'failed';
  }

  try {
    const order = knownOrder ?? (await getOrder(row.mp_order_id));
    const previous = order ? findRefundId(order, paymentId) : null;
    if (previous) {
      await record(true, previous, null);
      return 'done';
    }

    const refunded = await refundOrderPayment(row.mp_order_id, paymentId, Number(row.amount));
    await record(true, findRefundId(refunded, paymentId), null);
    return 'done';
  } catch (refundError) {
    await record(false, null, describeError(refundError));
    return 'failed';
  }
}

/** Reintenta los reembolsos pendientes (todos, o los de una reserva). */
export async function processPendingRefunds(
  admin: SupabaseClient,
  filter: { bookingId?: string } = {}
): Promise<Array<{ paymentId: string; refund: 'done' | 'failed' }>> {
  let query = admin
    .from('mp_payments')
    .select('mp_payment_id')
    .in('refund_status', ['required', 'failed'])
    .lt('refund_attempts', MAX_REFUND_ATTEMPTS)
    .limit(50);
  if (filter.bookingId) query = query.eq('booking_id', filter.bookingId);

  const { data, error } = await query;
  if (error) throw new Error(`reembolsos pendientes: ${error.message}`);

  const results = [];
  for (const { mp_payment_id } of data ?? []) {
    results.push({ paymentId: mp_payment_id as string, refund: await executeRefund(admin, mp_payment_id as string) });
  }
  return results;
}

/** Vuelve a consultar en Mercado Pago las órdenes de unos intentos y procesa sus pagos. */
export async function syncAttempts(
  admin: SupabaseClient,
  attempts: Array<{ id: string; mp_order_id: string | null }>
): Promise<PaymentResult[]> {
  const results: PaymentResult[] = [];
  for (const attempt of attempts) {
    if (!attempt.mp_order_id) continue;
    const order = await getOrder(attempt.mp_order_id);
    if (order) results.push(...(await processOrder(admin, order)));
  }
  return results;
}

/**
 * El id del reembolso de un pago dentro de una orden. Un reembolso ya procesado cuenta aunque
 * el pago todavía figure como acreditado: es la señal de que no hay que pedirlo de nuevo.
 */
function findRefundId(order: MpOrder, paymentId: string): string | null {
  const transactions = order.transactions as { refunds?: Array<Record<string, unknown>> } | undefined;
  const refund = (transactions?.refunds ?? []).find(
    (r) => String(r.transaction_id ?? '') === paymentId && String(r.status ?? '') !== 'failed'
  );
  return refund ? String(refund.id) : null;
}
