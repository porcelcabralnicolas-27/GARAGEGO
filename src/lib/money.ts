// Formato de moneda de la app. Los montos siempre vienen en pesos argentinos (así se guardan y se
// cobran); en la demo de Estados Unidos se muestran convertidos a dólares con el tipo de cambio
// fijo de src/lib/region.ts.
//
// Antes cada pantalla tenía su propia `formatCurrency` (locale es-ES, moneda USD) o armaba el
// string a mano con `$${x.toFixed(2)}`. Todo pasa por acá.

import { activeRegion, DEMO_ARS_PER_USD } from './region';

const ARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const USD = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Un monto (en pesos): `$ 1.234,50`, o `US$ 1.23` en la demo de Estados Unidos. */
export function formatMoney(amount: number): string {
  if (activeRegion().code === 'US') {
    const dollars = USD.format(Math.abs(amount) / DEMO_ARS_PER_USD);
    return amount < 0 ? `-US$ ${dollars}` : `US$ ${dollars}`;
  }
  return ARS.format(amount);
}

/**
 * Reformatea los montos crudos que vienen dentro de un texto armado por la base.
 *
 * Las notificaciones las escribe el servidor con `format('...$%s...', monto)`, que deja el número
 * tal cual sale de PostgreSQL: «Se acreditaron $5000.00 a tu billetera». Al mostrarlas, cada
 * `$<número>` pasa por `formatMoney`: «Se acreditaron $ 5.000,00 a tu billetera». Así se corrigen
 * también las notificaciones ya guardadas, sin tocar la base.
 *
 * Solo toma `$` pegado a un número en formato de PostgreSQL (punto decimal, sin separador de
 * miles). Lo que ya está formateado (`$ 5.000,00`, con espacio) no se toca.
 */
export function formatMoneyInText(text: string): string {
  return text.replace(/\$(\d+(?:\.\d{1,2})?)(?![\d,]|\.\d)/g, (match, amount: string) => {
    const value = Number(amount);
    return Number.isFinite(value) ? formatMoney(value) : match;
  });
}

/** Precio por hora para tarjetas y detalles: `$ 500,00/hora` o `US$ 0.50/hour`. */
export function formatPricePerHour(amount: number): string {
  return activeRegion().code === 'US' ? `${formatMoney(amount)}/hour` : `${formatMoney(amount)}/hora`;
}
