import { GoogleMap, MarkerF, PolylineF, useJsApiLoader } from '@react-google-maps/api';
import { StyleSheet, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { useTheme } from '@/theme';
import type { LatLngPoint } from './types';

const GOOGLE_MAPS_WEB_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '';

type RouteMapProps = {
  origin: LatLngPoint;
  destination: LatLngPoint;
  coordinates: LatLngPoint[];
};

export function RouteMap({ origin, destination, coordinates }: RouteMapProps) {
  const { colors } = useTheme();
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'garagego-google-maps-web',
    googleMapsApiKey: GOOGLE_MAPS_WEB_API_KEY,
  });

  const center = {
    lat: (origin.latitude + destination.latitude) / 2,
    lng: (origin.longitude + destination.longitude) / 2,
  };

  const path = coordinates.map((point) => ({ lat: point.latitude, lng: point.longitude }));

  if (!GOOGLE_MAPS_WEB_API_KEY) {
    return <Banner message="Falta configurar EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY para mostrar el mapa." />;
  }
  if (loadError) {
    return <Banner message="No se pudo cargar Google Maps." />;
  }

  return (
    <View style={styles.container}>
      {isLoaded ? (
        <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={center} zoom={14}>
          <MarkerF position={{ lat: origin.latitude, lng: origin.longitude }} title="Tu ubicación" />
          <MarkerF position={{ lat: destination.latitude, lng: destination.longitude }} title="Estacionamiento" />
          <PolylineF path={path} options={{ strokeColor: colors.accent, strokeWeight: 4 }} />
        </GoogleMap>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
