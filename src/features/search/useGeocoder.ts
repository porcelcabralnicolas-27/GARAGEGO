import * as Location from 'expo-location';

import { withCountry, type Geocoder } from './geocodeTypes';

// Versión nativa: el geocodificador del sistema (Android/iOS), vía expo-location. No necesita
// permiso de ubicación ni clave: solo traduce un texto a coordenadas.
// La versión web (useGeocoder.web.ts) usa el Geocoder de Google Maps.
async function geocode(query: string) {
  const results = await Location.geocodeAsync(withCountry(query));
  const first = results[0];
  if (!first) return null;
  return { latitude: first.latitude, longitude: first.longitude, label: query.trim() };
}

export function useGeocoder(): Geocoder {
  return { isReady: true, geocode };
}
