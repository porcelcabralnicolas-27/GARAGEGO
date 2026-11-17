// Llamadas a la API de Orders de Mercado Pago. El access token vive solo acá (secreto de
// Supabase MP_ACCESS_TOKEN); nunca se loguea ni viaja a la app.

import { formatAmount } from './mercadopago-core.ts';
import { env } from './http.ts';

const MP_API = 'https://api.mercadopago.com';
const TIMEOUT_MS = 10_000;

export class MpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
  }
}

async function mpFetch(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${MP_API}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${env('MP_ACCESS_TOKEN')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.idempotencyKey ? { 'X-Idempotency-Key': init.idempotencyKey } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export type MpOrder = Record<string, unknown> & { id?: string; checkout_url?: string };

/** POST /v1/orders. La clave de idempotencia es el id del intento: reintentar no duplica la orden. */
export async function createOrder(body: unknown, idempotencyKey: string): Promise<MpOrder> {
  const res = await mpFetch('/v1/orders', { method: 'POST', body, idempotencyKey });
  if (res.status < 200 || res.status >= 300) {
    throw new MpError(`Mercado Pago rechazó la orden (${res.status})`, res.status, res.body);
  }
  return res.body as MpOrder;
}

/** GET /v1/orders/{id}. null si no existe (por ejemplo, la notificación de prueba del panel). */
export async function getOrder(orderId: string): Promise<MpOrder | null> {
  const res = await mpFetch(`/v1/orders/${encodeURIComponent(orderId)}`);
  if (res.status === 404) return null;
  if (res.status < 200 || res.status >= 300) {
    throw new MpError(`No se pudo consultar la orden (${res.status})`, res.status, res.body);
  }
  return res.body as MpOrder;
}

/**
 * POST /v1/orders/{id}/refund de un pago puntual de la orden (una orden puede tener un pago
 * rechazado y otro aprobado). Idempotente por pago: si un reintento llega después de que el
 * primero salió bien, Mercado Pago no devuelve dos veces.
 */
export async function refundOrderPayment(orderId: string, paymentId: string, amount: number): Promise<MpOrder> {
  const res = await mpFetch(`/v1/orders/${encodeURIComponent(orderId)}/refund`, {
    method: 'POST',
    body: { transactions: [{ id: paymentId, amount: formatAmount(amount) }] },
    idempotencyKey: `refund-${paymentId}`,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new MpError(`Mercado Pago rechazó el reembolso (${res.status})`, res.status, res.body);
  }
  return res.body as MpOrder;
}

/** Texto corto para guardar en mp_payments.last_error, sin datos sensibles. */
export function describeError(error: unknown): string {
  if (error instanceof MpError) {
    const detail = typeof error.body === 'object' && error.body !== null ? JSON.stringify(error.body) : String(error.body);
    return `${error.message}: ${detail}`.slice(0, 500);
  }
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}
