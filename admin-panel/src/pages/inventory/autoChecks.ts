/**
 * Controles automáticos del checklist (0096): el panel los calcula y los muestra junto al punto que
 * los tiene configurado. Ayudan al revisor; no tildan ni bloquean nada.
 */

import type { ListingChange, LotRow } from '../../domain';
import { formatMoney } from '../../lib/format';
import type { AutoCheck } from '../settings/checklistApi';

export type AutoCheckResult = { tone: 'ok' | 'warn' | 'neutral'; text: string };

/** Mínimo de cocheras parecidas para que la mediana diga algo. */
export const MIN_PRICE_COMPARABLES = 3;

export type PriceReference = { median: number; count: number };

/** Mediana de la tarifa de las cocheras aprobadas del mismo país y tipo (sin contar esta). */
export function priceReference(rows: LotRow[], row: LotRow): PriceReference {
  const prices = rows
    .filter(
      (other) =>
        other.lot.id !== row.lot.id &&
        other.lot.approvalStatus === 'approved' &&
        other.lot.archivedAt === null &&
        other.lot.region === row.lot.region &&
        other.lot.lotType === row.lot.lotType
    )
    .map((other) => Number(other.lot.pricePerHour))
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);
  if (prices.length === 0) return { median: 0, count: 0 };
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return { median, count: prices.length };
}

const times = (value: number) => value.toLocaleString('es-AR', { maximumFractionDigits: 1 });

export type AutoCheckContext = {
  photoCount: number;
  maxPhotos: number;
  /** Qué cambió desde la última aprobación (null = alta nueva). */
  changes: ListingChange[] | null;
  contactHits: string[];
  price: number;
  priceRef: PriceReference;
  priceFactor: number;
};

export function runAutoCheck(kind: AutoCheck, ctx: AutoCheckContext): AutoCheckResult {
  if (kind === 'photos') {
    const photoChange = ctx.changes?.find((change) => change.field === 'photos');
    const edit =
      photoChange && photoChange.field === 'photos'
        ? ` En esta edición: ${[
            photoChange.added ? `${photoChange.added} nueva${photoChange.added === 1 ? '' : 's'}` : null,
            photoChange.removed ? `${photoChange.removed} quitada${photoChange.removed === 1 ? '' : 's'}` : null,
          ]
            .filter(Boolean)
            .join(', ')}.`
        : '';
    if (ctx.photoCount === 0) return { tone: 'warn', text: 'No tiene fotos: no se puede aprobar.' + edit };
    if (ctx.photoCount > ctx.maxPhotos) {
      return { tone: 'warn', text: `Tiene ${ctx.photoCount} fotos y el límite actual es ${ctx.maxPhotos}.` + edit };
    }
    return {
      tone: 'ok',
      text: `${ctx.photoCount} de ${ctx.maxPhotos} foto${ctx.maxPhotos === 1 ? '' : 's'}.` + edit,
    };
  }

  if (kind === 'contact_info') {
    if (ctx.contactHits.length > 0) {
      return { tone: 'warn', text: `Parece incluir datos de contacto: ${ctx.contactHits.join(', ')}.` };
    }
    return { tone: 'ok', text: 'No se detectan teléfonos, correos ni redes en la descripción.' };
  }

  // Tarifa
  const { median, count } = ctx.priceRef;
  if (count < MIN_PRICE_COMPARABLES) {
    const few =
      count === 0
        ? 'No hay cocheras aprobadas parecidas'
        : `Hay solo ${count} cochera${count === 1 ? ' aprobada parecida' : 's aprobadas parecidas'}`;
    return { tone: 'neutral', text: `${few} (mismo país y tipo) para comparar: revisalo a mano.` };
  }
  const ratio = ctx.price / median;
  const reference = `la mediana de ${count} cocheras parecidas es ${formatMoney(median)}`;
  if (ratio > ctx.priceFactor) {
    return { tone: 'warn', text: `Es ${times(ratio)} veces la mediana (${reference}).` };
  }
  if (ratio < 1 / ctx.priceFactor) {
    return { tone: 'warn', text: `Es ${times(1 / ratio)} veces más barata que la mediana (${reference}).` };
  }
  return { tone: 'ok', text: `Dentro de lo normal: ${reference}.` };
}
