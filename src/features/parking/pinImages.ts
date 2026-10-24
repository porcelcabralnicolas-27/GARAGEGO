import type { ImageSourcePropType } from 'react-native';

import type { LotType } from './types';

/**
 * Pines del mapa: un ícono por tipo de publicación (casa / estacionamiento) y por disponibilidad.
 * Verde = disponible ahora; gris = cerrada o llena en este momento. Son imágenes de 144 px con la
 * chapa blanca y el borde ya dibujados (assets/pins), para que se vean igual en el mapa nativo y en
 * el web sin armar nada en tiempo de ejecución.
 */
export const PIN_IMAGES: Record<LotType, { available: ImageSourcePropType; unavailable: ImageSourcePropType }> = {
  house: {
    available: require('../../../assets/pins/pin-house-available.png'),
    unavailable: require('../../../assets/pins/pin-house-unavailable.png'),
  },
  lot: {
    available: require('../../../assets/pins/pin-lot-available.png'),
    unavailable: require('../../../assets/pins/pin-lot-unavailable.png'),
  },
};

/** Alto y ancho con que se dibuja el pin en el mapa, en píxeles. */
export const PIN_SIZE = 58;

/** Sin dato de disponibilidad (`undefined`) se dibuja como disponible: no se marca nada como cerrado a ciegas. */
export function pinImageFor(lotType: LotType, isAvailableNow: boolean | undefined): ImageSourcePropType {
  const images = PIN_IMAGES[lotType];
  return isAvailableNow === false ? images.unavailable : images.available;
}
