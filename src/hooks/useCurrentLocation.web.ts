import { useEffect, useState } from 'react';

type LocationState = {
  latitude: number | null;
  longitude: number | null;
  isLoading: boolean;
  errorMessage: string | null;
  /** true cuando las coordenadas son la ubicación por defecto y no la del usuario. */
  isApproximate: boolean;
};

// Centro de Buenos Aires (Obelisco). Se usa SOLO si el navegador no entrega la ubicación del
// usuario (permiso rechazado o no disponible): así la búsqueda no queda trabada, por ejemplo en
// una demo. Si el usuario da el permiso, se usa siempre su ubicación real.
const DEFAULT_LOCATION = { latitude: -34.6037, longitude: -58.3816 };

type Options = {
  /**
   * Con `false`, sin permiso no se inventa una ubicación: las coordenadas quedan en null. Lo usa
   * la pantalla de ruta, donde partir de un punto que no es el del usuario daría una ruta falsa.
   */
  fallback?: boolean;
};

// Versión web del hook. Usa navigator.geolocation directo en vez de expo-location porque:
// 1. expo-location en web resuelve el permiso por la Permissions API y puede devolver
//    granted:false sin haber mostrado el diálogo del navegador (que recién aparece al
//    llamar getCurrentPosition).
// 2. Necesitamos enableHighAccuracy + maximumAge:0 para no recibir la ubicación por IP
//    del proveedor de internet, que puede estar a decenas de kilómetros.
// Mismo patrón que ya usa LocationPicker.web.tsx.
export function useCurrentLocation({ fallback = true }: Options = {}) {
  const [state, setState] = useState<LocationState>({
    latitude: null,
    longitude: null,
    isLoading: true,
    errorMessage: null,
    isApproximate: false,
  });

  // Sin ubicación real: o se usa la de por defecto (con un aviso) o se deja vacía.
  const unavailable = (message: string): LocationState =>
    fallback
      ? {
          ...DEFAULT_LOCATION,
          isLoading: false,
          errorMessage: `${message} Te mostramos estacionamientos cerca del Obelisco, en Buenos Aires.`,
          isApproximate: true,
        }
      : { latitude: null, longitude: null, isLoading: false, errorMessage: message, isApproximate: false };

  const request = () => {
    setState((prev) => ({ ...prev, isLoading: true, errorMessage: null }));

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState(unavailable('Tu navegador no permite obtener la ubicación.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          isLoading: false,
          errorMessage: null,
          isApproximate: false,
        });
      },
      (error) => {
        setState(
          unavailable(
            error.code === error.PERMISSION_DENIED
              ? 'No tenemos permiso para usar tu ubicación.'
              : 'No se pudo obtener tu ubicación.'
          )
        );
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
