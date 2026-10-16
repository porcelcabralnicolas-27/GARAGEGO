import type { ParkingLotWithDistance } from '@/features/parking/types';

/**
 * Cuando se busca una dirección, el mapa muestra los estacionamientos de toda la zona y no solo los
 * del radio elegido. El servidor limita la búsqueda a 25 km (migración 0059), así que ese es el
 * máximo que se puede traer.
 */
export const MAP_BROWSE_RADIUS_KM = 25;

/** Cuántos estacionamientos se incluyen en el encuadre cuando no hay ninguno dentro del radio. */
const NEAREST_TO_FRAME = 3;

/** Los que entran en el radio que eligió la persona; el resto son "los demás del mapa". */
export function nearbyOf(results: ParkingLotWithDistance[], radiusKm: number): ParkingLotWithDistance[] {
  return results.filter((lot) => lot.distanceKm <= radiusKm);
}

/**
 * Qué estacionamientos tienen que entrar en el encuadre del mapa, además del punto buscado. Si hay
 * alguno dentro del radio, esos. Si no hay ninguno, los más cercanos de afuera: así la persona ve de
 * entrada dónde hay estacionamientos en vez de un mapa vacío. Los resultados vienen ordenados por
 * distancia.
 */
export function lotsToFrame(results: ParkingLotWithDistance[], radiusKm: number): ParkingLotWithDistance[] {
  const nearby = nearbyOf(results, radiusKm);
  return nearby.length > 0 ? nearby : results.slice(0, NEAREST_TO_FRAME);
}

/** Aviso que se muestra arriba del mapa cuando se buscó una dirección. */
export function searchNotice(params: {
  place: string;
  radiusKm: number;
  nearbyCount: number;
  totalCount: number;
}): string {
  const { place, radiusKm, nearbyCount, totalCount } = params;
  if (nearbyCount > 0) return `Estacionamientos cerca de «${place}»`;
  return totalCount > 0
    ? `No hay estacionamientos a menos de ${radiusKm} km de «${place}». Mostramos los demás estacionamientos del mapa.`
    : `No hay estacionamientos a menos de ${radiusKm} km de «${place}». Probá con una distancia mayor.`;
}
