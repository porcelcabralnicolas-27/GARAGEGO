import type { DirectionsResult, LatLngPoint } from './types';

// Servidor demo público de OSRM: sin key, sin registro, gratis. Es "mejor esfuerzo"
// (sin garantía de actividad, puede cortar el acceso sin aviso) — está bien para este MVP,
// pero requiere atribución visible a OSRM/OpenStreetMap en la UI que lo use.
const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

export async function getDirections(origin: LatLngPoint, destination: LatLngPoint): Promise<DirectionsResult> {
  const coordsParam = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = `${OSRM_BASE_URL}/${coordsParam}?overview=full&geometries=geojson`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('No se pudo calcular la ruta.');
  }

  const data = await response.json();
  const route = data.routes?.[0];
  if (!route) {
    throw new Error('No se encontró una ruta hasta el estacionamiento.');
  }

  const coordinates: LatLngPoint[] = route.geometry.coordinates.map(([longitude, latitude]: [number, number]) => ({
    latitude,
    longitude,
  }));

  return {
    coordinates,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}
