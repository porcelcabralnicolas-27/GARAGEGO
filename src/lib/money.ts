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

/** Precio por hora para tarjetas y detalles: `$ 500,00/hora` o `US$ 0.50/hour`. */
export function formatPricePerHour(amount: number): string {
  return activeRegion().code === 'US' ? `${formatMoney(amount)}/hour` : `${formatMoney(amount)}/hora`;
}
