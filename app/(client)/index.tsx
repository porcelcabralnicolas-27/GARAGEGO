import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';

import { ParkingMarker } from '@/components/parking/ParkingMarker';
import { Banner } from '@/components/ui/Banner';
import { SearchBar } from '@/components/ui/SearchBar';
import { searchParkingLots } from '@/features/parking/api';
import type { ParkingLotWithDistance } from '@/features/parking/types';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { useTheme } from '@/theme';

type SearchParams = {
  lat: string;
  lng: string;
  radiusKm: string;
  maxPrice: string;
  minRating: string;
};

export default function ClientHomeScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const params = useLocalSearchParams<SearchParams>();
  const currentLocation = useCurrentLocation();

  // Llegar acá sin pasar por Buscar (uso normal de la pestaña Inicio) no trae params de lat/lng.
  // En ese caso se usa la ubicación actual del dispositivo.
  const paramLat = params.lat ? Number(params.lat) : NaN;
  const paramLng = params.lng ? Number(params.lng) : NaN;
  const latitude = Number.isFinite(paramLat) ? paramLat : currentLocation.latitude;
  const longitude = Number.isFinite(paramLng) ? paramLng : currentLocation.longitude;

  const [results, setResults] = useState<ParkingLotWithDistance[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    searchParkingLots({
      latitude,
      longitude,
      radiusKm: Number(params.radiusKm) || 5,
      maxPrice: params.maxPrice ? Number(params.maxPrice) : null,
      minRating: params.minRating ? Number(params.minRating) : null,
    })
      .then(setResults)
      .catch(() => setErrorMessage('No se pudieron cargar los estacionamientos.'));
  }, [latitude, longitude, params.radiusKm, params.maxPrice, params.minRating]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={styles.header}>
          <SearchBar placeholder="Buscar estacionamientos…" onPress={() => router.push('/(client)/search')} />
        </View>
        {errorMessage ? (
          <View style={styles.banner}>
            <Banner message={errorMessage} />
          </View>
        ) : null}
        {latitude === null && currentLocation.errorMessage ? (
          <View style={styles.banner}>
            <Banner message={currentLocation.errorMessage} />
          </View>
        ) : null}
      </SafeAreaView>

      {latitude !== null && longitude !== null ? (
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude,
            longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          {results.map((lot) => (
            <ParkingMarker
              key={lot.id}
              coordinate={{ latitude: lot.latitude, longitude: lot.longitude }}
              title={lot.name}
              description={`$${lot.pricePerHour.toFixed(2)}/hora · ★ ${lot.ratingAvg.toFixed(1)}`}
              onPress={() => router.push({ pathname: '/(client)/search/parking/[id]', params: { id: lot.id } })}
            />
          ))}
        </MapView>
      ) : (
        <View style={styles.centerFill}>
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Obteniendo tu ubicación…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  banner: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  map: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
