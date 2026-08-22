import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { useTheme } from '@/theme';

const GOOGLE_MAPS_WEB_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '';
const DEFAULT_CENTER = { lat: -34.6037, lng: -58.3816 };

type LocationPickerProps = {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
  onAddressResolved?: (address: string) => void;
};

export function LocationPicker({ latitude, longitude, onChange, onAddressResolved }: LocationPickerProps) {
  const { colors, typography } = useTheme();
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'garagego-google-maps-web',
    googleMapsApiKey: GOOGLE_MAPS_WEB_API_KEY,
  });
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  // Centro fijo del mapa: se calcula una sola vez para no "recentrar" el mapa cada vez
  // que el usuario arrastra el marcador (eso pisaría el paneo/zoom del usuario).
  const [center] = useState(latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null);
  const [fallbackCenter, setFallbackCenter] = useState(DEFAULT_CENTER);

  useEffect(() => {
    if (center !== null || typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      const next = { lat: position.coords.latitude, lng: position.coords.longitude };
      setFallbackCenter(next);
      onChange(next.lat, next.lng);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markerPosition = latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : fallbackCenter;

  const handleMove = (position: { lat: number; lng: number }) => {
    onChange(position.lat, position.lng);
    if (!onAddressResolved || !isLoaded) return;
    if (!geocoderRef.current) geocoderRef.current = new google.maps.Geocoder();
    geocoderRef.current.geocode({ location: position }, (results, status) => {
      if (status === 'OK' && results?.[0]) onAddressResolved(results[0].formatted_address);
    });
  };

  if (!GOOGLE_MAPS_WEB_API_KEY) {
    return <Banner message="Falta configurar EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY para seleccionar la ubicación en el mapa." />;
  }
  if (loadError) {
    return <Banner message="No se pudo cargar Google Maps." />;
  }

  return (
    <View>
      <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>
        Ubicación en el mapa (hacé clic o arrastrá el marcador)
      </Text>
      <View style={[styles.mapContainer, { borderColor: colors.outline }]}>
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={center ?? fallbackCenter}
            zoom={15}
            onClick={(e) => {
              if (e.latLng) handleMove({ lat: e.latLng.lat(), lng: e.latLng.lng() });
            }}
          >
            <MarkerF
              position={markerPosition}
              draggable
              onDragEnd={(e) => {
                if (e.latLng) handleMove({ lat: e.latLng.lat(), lng: e.latLng.lng() });
              }}
            />
          </GoogleMap>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: 220,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
});
