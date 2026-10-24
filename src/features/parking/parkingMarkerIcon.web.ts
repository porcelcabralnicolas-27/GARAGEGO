import { Asset } from 'expo-asset';

import { PIN_SIZE, pinImageFor } from './pinImages';
import type { LotType } from './types';

// Íconos de marcador para los mapas de Google en web.
// Requieren que la API de Google Maps ya esté cargada (usar solo cuando isLoaded === true).

/**
 * Pin de una cochera: casa o edificio con cocheras según el tipo, en verde si se puede usar ahora y
 * en gris si no. Las mismas imágenes que usa el mapa nativo.
 */
export function buildParkingMarkerIcon(lotType: LotType, isAvailableNow: boolean | undefined): google.maps.Icon {
  // `Asset` resuelve la URL de la imagen empaquetada también en web (`Image.resolveAssetSource` no existe ahí).
  const uri = Asset.fromModule(pinImageFor(lotType, isAvailableNow) as number).uri;
  return {
    url: uri,
    scaledSize: new google.maps.Size(PIN_SIZE, PIN_SIZE),
    // El pin es un círculo: se ancla en el centro.
    anchor: new google.maps.Point(PIN_SIZE / 2, PIN_SIZE / 2),
  };
}

// Punto azul de "estás acá": círculo con halo translúcido y borde blanco, como el de Google Maps.
export function buildUserLocationIcon(): google.maps.Icon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="20" fill="#2563eb" fill-opacity="0.18"/>
      <circle cx="22" cy="22" r="9" fill="#2563eb" stroke="#ffffff" stroke-width="3"/>
    </svg>
  `.trim();

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(44, 44),
    anchor: new google.maps.Point(22, 22),
  };
}
