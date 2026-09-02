// Formato de moneda de la app: pesos argentinos.
//
// Antes cada pantalla tenía su propia `formatCurrency` (locale es-ES, moneda USD) o armaba el
// string a mano con `$${x.toFixed(2)}`. Todo pasa por acá.

const ARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

/** Un monto en pesos: `$ 1.234,50`. */
export function formatMoney(amount: number): string {
  return ARS.format(amount);
}

/** Precio por hora para tarjetas y detalles: `$ 500,00/hora`. */
export function formatPricePerHour(amount: number): string {
  return `${ARS.format(amount)}/hora`;
}
