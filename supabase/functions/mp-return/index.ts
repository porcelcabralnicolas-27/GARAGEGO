// mp-return — adonde vuelve el comprador desde Mercado Pago (success_url / failure_url /
// pending_url de la orden). Redirige a la pantalla de procesamiento de la app: la web
// (workers.dev) o garagego:// en el celular, donde openAuthSessionAsync cierra el navegador.
//
// No decide nada: la app vuelve a consultar el estado real en la base. El destino se valida
// contra ALLOWED_RETURN_ORIGINS para que esto no sea una redirección abierta.

import { buildAppReturnUrl, isUuid, resolveReturnTarget, type ReturnKind } from '../_shared/mercadopago-core.ts';

Deno.serve((req) => {
  const url = new URL(req.url);
  const kind = url.searchParams.get('k');
  const id = url.searchParams.get('id');
  const allowedOrigins = (Deno.env.get('ALLOWED_RETURN_ORIGINS') ?? '').split(',');
  const schemes = Deno.env.get('ALLOW_EXPO_GO') === 'true' ? ['garagego:', 'exp:'] : ['garagego:'];
  const target = resolveReturnTarget(url.searchParams.get('to'), allowedOrigins, schemes);

  if ((kind !== 'booking' && kind !== 'topup') || !isUuid(id) || !target) {
    return new Response('Enlace de retorno inválido. Volvé a la app de GarageGo.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const location = buildAppReturnUrl(target, {
    kind: kind as ReturnKind,
    id,
    result: url.searchParams.get('result'),
    paymentId: url.searchParams.get('payment_id'),
  });
  return new Response(null, { status: 302, headers: { Location: location } });
});
