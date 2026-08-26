import { useEffect, useState } from 'react';

type LocationState = {
  latitude: number | null;
  longitude: number | null;
  isLoading: boolean;
  errorMessage: string | null;
};

// Versión web del hook. Usa navigator.geolocation directo en vez de expo-location porque:
// 1. expo-location en web resuelve el permiso por la Permissions API y puede devolver
//    granted:false sin haber mostrado el diálogo del navegador (que recién aparece al
//    llamar getCurrentPosition).
// 2. Necesitamos enableHighAccuracy + maximumAge:0 para no recibir la ubicación por IP
//    del proveedor de internet, que puede estar a decenas de kilómetros.
// Mismo patrón que ya usa LocationPicker.web.tsx.
export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({
    latitude: null,
    longitude: null,
    isLoading: true,
    errorMessage: null,
  });

  const request = () => {
    setState((prev) => ({ ...prev, isLoading: true, errorMessage: null }));

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        latitude: null,
        longitude: null,
        isLoading: false,
        errorMessage: 'Tu navegador no permite obtener la ubicación.',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          isLoading: false,
          errorMessage: null,
        });
      },
      (error) => {
        setState({
          latitude: null,
          longitude: null,
          isLoading: false,
          errorMessage:
            error.code === error.PERMISSION_DENIED
              ? 'Necesitamos permiso de ubicación para mostrarte estacionamientos cercanos.'
              : 'No se pudo obtener tu ubicación.',
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, retry: request };
}
