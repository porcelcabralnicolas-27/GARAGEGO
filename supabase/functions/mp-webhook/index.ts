// mp-webhook — endpoint público que llama Mercado Pago (evento "Order (Mercado Pago)").
// Configurado en el panel de Mercado Pago > Webhooks:
//   https://<proyecto>.supabase.co/functions/v1/mp-webhook
//
// Nunca confía en el body: verifica la firma (x-signature) y vuelve a consultar la orden en la
// API antes de tocar la base. Es idempotente (Mercado Pago reintenta si no recibe 200), así que
// una notificación repetida no cambia nada.
//
// Respuestas: 401 firma inválida · 200 procesado o ignorado · 500 error transitorio (Mercado
// Pago vuelve a intentar).

import { verifyWebhookSignature } from '../_shared/mercadopago-core.ts';
import { env, hmacSha256Hex, json, readJson } from '../_shared/http.ts';
import { describeError, getOrder } from '../_shared/mp-client.ts';
import { processOrder } from '../_shared/process-payment.ts';
import { adminClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = new URL(req.url);
  const body = await readJson(req);
  const bodyData = body.data as { id?: unknown } | undefined;
  const dataId = url.searchParams.get('data.id') ?? (bodyData?.id !== undefined ? String(bodyData.id) : null);
  const type = url.searchParams.get('type') ?? (typeof body.type === 'string' ? body.type : null);

  const valid = await verifyWebhookSignature({
    header: req.headers.get('x-signature'),
    requestId: req.headers.get('x-request-id'),
    dataId,
    secret: env('MP_WEBHOOK_SECRET'),
    hmacSha256Hex,
  });
  if (!valid) {
    console.warn('mp-webhook: firma inválida', { type, dataId });
    return json({ error: 'invalid_signature' }, 401);
  }

  if (type !== 'order' || !dataId) return json({ ignored: true, reason: 'not_an_order' });

  try {
    const order = await getOrder(dataId);
    // Una orden que no existe (la notificación de prueba del panel) no es un error.
    if (!order) return json({ ignored: true, reason: 'order_not_found' });

    const results = await processOrder(adminClient(), order);
    console.log('mp-webhook:', dataId, JSON.stringify(results));
    return json({ ok: true, results });
  } catch (error) {
    console.error('mp-webhook:', dataId, describeError(error));
    return json({ error: 'temporary_failure' }, 500);
  }
});
