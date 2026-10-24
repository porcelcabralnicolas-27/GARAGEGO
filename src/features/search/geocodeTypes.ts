/** Resultado de buscar una dirección escrita a mano: el punto en el mapa y cómo se la mostramos. */
export type GeocodeResult = {
  latitude: number;
  longitude: number;
  /** Dirección completa, ya normalizada cuando el servicio la devuelve. */
  label: string;
};

export type Geocoder = {
  /** false mientras el servicio todavía no está listo (en web, hasta que carga Google Maps). */
  isReady: boolean;
  /** Devuelve null si no hay ningún resultado para esa dirección; lanza si falla el servicio. */
  geocode: (query: string) => Promise<GeocodeResult | null>;
};

/** Las búsquedas son siempre de acá: sin esto "Mitre 1500" podría resolverse en otro país. */
export function withCountry(query: string): string {
  const trimmed = query.trim();
  return /argentina/i.test(trimmed) ? trimmed : `${trimmed}, Argentina`;
}
