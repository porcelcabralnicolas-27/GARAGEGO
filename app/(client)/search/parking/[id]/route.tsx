import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackHeader } from '@/components/ui/BackHeader';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { RouteMap } from '@/features/directions/RouteMap';
import { getDirections } from '@/features/directions/api';
import type { DirectionsResult } from '@/features/directions/types';
import { getParkingLot } from '@/features/parking/api';
import type { ParkingLot } from '@/features/parking/types';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { useTheme } from '@/theme';

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} h ${remainingMinutes} min`;
}

export default function ParkingRouteScreen() {
  const { colors, typography } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const location = useCurrentLocation();

  const [lot, setLot] = useState<ParkingLot | null>(null);
  const [directions, setDirections] = useState<DirectionsResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  useEffect(() => {
    getParkingLot(id)
      .then(setLot)
      .catch(() => setErrorMessage('No se pudo cargar el estacionamiento.'));
  }, [id]);

  useEffect(() => {
    if (!lot || location.latitude === null || location.longitude === null) return;

    setIsLoadingRoute(true);
    setErrorMessage(null);
    getDirections(
      { latitude: location.latitude, longitude: location.longitude },
      { latitude: lot.latitude, longitude: lot.longitude }
    )
      .then(setDirections)
      .catch((error) => {
        // Mostramos el error real: el servidor demo de OSRM puede estar caído o rechazar
        // la consulta por CORS, y un mensaje genérico haría imposible diagnosticarlo.
        setErrorMessage(
          error && typeof error === 'object' && 'message' in error
            ? `No se pudo calcular la ruta: ${String((error as { message: unknown }).message)}`
            : 'No se pudo calcular la ruta.'
        );
      })
      .finally(() => setIsLoadingRoute(false));
  }, [lot, location.latitude, location.longitude]);

  const openInGoogleMaps = () => {
    if (!lot) return;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lot.latitude},${lot.longitude}`);
  };

  const hasRoute = lot && directions && location.latitude !== null && location.longitude !== null;
  const isBusy = location.isLoading || isLoadingRoute || !lot;

  return (
    <Screen>
      <BackHeader href={{ pathname: '/(client)/search/parking/[id]', params: { id } }} />

      {location.errorMessage ? <Banner message={location.errorMessage} /> : null}
      {errorMessage ? <Banner message={errorMessage} /> : null}

      {isBusy ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          {location.isLoading ? 'Obteniendo tu ubicación…' : 'Calculando ruta…'}
        </Text>
      ) : null}

      {hasRoute ? (
        <>
          <View style={styles.mapContainer}>
            <RouteMap
              origin={{ latitude: location.latitude as number, longitude: location.longitude as number }}
              destination={{ latitude: lot.latitude, longitude: lot.longitude }}
              coordinates={directions.coordinates}
            />
          </View>

          <Text style={[typography.label, { color: colors.onSurfaceVariant, marginTop: 4 }]}>
            Saliendo de tu ubicación actual · Ruta calculada con OSRM / © colaboradores de OpenStreetMap
          </Text>

          <View style={styles.infoRow}>
            <Text style={[typography.titleMedium, { color: colors.onBackground }]}>
              {formatDistance(directions.distanceMeters)}
            </Text>
            <Text style={[typography.titleMedium, { color: colors.onBackground }]}>
              {formatDuration(directions.durationSeconds)}
            </Text>
          </View>
        </>
      ) : null}

      {/* Fuera del bloque de éxito: si OSRM falla, este sigue siendo el camino para llegar. */}
      <View style={styles.actions}>
        <Button
          label="Actualizar mi ubicación"
          variant="outlined"
          onPress={location.retry}
          loading={location.isLoading}
        />
        <View style={styles.spacer} />
        <Button label="Abrir en Google Maps" variant="text" onPress={openInGoogleMaps} disabled={!lot} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 16,
  },
  actions: {
    marginTop: 'auto',
    paddingTop: 12,
  },
  spacer: {
    height: 8,
  },
});
