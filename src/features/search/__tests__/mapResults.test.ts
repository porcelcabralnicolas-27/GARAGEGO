import type { ParkingLotWithDistance } from '@/features/parking/types';

import { lotsToFrame, nearbyOf, searchNotice } from '../mapResults';

const lot = (id: string, distanceKm: number) => ({ id, distanceKm }) as ParkingLotWithDistance;

// Ya vienen ordenados por distancia, como los devuelve el servidor.
const results = [lot('a', 0.5), lot('b', 3), lot('c', 8), lot('d', 15), lot('e', 22)];

describe('nearbyOf', () => {
  it('deja los que entran en el radio', () => {
    expect(nearbyOf(results, 5).map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('incluye el que está justo en el límite', () => {
    expect(nearbyOf(results, 3).map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('puede no dejar ninguno', () => {
    expect(nearbyOf(results, 0.1)).toEqual([]);
  });
});

describe('lotsToFrame', () => {
  it('con estacionamientos dentro del radio, encuadra solo esos', () => {
    expect(lotsToFrame(results, 10).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('sin ninguno dentro del radio, encuadra los 3 más cercanos de afuera', () => {
    expect(lotsToFrame(results.slice(2), 2).map((l) => l.id)).toEqual(['c', 'd', 'e']);
  });

  it('sin resultados no encuadra nada', () => {
    expect(lotsToFrame([], 5)).toEqual([]);
  });
});

describe('searchNotice', () => {
  it('con estacionamientos cerca, lo dice', () => {
    expect(searchNotice({ place: 'Mitre 1500', radiusKm: 5, nearbyCount: 2, totalCount: 5 })).toBe(
      'Estacionamientos cerca de «Mitre 1500»'
    );
  });

  it('sin ninguno cerca pero con otros en el mapa, avisa que se muestran los demás', () => {
    const message = searchNotice({ place: 'Mitre 1500', radiusKm: 5, nearbyCount: 0, totalCount: 4 });
    expect(message).toContain('No hay estacionamientos a menos de 5 km');
    expect(message).toContain('Mostramos los demás');
  });

  it('sin ninguno en toda la zona, sugiere ampliar la distancia', () => {
    expect(searchNotice({ place: 'Mitre 1500', radiusKm: 5, nearbyCount: 0, totalCount: 0 })).toContain(
      'Probá con una distancia mayor'
    );
  });
});
