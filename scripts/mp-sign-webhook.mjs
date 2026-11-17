// Manda a mp-webhook una notificación de orden firmada como la firma Mercado Pago, para probar el
// webhook sin esperar a Mercado Pago: notificaciones repetidas, en paralelo y con firma inválida.
//
//   node scripts/mp-sign-webhook.mjs --order ORDTST01ABC                     una notificación
//   node scripts/mp-sign-webhook.mjs --order ORDTST01ABC --repeat 5 --parallel   cinco a la vez
//   node scripts/mp-sign-webhook.mjs --order ORDTST01ABC --bad-signature     tiene que dar 401
//
// La clave secreta del webhook se lee de la variable de entorno MP_WEBHOOK_SECRET (no se pasa
// por argumento, para que no quede en el historial de la terminal). En PowerShell:
//   $env:MP_WEBHOOK_SECRET = "..."; node scripts/mp-sign-webhook.mjs --order ...
//
// El id de la orden sale de la consulta de control de la Fase 3 (mp_checkout_attempts.mp_order_id)
// o del panel de Mercado Pago.

import { createHmac, randomUUID } from 'node:crypto';

const DEFAULT_URL = 'https://rkrbjcchttidfppttrdq.supabase.co/functions/v1/mp-webhook';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  return value && !value.startsWith('--') ? value : true;
}

const orderId = arg('order');
const url = arg('url', DEFAULT_URL);
const repeat = Number(arg('repeat', 1));
const parallel = arg('parallel', false) === true;
const badSignature = arg('bad-signature', false) === true;
const secret = process.env.MP_WEBHOOK_SECRET;

if (typeof orderId !== 'string' || !secret) {
  console.error('Uso: node scripts/mp-sign-webhook.mjs --order <ORD...> [--repeat N] [--parallel] [--bad-signature] [--url URL]');
  console.error('Requiere la variable de entorno MP_WEBHOOK_SECRET.');
  process.exit(2);
}

async function send(n) {
  const ts = String(Date.now());
  const requestId = randomUUID();
  const manifest = `id:${orderId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', badSignature ? `${secret}-mal` : secret).update(manifest).digest('hex');

  const target = `${url}?data.id=${encodeURIComponent(orderId)}&type=order`;
  const response = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
    body: JSON.stringify({ action: 'order.processed', type: 'order', data: { id: orderId } }),
  });
  const text = await response.text();
  console.log(`#${n} → HTTP ${response.status} ${text}`);
  return response.status;
}

const runs = Array.from({ length: repeat }, (_, i) => i + 1);
const statuses = parallel ? await Promise.all(runs.map(send)) : [];
if (!parallel) for (const n of runs) statuses.push(await send(n));

const expected = badSignature ? 401 : 200;
const ok = statuses.every((s) => s === expected);
console.log(ok ? `OK: todas respondieron ${expected}` : `FALLA: se esperaba ${expected} en todas`);
// exitCode y no process.exit(): en Windows, cortar mientras fetch cierra sus conexiones dispara
// un "Assertion failed ... UV_HANDLE_CLOSING" de Node.
process.exitCode = ok ? 0 : 1;
