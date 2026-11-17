/// <reference types="node" />
import { createHmac } from 'node:crypto';

import {
  amountsMatch,
  buildAppReturnUrl,
  buildCheckoutOrderBody,
  buildMpReturnUrl,
  buildSignatureManifest,
  formatAmount,
  isUuid,
  mapPaymentStatus,
  parseSignatureHeader,
  readOrder,
  resolveReturnTarget,
  secondsToIsoDuration,
  verifyWebhookSignature,
} from '../../supabase/functions/_shared/mercadopago-core';

// Mismo cálculo que hace Mercado Pago (y que la Edge Function hace con crypto.subtle).
const hmac = (key: string, message: string) => createHmac('sha256', key).update(message).digest('hex');

const SECRET = 'clave-secreta-de-prueba';
const ORDER_ID = 'ORDTST01JABCDEF';
const REQUEST_ID = 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e';
const TS = '1742505638683';

/** Firma como Mercado Pago. `headerTs` simula un header alterado: firmado con TS, enviado con otro. */
function signedHeader(overrides: { dataId?: string; requestId?: string; headerTs?: string; secret?: string } = {}) {
  const manifest = buildSignatureManifest({
    dataId: overrides.dataId ?? ORDER_ID,
    requestId: overrides.requestId ?? REQUEST_ID,
    ts: TS,
  });
  return `ts=${overrides.headerTs ?? TS},v1=${hmac(overrides.secret ?? SECRET, manifest)}`;
}

describe('firma del webhook', () => {
  it('arma el manifiesto con el id en minúsculas', () => {
    expect(buildSignatureManifest({ dataId: ORDER_ID, requestId: REQUEST_ID, ts: TS })).toBe(
      `id:${ORDER_ID.toLowerCase()};request-id:${REQUEST_ID};ts:${TS};`
    );
  });

  it('omite las partes que no vienen', () => {
    expect(buildSignatureManifest({ dataId: null, requestId: undefined, ts: TS })).toBe(`ts:${TS};`);
  });

  it('lee el header aunque tenga espacios o venga en otro orden', () => {
    expect(parseSignatureHeader(' v1=abc123 , ts=99 ')).toEqual({ ts: '99', v1: 'abc123' });
    expect(parseSignatureHeader('ts=99')).toBeNull();
    expect(parseSignatureHeader('')).toBeNull();
    expect(parseSignatureHeader(null)).toBeNull();
  });

  it('acepta una firma válida', async () => {
    await expect(
      verifyWebhookSignature({ header: signedHeader(), requestId: REQUEST_ID, dataId: ORDER_ID, secret: SECRET, hmacSha256Hex: hmac })
    ).resolves.toBe(true);
  });

  it('acepta el id en otro caso (Mercado Pago firma en minúsculas)', async () => {
    await expect(
      verifyWebhookSignature({
        header: signedHeader(),
        requestId: REQUEST_ID,
        dataId: ORDER_ID.toLowerCase(),
        secret: SECRET,
        hmacSha256Hex: hmac,
      })
    ).resolves.toBe(true);
  });

  it.each([
    ['otro id', { dataId: 'ORDTST999' }],
    ['otro request-id', { requestId: 'otro-request' }],
    ['otro ts', { headerTs: '1742505638684' }],
    ['otra clave', { secret: 'otra-clave' }],
  ])('rechaza la firma si cambia %s', async (_label, overrides) => {
    await expect(
      verifyWebhookSignature({
        header: signedHeader(overrides),
        requestId: REQUEST_ID,
        dataId: ORDER_ID,
        secret: SECRET,
        hmacSha256Hex: hmac,
      })
    ).resolves.toBe(false);
  });

  it('rechaza un header mal formado o sin clave configurada', async () => {
    const base = { requestId: REQUEST_ID, dataId: ORDER_ID, hmacSha256Hex: hmac };
    await expect(verifyWebhookSignature({ ...base, header: 'cualquier cosa', secret: SECRET })).resolves.toBe(false);
    await expect(verifyWebhookSignature({ ...base, header: signedHeader(), secret: '' })).resolves.toBe(false);
  });
});

describe('montos y plazos', () => {
  it('formatea con dos decimales', () => {
    expect(formatAmount(1500)).toBe('1500.00');
    expect(formatAmount(1234.5)).toBe('1234.50');
    expect(formatAmount(0.1 + 0.2)).toBe('0.30');
  });

  it('compara al centavo', () => {
    expect(amountsMatch('1234.5', 1234.5)).toBe(true);
    expect(amountsMatch('1234.50', '1234.5')).toBe(true);
    expect(amountsMatch(1234.5, 1234.51)).toBe(false);
    expect(amountsMatch(null, 100)).toBe(false);
    expect(amountsMatch('abc', 100)).toBe(false);
  });

  it('convierte el plazo a duración ISO, con un mínimo de un minuto', () => {
    expect(secondsToIsoDuration(600)).toBe('PT10M');
    expect(secondsToIsoDuration(570.9)).toBe('PT9M30S');
    expect(secondsToIsoDuration(20)).toBe('PT1M');
    expect(secondsToIsoDuration(1800)).toBe('PT30M');
  });
});

describe('orden de Checkout Pro', () => {
  const body = buildCheckoutOrderBody({
    attemptId: '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d',
    title: 'Reserva en Cochera Centro',
    amount: 1234.5,
    expiresInSeconds: 600,
    returnUrl: 'https://proyecto.supabase.co/functions/v1/mp-return?k=booking&id=abc',
  });

  it('usa los valores fijos de Checkout Pro y el intento como referencia', () => {
    expect(body.type).toBe('online');
    expect(body.processing_mode).toBe('manual');
    expect(body.external_reference).toBe('6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d');
    expect(body.expiration_time).toBe('PT10M');
  });

  it('el total coincide con la suma de los ítems', () => {
    expect(body.total_amount).toBe('1234.50');
    expect(body.items).toEqual([{ title: 'Reserva en Cochera Centro', unit_price: '1234.50', quantity: 1 }]);
  });

  it('excluye los medios offline y las cuotas', () => {
    expect(body.config.payment_method).toEqual({ max_installments: 1, not_allowed_types: ['ticket', 'atm', 'bank_transfer'] });
  });

  it('vuelve a mp-return con el resultado, sumando el parámetro a la query existente', () => {
    expect(body.config.online.success_url).toBe(
      'https://proyecto.supabase.co/functions/v1/mp-return?k=booking&id=abc&result=success'
    );
    expect(body.config.online.failure_url).toMatch(/&result=failure$/);
    expect(body.config.online.pending_url).toMatch(/&result=pending$/);
    expect(body.config.online.auto_return).toBe('approved');
  });

  it('una recarga puede permitir los medios offline', () => {
    const topup = buildCheckoutOrderBody({
      attemptId: 'x',
      title: 'Recarga',
      amount: 5000,
      expiresInSeconds: 1800,
      returnUrl: 'https://a/mp-return',
      allowOfflineMethods: true,
    });
    expect(topup.config.payment_method).toEqual({ max_installments: 1 });
    expect(topup.config.online.success_url).toBe('https://a/mp-return?result=success');
  });
});

describe('pagos de una orden', () => {
  it('traduce los estados de la API de Orders', () => {
    expect(mapPaymentStatus('processed', 'accredited')).toBe('approved');
    expect(mapPaymentStatus('failed', 'rejected_by_issuer')).toBe('rejected');
    expect(mapPaymentStatus('processed', 'refunded')).toBe('refunded');
    expect(mapPaymentStatus('action_required', 'waiting_payment')).toBe('pending');
    expect(mapPaymentStatus('algo_nuevo', null)).toBe('other');
    expect(mapPaymentStatus(undefined)).toBe('other');
  });

  it('lee la referencia, la moneda y los pagos', () => {
    const order = readOrder({
      id: 'ORDTST01',
      external_reference: '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d',
      currency: 'ARS',
      transactions: {
        payments: [
          { id: 'PAY01', status: 'failed', status_detail: 'rejected_other_reason', amount: '1234.50' },
          { id: 'PAY02', status: 'processed', status_detail: 'accredited', amount: '1234.50', paid_amount: '1234.50' },
          { status: 'processed' },
        ],
      },
    });
    expect(order.orderId).toBe('ORDTST01');
    expect(order.externalReference).toBe('6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d');
    expect(order.currency).toBe('ARS');
    expect(order.payments).toEqual([
      { id: 'PAY01', status: 'rejected', rawStatus: 'failed', statusDetail: 'rejected_other_reason', amount: 1234.5 },
      { id: 'PAY02', status: 'approved', rawStatus: 'processed', statusDetail: 'accredited', amount: 1234.5 },
    ]);
  });

  it('una orden sin transacciones no tiene pagos', () => {
    expect(readOrder({ id: 'ORDTST02' }).payments).toEqual([]);
  });
});

describe('URLs de retorno', () => {
  const allowed = ['https://garagego.garagego2027.workers.dev', 'http://localhost:8081/'];

  it('acepta los orígenes permitidos y el esquema de la app', () => {
    expect(resolveReturnTarget('https://garagego.garagego2027.workers.dev/algo?x=1', allowed)).toBe(
      'https://garagego.garagego2027.workers.dev'
    );
    expect(resolveReturnTarget('http://localhost:8081', allowed)).toBe('http://localhost:8081');
    expect(resolveReturnTarget('garagego://', allowed)).toBe('garagego://');
  });

  it('rechaza cualquier otro destino', () => {
    expect(resolveReturnTarget('https://evil.com', allowed)).toBeNull();
    expect(resolveReturnTarget('https://garagego.garagego2027.workers.dev.evil.com', allowed)).toBeNull();
    expect(resolveReturnTarget('javascript:alert(1)', allowed)).toBeNull();
    expect(resolveReturnTarget('exp://192.168.0.10:8081/--/', allowed)).toBeNull();
    expect(resolveReturnTarget('no es una url', allowed)).toBeNull();
    expect(resolveReturnTarget(null, allowed)).toBeNull();
  });

  it('permite Expo Go solo si se habilita el esquema', () => {
    expect(resolveReturnTarget('exp://192.168.0.10:8081/--/', allowed, ['garagego:', 'exp:'])).toBe(
      'exp://192.168.0.10:8081/--'
    );
  });

  it('arma la URL de la pantalla de procesamiento', () => {
    expect(buildAppReturnUrl('https://garagego.garagego2027.workers.dev', { kind: 'booking', id: 'abc', result: 'success' })).toBe(
      'https://garagego.garagego2027.workers.dev/payment-return?booking=abc&result=success'
    );
    expect(buildAppReturnUrl('garagego://', { kind: 'topup', id: 'xyz', paymentId: 'PAY1' })).toBe(
      'garagego://payment-return?topup=xyz&payment_id=PAY1'
    );
    expect(buildAppReturnUrl('exp://192.168.0.10:8081/--', { kind: 'booking', id: 'abc' })).toBe(
      'exp://192.168.0.10:8081/--/payment-return?booking=abc'
    );
  });

  it('arma la URL de mp-return con los parámetros escapados', () => {
    expect(buildMpReturnUrl('https://p.supabase.co/functions/v1/', { kind: 'booking', id: 'abc', to: 'garagego://' })).toBe(
      'https://p.supabase.co/functions/v1/mp-return?k=booking&id=abc&to=garagego%3A%2F%2F'
    );
  });

  it('reconoce un uuid', () => {
    expect(isUuid('6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d')).toBe(true);
    expect(isUuid('6f1c2b8e')).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});
