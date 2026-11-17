// Cámara del mapa al tocar el cartel de una cochera. Lo usan las dos versiones del mapa (la nativa,
// app/(client)/index.tsx, y la web, index.web.tsx) para que se comporten igual: el mapa va
// directo a la cochera, a nivel de calle, y la deja visible por encima de la hoja de reserva.
//
// Las cuentas son las de la proyección de Google Maps (Web Mercator): a zoom z el mundo mide
// 256 · 2^z píxeles de lado, en píxeles CSS en la web y en dp en Android. Así, la misma función
// sirve para las dos.

import { PIN_SIZE } from '@/features/parking/pinImages';

/** Zoom al que se acerca el mapa al tocar el cartel (nivel de calle). */
export const LOT_ZOOM = 17;

/** Alto aproximado del cartel blanco más medio pin: lo que necesita por encima de la cochera. */
export const CALLOUT_ROOM = 64 + PIN_SIZE / 2 + 8;

const TILE_SIZE = 256;
const MAX_LATITUDE = 85.05112878;

function latitudeToWorldY(latitude: number): number {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return TILE_SIZE * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI));
}

function worldYToLatitude(worldY: number): number {
  const n = Math.PI * (1 - (2 * worldY) / TILE_SIZE);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Latitud que queda `offsetPx` píxeles más abajo (al sur) de `latitude`, a ese zoom. */
export function latitudeBelow(latitude: number, zoom: number, offsetPx: number): number {
  return worldYToLatitude(latitudeToWorldY(latitude) + offsetPx / 2 ** zoom);
}

/**
 * Cuántos píxeles hay que correr el centro del mapa hacia abajo para que la cochera quede en el
 * medio de la parte visible (la que no tapa la hoja), con lugar para el cartel encima y nunca
 * debajo de la hoja. Todas las medidas en el mismo sistema de coordenadas (pantalla).
 */
export function pinOffsetPx(layout: { mapTop: number; mapHeight: number; visibleBottom: number }): number {
  const { mapTop, mapHeight } = layout;
  const visibleBottom = Math.min(layout.visibleBottom, mapTop + mapHeight);
  const pinY = Math.min(Math.max((mapTop + visibleBottom) / 2, mapTop + CALLOUT_ROOM), visibleBottom - PIN_SIZE / 2);
  return Math.max(0, mapTop + mapHeight / 2 - pinY);
}

/** Centro y zoom de la cámara para mostrar la cochera por encima de la hoja. */
export function lotCamera(
  lot: { latitude: number; longitude: number },
  currentZoom: number,
  layout: { mapTop: number; mapHeight: number; visibleBottom: number }
): { center: { latitude: number; longitude: number }; zoom: number } {
  // Si ya estaba más cerca, no se aleja.
  const zoom = Math.max(currentZoom, LOT_ZOOM);
  return {
    center: { latitude: latitudeBelow(lot.latitude, zoom, pinOffsetPx(layout)), longitude: lot.longitude },
    zoom,
  };
}
