/**
 * Lógica de Mercado Pago que no depende de la red ni de Deno: firma del webhook, cuerpo de la
 * orden de Checkout Pro (API de Orders), lectura de los pagos de una orden y URLs de retorno.
 *
 * Sin imports y sin `Deno`: lo usan las Edge Functions y también Jest
 * (`shared/__tests__/mercadopago.test.ts`), así que todo lo que necesita del entorno (el HMAC)
 * se recibe por parámetro.
 */

// ── Firma del webhook ─────────────────────────────────────────────────────────────────────
// Mercado Pago manda `x-signature: ts=<segundos>,v1=<hmac hex>` y `x-request-id`. El v1 es el
// HMAC-SHA256, con la clave secreta del panel, de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
// (las partes que no vienen se omiten, y un data.id alfanumérico va en minúsculas).

export type SignatureHeader = { ts: string; v1: string };

export function parseSignatureHeader(header: string | null | undefined): SignatureHeader | null {
  if (!header) return null;
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(',')) {
    const [rawKey, ...rest] = part.split('=');
    const key = rawKey?.trim();
    const value = rest.join('=').trim();
    if (key === 'ts') ts = value;
    if (key === 'v1') v1 = value;
  }
  return ts && v1 ? { ts, v1 } : null;
}

export function buildSignatureManifest(input: {
  dataId?: string | null;
  requestId?: string | null;
  ts: string;
}): string {
  let manifest = '';
  if (input.dataId) manifest += `id:${input.dataId.toLowerCase()};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${input.ts};`;
  return manifest;
}

/** Compara en tiempo constante, para no filtrar por timing cuántos caracteres coinciden. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/**
 * No se exige una ventana de tiempo sobre `ts`: el procesamiento es idempotente y siempre se
 * vuelve a consultar la orden en la API, así que repetir una notificación vieja no hace nada.
 */
export async function verifyWebhookSignature(input: {
  header: string | null | undefined;
  requestId: string | null | undefined;
  dataId: string | null | undefined;
  secret: string;
  hmacSha256Hex: (key: string, message: string) => string | Promise<string>;
}): Promise<boolean> {
  const parsed = parseSignatureHeader(input.header);
  if (!parsed || !input.secret) return false;
  const manifest = buildSignatureManifest({ dataId: input.dataId, requestId: input.requestId, ts: parsed.ts });
  const expected = await input.hmacSha256Hex(input.secret, manifest);
  return timingSafeEqualHex(expected, parsed.v1);
}

// ── Montos y fechas ───────────────────────────────────────────────────────────────────────

/** La API de Orders recibe los montos como texto con dos decimales ("1500.00"). */
export function formatAmount(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

/** Compara al centavo; acepta número o texto ("1234.5" y 1234.50 son iguales). */
export function amountsMatch(a: number | string | null | undefined, b: number | string | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const x = Math.round(Number(a) * 100);
  const y = Math.round(Number(b) * 100);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
}

/**
 * `expiration_time` de la orden: duración ISO 8601 desde que se crea ("PT9M30S"). Se calcula
 * contra el plazo original de la reserva, así un reintento no regala tiempo. Nunca menos de
 * un minuto: una orden que vence al instante no le sirve a nadie (la base ya rechaza abrir un
 * intento con menos de un minuto de plazo).
 */
export function secondsToIsoDuration(totalSeconds: number): string {
  const seconds = Math.max(60, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `PT${minutes}M${rest ? `${rest}S` : ''}`;
}

// ── Orden de Checkout Pro ─────────────────────────────────────────────────────────────────

/**
 * Medios que pueden tardar horas o días en acreditarse (Rapipago, Pago Fácil, transferencia):
 * no sirven para reservar un horario ahora. Quien quiera usarlos puede recargar la billetera.
 */
export const OFFLINE_PAYMENT_TYPES = ['ticket', 'atm', 'bank_transfer'] as const;

export type CheckoutOrderInput = {
  /** id del intento en mp_checkout_attempts: viaja como external_reference. */
  attemptId: string;
  title: string;
  description?: string;
  amount: number;
  /** Segundos hasta el vencimiento del intento. */
  expiresInSeconds: number;
  /** Adónde vuelve el comprador (la Edge Function mp-return). */
  returnUrl: string;
  /** En una recarga se permiten los medios offline: no hay un horario que se pierda. */
  allowOfflineMethods?: boolean;
};

export function buildCheckoutOrderBody(input: CheckoutOrderInput) {
  const amount = formatAmount(input.amount);
  return {
    type: 'online',
    processing_mode: 'manual',
    total_amount: amount,
    external_reference: input.attemptId,
    description: input.description ?? input.title,
    expiration_time: secondsToIsoDuration(input.expiresInSeconds),
    items: [{ title: input.title, unit_price: amount, quantity: 1 }],
    config: {
      statement_descriptor: 'GARAGEGO',
      online: {
        success_url: withResult(input.returnUrl, 'success'),
        failure_url: withResult(input.returnUrl, 'failure'),
        pending_url: withResult(input.returnUrl, 'pending'),
        auto_return: 'approved',
      },
      payment_method: {
        max_installments: 1,
        ...(input.allowOfflineMethods ? {} : { not_allowed_types: [...OFFLINE_PAYMENT_TYPES] }),
      },
    },
  };
}

function withResult(url: string, result: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}result=${result}`;
}

// ── Pagos de una orden ────────────────────────────────────────────────────────────────────
// La API de Orders informa cada pago en `transactions.payments[]`. Un pago acreditado viene con
// status "processed" / status_detail "accredited". La base (apply_mp_payment) solo necesita
// saber si está aprobado; el resto se registra tal cual.

export type PaymentStatus = 'approved' | 'rejected' | 'refunded' | 'pending' | 'other';

export function mapPaymentStatus(status: string | null | undefined, statusDetail?: string | null): PaymentStatus {
  const s = (status ?? '').toLowerCase();
  const d = (statusDetail ?? '').toLowerCase();
  if (d.includes('refunded') || s === 'refunded') return 'refunded';
  if (s === 'processed' || s === 'approved' || s === 'accredited') return 'approved';
  if (s === 'failed' || s === 'rejected' || s === 'canceled' || s === 'cancelled' || s === 'expired') return 'rejected';
  if (s === 'created' || s === 'processing' || s === 'action_required' || s === 'in_process' || s === 'pending') {
    return 'pending';
  }
  return 'other';
}

export type OrderPayment = {
  id: string;
  status: PaymentStatus;
  rawStatus: string;
  statusDetail: string | null;
  amount: number | null;
};

type RawOrder = {
  id?: unknown;
  external_reference?: unknown;
  currency?: unknown;
  transactions?: { payments?: Array<Record<string, unknown>> } | null;
};

export function readOrder(order: RawOrder): {
  orderId: string | null;
  externalReference: string | null;
  currency: string | null;
  payments: OrderPayment[];
} {
  const payments = (order.transactions?.payments ?? [])
    .filter((p) => typeof p.id === 'string' || typeof p.id === 'number')
    .map((p) => {
      const rawStatus = typeof p.status === 'string' ? p.status : '';
      const statusDetail = typeof p.status_detail === 'string' ? p.status_detail : null;
      const rawAmount = p.paid_amount ?? p.amount;
      const amount = rawAmount === undefined || rawAmount === null || rawAmount === '' ? null : Number(rawAmount);
      return {
        id: String(p.id),
        status: mapPaymentStatus(rawStatus, statusDetail),
        rawStatus,
        statusDetail,
        amount: amount !== null && Number.isFinite(amount) ? amount : null,
      };
    });
  return {
    orderId: typeof order.id === 'string' ? order.id : null,
    externalReference: typeof order.external_reference === 'string' ? order.external_reference : null,
    currency: typeof order.currency === 'string' ? order.currency : null,
    payments,
  };
}

// ── URLs de retorno ───────────────────────────────────────────────────────────────────────
// Mercado Pago devuelve al comprador a la Edge Function mp-return, que lo redirige a la app.
// El destino lo manda la app, así que se valida contra una lista: si no, mp-return sería una
// redirección abierta (cualquiera podría usar nuestro dominio para mandar gente a otro sitio).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Devuelve el destino normalizado si está permitido, o null.
 *   * http(s): el origen tiene que estar en `allowedOrigins` (ALLOWED_RETURN_ORIGINS).
 *   * esquema propio de la app (garagego://, y exp:// en desarrollo): solo el esquema, sin host
 *     raro ni rutas, porque la ruta la arma mp-return.
 */
export function resolveReturnTarget(
  to: string | null | undefined,
  allowedOrigins: string[],
  allowedSchemes: string[] = ['garagego:']
): string | null {
  if (!to) return null;
  let url: URL;
  try {
    url = new URL(to);
  } catch {
    return null;
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    const origins = allowedOrigins.map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
    return origins.includes(url.origin) ? url.origin : null;
  }
  if (allowedSchemes.includes(url.protocol)) {
    // exp://192.168.0.10:8081/--/ (Expo Go): se conserva hasta el "/--/" que separa la ruta.
    if (url.protocol === 'exp:') {
      const base = to.split('/--/')[0];
      return `${base}/--`;
    }
    return `${url.protocol}//`;
  }
  return null;
}

export type ReturnKind = 'booking' | 'topup';

/** URL a la que vuelve el comprador: la pantalla de procesamiento de la app. */
export function buildAppReturnUrl(
  target: string,
  params: { kind: ReturnKind; id: string; result?: string | null; paymentId?: string | null }
): string {
  const query = new URLSearchParams();
  query.set(params.kind === 'booking' ? 'booking' : 'topup', params.id);
  if (params.result) query.set('result', params.result);
  if (params.paymentId) query.set('payment_id', params.paymentId);
  const base = target.endsWith('//') || target.endsWith('/--') ? target : target.replace(/\/+$/, '');
  const separator = base.endsWith('//') ? '' : '/';
  return `${base}${separator}payment-return?${query.toString()}`;
}

/** URL de la Edge Function mp-return que va en la orden. */
export function buildMpReturnUrl(functionsBaseUrl: string, params: { kind: ReturnKind; id: string; to: string }): string {
  const query = new URLSearchParams({ k: params.kind, id: params.id, to: params.to });
  return `${functionsBaseUrl.replace(/\/+$/, '')}/mp-return?${query.toString()}`;
}
