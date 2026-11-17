// mp-sync — red de seguridad para los webhooks que no llegan y los reembolsos que fallaron.
//
// Modo usuario (Authorization: Bearer <JWT>), body { booking_id } o { attempt_id }:
//   * La app lo llama al volver de Mercado Pago, para no depender de que el webhook ya haya
//     llegado: consulta las órdenes de esa reserva o recarga y las procesa.
//   * También lo llama justo después de cancelar una reserva pagada con Mercado Pago (puede
//     ser el conductor o el propietario), para que el reembolso salga en segundos.
//
// Modo barrido (header x-cron-secret = MP_SYNC_CRON_SECRET), lo corre pg_cron cada 5 minutos:
//   revisa las órdenes de los intentos de las últimas 72 horas que no se aplicaron y reintenta
//   los reembolsos pendientes.

import { isUuid, timingSafeEqualHex } from '../_shared/mercadopago-core.ts';
import { env, json, preflight, readJson } from '../_shared/http.ts';
import { describeError } from '../_shared/mp-client.ts';
import { processPendingRefunds, syncAttempts } from '../_shared/process-payment.ts';
import { adminClient, userIdFromRequest } from '../_shared/supabase.ts';

const SWEEP_WINDOW_HOURS = 72;
const SWEEP_LIMIT = 50;

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const cronSecret = req.headers.get('x-cron-secret');

  try {
    if (cronSecret) {
      if (!timingSafeEqual(cronSecret, env('MP_SYNC_CRON_SECRET'))) return json({ error: 'forbidden' }, 403);

      const since = new Date(Date.now() - SWEEP_WINDOW_HOURS * 3600 * 1000).toISOString();
      const { data: attempts, error } = await admin
        .from('mp_checkout_attempts')
        .select('id, mp_order_id')
        .in('status', ['created', 'expired'])
        .not('mp_order_id', 'is', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(SWEEP_LIMIT);
      if (error) throw new Error(error.message);

      const payments = await syncAttempts(admin, attempts ?? []);
      const refunds = await processPendingRefunds(admin);
      return json({ mode: 'sweep', attempts: attempts?.length ?? 0, payments, refunds });
    }

    const userId = await userIdFromRequest(req);
    if (!userId) return json({ error: 'No autenticado' }, 401);

    const body = await readJson(req);
    const attemptId = body.attempt_id;
    const bookingId = body.booking_id;

    if (isUuid(attemptId)) {
      const { data: attempt, error } = await admin
        .from('mp_checkout_attempts')
        .select('id, mp_order_id, user_id')
        .eq('id', attemptId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!attempt || attempt.user_id !== userId) return json({ error: 'not_found' }, 404);

      const payments = await syncAttempts(admin, [attempt]);
      return json({ mode: 'attempt', payments });
    }

    if (isUuid(bookingId)) {
      const { data: booking, error } = await admin
        .from('bookings')
        .select('id, user_id, parking_lots(owner_id)')
        .eq('id', bookingId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const ownerId = (booking?.parking_lots as { owner_id?: string } | null)?.owner_id;
      if (!booking || (booking.user_id !== userId && ownerId !== userId)) return json({ error: 'not_found' }, 404);

      const { data: attempts, error: attemptsError } = await admin
        .from('mp_checkout_attempts')
        .select('id, mp_order_id')
        .eq('booking_id', bookingId)
        .not('mp_order_id', 'is', null);
      if (attemptsError) throw new Error(attemptsError.message);

      const payments = await syncAttempts(admin, attempts ?? []);
      const refunds = await processPendingRefunds(admin, { bookingId });
      return json({ mode: 'booking', payments, refunds });
    }

    return json({ error: 'Falta booking_id o attempt_id' }, 400);
  } catch (error) {
    console.error('mp-sync:', describeError(error));
    return json({ error: 'temporary_failure' }, 500);
  }
});

function timingSafeEqual(a: string, b: string): boolean {
  // timingSafeEqualHex compara caracter por caracter sin cortar antes: sirve para cualquier texto.
  return timingSafeEqualHex(a, b) && a === b;
}
