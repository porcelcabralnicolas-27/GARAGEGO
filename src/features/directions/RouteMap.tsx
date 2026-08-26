import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';

import { useTheme } from '@/theme';
import type { LatLngPoint } from './types';

type RouteMapProps = {
  origin: LatLngPoint;
  destination: LatLngPoint;
  coordinates: LatLngPoint[];
};

export function RouteMap({ origin, destination, coordinates }: RouteMapProps) {
  const { colors } = useTheme();

  const region = {
    latitude: (origin.latitude + destination.latitude) / 2,
    longitude: (origin.longitude + destination.longitude) / 2,
    latitudeDelta: Math.max(Math.abs(origin.latitude - destination.latitude) * 1.8, 0.02),
    longitudeDelta: Math.max(Math.abs(origin.longitude - destination.longitude) * 1.8, 0.02),
  };

  const polylineCoordinates: LatLng[] = coordinates.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));

  return (
    <View style={styles.container}>
      <MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={region}>
        <Marker coordinate={origin} pinColor={colors.accent} title="Tu ubicación" />
        <Marker coordinate={destination} title="Estacionamiento" />
        <Polyline coordinates={polylineCoordinates} strokeColor={colors.accent} strokeWidth={4} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
