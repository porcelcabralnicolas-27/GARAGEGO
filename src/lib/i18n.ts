// Traducción de la demo de presentación regional (0086). En la región Estados Unidos, el
// recorrido de la demo (mapa, búsqueda, cochera, reserva, pago, mis reservas, perfil) se ve en
// inglés; el resto de la app queda en español.
//
// El texto en español se escribe tal cual en el código y es la clave: `t('Reservar')`. En inglés
// se busca en EN (src/lib/i18n.en.ts); si falta, queda en español. El test
// src/lib/__tests__/i18n.test.ts recorre el código y falla si algún texto traducido no está en EN.
//
// Es una función y no un hook porque el idioma sale de la región activa (src/lib/region.ts): al
// cambiarla desde el perfil, la app vuelve al Inicio y todas las pantallas se rearman.
//
// Valores variables: `t('Pagar {amount} con billetera', { amount: formatMoney(total) })`.

import { EN } from './i18n.en';
import { activeRegion } from './region';

export function t(text: string, params?: Record<string, string | number>): string {
  const translated = activeRegion().language === 'en' ? (EN[text] ?? text) : text;
  if (!params) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}
