import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { activeRegion } from '@/lib/region';

type LocationState = {
  latitude: number | null;
  longitude: number | null;
  isLoading: boolean;
  errorMessage: string | null;
  /** En la app nativa nunca se inventa una ubicación; existe para igualar el contrato de la web. */
  isApproximate: boolean;
};

// `fallback` solo lo usa la versión web (useCurrentLocation.web.ts); acá se acepta para que las dos
// versiones tengan la misma firma y nunca se inventa una ubicación.
export function useCurrentLocation(_options: { fallback?: boolean } = {}) {
  const [state, setState] = useState<LocationState>({
    latitude: null,
    longitude: null,
    isLoading: true,
    errorMessage: null,
    isApproximate: false,
  });

  const request = () => {
    // Demo de Estados Unidos: la ubicación es simulada (Midtown Manhattan), no la del GPS; si no,
    // el mapa abriría en Buenos Aires, donde no hay cocheras de esa región.
    const region = activeRegion();
    if (region.simulatedLocation) {
      setState({ ...region.center, isLoading: false, errorMessage: null, isApproximate: false });
      return;
    }
    setState((prev) => ({ ...prev, isLoading: true, errorMessage: null }));
    Location.requestForegroundPermissionsAsync()
      .then((permission) => {
        if (!permission.granted) {
          setState({ latitude: null, longitude: null, isLoading: false, errorMessage: 'Necesitamos permiso de ubicación para mostrarte estacionamientos cercanos.', isApproximate: false });
          return null;
        }
        // Alta precisión: con la precisión por defecto la posición puede venir de una
        // triangulación gruesa (o del caché) y caer a cientos de metros del usuario.
        return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      })
      .then((position) => {
        if (!position) return;
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          isLoading: false,
          errorMessage: null,
          isApproximate: false,
        });
      })
      .catch(() => {
        setState({ latitude: null, longitude: null, isLoading: false, errorMessage: 'No se pudo obtener tu ubicación.', isApproximate: false });
      });
  };

  useEffect(() => {
    request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, retry: request };
}
