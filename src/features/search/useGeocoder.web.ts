import { useJsApiLoader } from '@react-google-maps/api';

import { withCountry, type Geocoder } from './geocodeTypes';

const GOOGLE_MAPS_WEB_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '';

// Versión web: el Geocoder de la API de JavaScript de Google Maps (la misma que ya usa el selector
// de ubicación al publicar una cochera; necesita "Geocoding API" habilitada para la clave).
// El `id` es el mismo que usan los mapas, así el script de Google se carga una sola vez.
export function useGeocoder(): Geocoder {
  const { isLoaded } = useJsApiLoader({
    id: 'garagego-google-maps-web',
    googleMapsApiKey: GOOGLE_MAPS_WEB_API_KEY,
  });

  const geocode: Geocoder['geocode'] = (query) =>
    new Promise((resolve, reject) => {
      new google.maps.Geocoder().geocode({ address: withCountry(query), region: 'ar' }, (results, status) => {
        if (status === google.maps.GeocoderStatus.ZERO_RESULTS) {
          resolve(null);
          return;
        }
        const first = results?.[0];
        if (status !== google.maps.GeocoderStatus.OK || !first) {
          reject(new Error(`geocoder_${status}`));
          return;
        }
        // Con un texto que no existe, Google devuelve igual el país (o la provincia) como "mejor
        // coincidencia". Un punto en el medio de Argentina no sirve para buscar cocheras: se descarta
        // para que la app avise que no encontró la dirección. Una ciudad o un barrio sí sirven.
        const isTooBroad =
          first.types.includes('country') ||
          (first.types.includes('administrative_area_level_1') && !first.types.includes('locality'));
        if (isTooBroad) {
          resolve(null);
          return;
        }
        const { lat, lng } = first.geometry.location;
        resolve({ latitude: lat(), longitude: lng(), label: first.formatted_address });
      });
    });

  return { isReady: isLoaded, geocode };
}
