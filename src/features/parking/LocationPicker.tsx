import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';

import { useTheme } from '@/theme';

const DEFAULT_CENTER: LatLng = { latitude: -34.6037, longitude: -58.3816 };

type LocationPickerProps = {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
  onAddressResolved?: (address: string) => void;
  /** Cada vez que cambia, el mapa se centra en el marcador (por ejemplo, al ubicar una dirección escrita). */
  recenterToken?: number;
};

function formatAddress(result: Location.LocationGeocodedAddress): string | null {
  const streetPart = [result.street, result.streetNumber].filter(Boolean).join(' ');
  const cityPart = result.city ?? result.subregion ?? result.region ?? '';
  const formatted = [streetPart, cityPart].filter(Boolean).join(', ');
  return formatted || result.name || null;
}

export function LocationPicker({ latitude, longitude, onChange, onAddressResolved, recenterToken }: LocationPickerProps) {
  const { colors, typography } = useTheme();
  const mapRef = useRef<MapView>(null);
  const [initialCenter] = useState<LatLng>(
    latitude !== null && longitude !== null ? { latitude, longitude } : DEFAULT_CENTER
  );

  useEffect(() => {
    if (latitude !== null || longitude !== null) return;
    Location.getCurrentPositionAsync({})
      .then((position) => onChange(position.coords.latitude, position.coords.longitude))
      .catch(() => {});
    // Solo al montar: si ya hay coordenadas (edición) no pisamos el valor existente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al ubicar una dirección escrita, el marcador cambia de lugar y el mapa lo acompaña.
  useEffect(() => {
    if (!recenterToken || latitude === null || longitude === null) return;
    mapRef.current?.animateToRegion({ latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
    // Solo cuando cambia el token: mover el marcador a mano no tiene que mover el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterToken]);

  const markerCoordinate: LatLng = latitude !== null && longitude !== null ? { latitude, longitude } : initialCenter;

  const handleMove = (coordinate: LatLng) => {
    onChange(coordinate.latitude, coordinate.longitude);
    if (!onAddressResolved) return;
    Location.reverseGeocodeAsync(coordinate)
      .then(([result]) => {
        if (result) {
          const formatted = formatAddress(result);
          if (formatted) onAddressResolved(formatted);
        }
      })
      .catch(() => {});
  };

  return (
    <View>
      <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>
        Ubicación en el mapa (tocá o arrastrá el marcador)
      </Text>
      <View style={[styles.mapContainer, { borderColor: colors.outline }]}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{ ...initialCenter, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
          onPress={(e) => handleMove(e.nativeEvent.coordinate)}
        >
          <Marker coordinate={markerCoordinate} draggable onDragEnd={(e) => handleMove(e.nativeEvent.coordinate)} />
        </MapView>
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
  map: {
    flex: 1,
  },
});
