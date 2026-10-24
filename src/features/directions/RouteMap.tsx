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
        {/* Origen oscuro y destino lima, como los extremos de la ruta en el Figma. */}
        <Marker coordinate={origin} pinColor={colors.onSurface} title="Tu ubicación" />
        <Marker coordinate={destination} pinColor={colors.primary} title="Estacionamiento" />
        {/* El trazo usa el lima de marca sin oscurecer: sobre el mapa es una línea gruesa,
            no texto, así que no le aplica el mínimo de contraste que obliga a usar `accent`. */}
        <Polyline coordinates={polylineCoordinates} strokeColor={colors.primary} strokeWidth={6} />
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
