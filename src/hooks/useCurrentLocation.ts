import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

type LocationState = {
  latitude: number | null;
  longitude: number | null;
  isLoading: boolean;
  errorMessage: string | null;
};

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({
    latitude: null,
    longitude: null,
    isLoading: true,
    errorMessage: null,
  });

  const request = () => {
    setState((prev) => ({ ...prev, isLoading: true, errorMessage: null }));
    Location.requestForegroundPermissionsAsync()
      .then((permission) => {
        if (!permission.granted) {
          setState({ latitude: null, longitude: null, isLoading: false, errorMessage: 'Necesitamos permiso de ubicación para mostrarte estacionamientos cercanos.' });
          return null;
        }
        return Location.getCurrentPositionAsync({});
      })
      .then((position) => {
        if (!position) return;
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          isLoading: false,
          errorMessage: null,
        });
      })
      .catch(() => {
        setState({ latitude: null, longitude: null, isLoading: false, errorMessage: 'No se pudo obtener tu ubicación.' });
      });
  };

  useEffect(() => {
    request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, retry: request };
}
