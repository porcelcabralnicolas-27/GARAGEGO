// mp-create-order — la llama la app (usuario logueado) para pagar una reserva pendiente o
// recargar la billetera. Abre el intento en la base con el JWT del usuario (así la base valida
// que la reserva sea suya, el plazo y los topes), crea la orden de Checkout Pro y devuelve la
// URL a la que hay que mandar al comprador.
//
// Body: { kind: 'booking', booking_id, return_to } | { kind: 'topup', amount, return_to }
//   return_to: origen de la web (window.location.origin) o 'garagego://' en el celular.

import {
  buildCheckoutOrderBody,
  buildMpReturnUrl,
  isUuid,
  resolveReturnTarget,
  type ReturnKind,
} from '../_shared/mercadopago-core.ts';
import { env, json, preflight, readJson } from '../_shared/http.ts';
import { createOrder, describeError } from '../_shared/mp-client.ts';
import { adminClient, userClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'No autenticado' }, 401);

  const body = await readJson(req);
  const kind = body.kind as ReturnKind;
  const bookingId = body.booking_id;
  const allowedOrigins = (Deno.env.get('ALLOWED_RETURN_ORIGINS') ?? '').split(',');
  const schemes = Deno.env.get('ALLOW_EXPO_GO') === 'true' ? ['garagego:', 'exp:'] : ['garagego:'];
  const target = resolveReturnTarget(typeof body.return_to === 'string' ? body.return_to : null, allowedOrigins, schemes);
  if (!target) return json({ error: 'invalid_return_to' }, 400);

  const db = userClient(authorization);
  let attempt: { attempt_id: string; amount: number; expires_at: string };
  let title: string;
  let returnId: string;

  if (kind === 'booking') {
    if (!isUuid(bookingId)) return json({ error: 'booking_id inválido' }, 400);
    const { data, error } = await db.rpc('begin_mp_payment_attempt', { p_booking_id: bookingId }).single();
    if (error) return json({ error: error.message }, 400);
    const row = data as { attempt_id: string; amount: number; expires_at: string; lot_name: string };
    attempt = row;
    title = `Reserva en ${row.lot_name}`;
    returnId = bookingId;
  } else if (kind === 'topup') {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount)) return json({ error: 'invalid_topup_amount' }, 400);
    const { data, error } = await db.rpc('begin_mp_topup', { p_amount: amount }).single();
    if (error) return json({ error: error.message }, 400);
    attempt = data as { attempt_id: string; amount: number; expires_at: string };
    title = 'Recarga de saldo GarageGo';
    returnId = attempt.attempt_id;
  } else {
    return json({ error: 'kind inválido' }, 400);
  }

  const admin = adminClient();
  const orderBody = buildCheckoutOrderBody({
    attemptId: attempt.attempt_id,
    title,
    amount: Number(attempt.amount),
    expiresInSeconds: (new Date(attempt.expires_at).getTime() - Date.now()) / 1000,
    returnUrl: buildMpReturnUrl(`${env('SUPABASE_URL')}/functions/v1`, { kind, id: returnId, to: target }),
  });

  try {
    const order = await createOrder(orderBody, attempt.attempt_id);
    if (!order.id || !order.checkout_url) throw new Error('La orden no trajo id o checkout_url');

    const { error } = await admin
      .from('mp_checkout_attempts')
      .update({ mp_order_id: order.id, updated_at: new Date().toISOString() })
      .eq('id', attempt.attempt_id);
    if (error) throw new Error(`No se pudo guardar la orden: ${error.message}`);

    return json({ checkout_url: order.checkout_url, attempt_id: attempt.attempt_id, order_id: order.id });
  } catch (error) {
    console.error('mp-create-order:', describeError(error));
    await admin
      .from('mp_checkout_attempts')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', attempt.attempt_id)
      .eq('status', 'created');
    return json({ error: 'mp_unavailable', attempt_id: attempt.attempt_id }, 502);
  }
});
