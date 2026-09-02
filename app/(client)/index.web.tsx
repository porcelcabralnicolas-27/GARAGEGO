import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ParkingPreviewSheet } from '@/components/parking/ParkingPreviewSheet';
import { Banner } from '@/components/ui/Banner';
import { Logo } from '@/components/ui/Logo';
import { SearchBar } from '@/components/ui/SearchBar';
import { searchParkingLots } from '@/features/parking/api';
import { buildParkingMarkerIcon } from '@/features/parking/parkingMarkerIcon.web';
import type { ParkingLotWithDistance } from '@/features/parking/types';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { radius, spacing, useTheme } from '@/theme';

type SearchParams = {
  lat: string;
  lng: string;
  radiusKm: string;
  maxPrice: string;
  minRating: string;
};

const GOOGLE_MAPS_WEB_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '';

// Versión web de la pestaña Inicio: react-native-maps (usado en app/(client)/index.tsx) no tiene
// soporte para web, así que acá se usa la API de JavaScript de Google Maps directamente.
export default function ClientHomeWebScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<SearchParams>();
  const currentLocation = useCurrentLocation();

  const paramLat = params.lat ? Number(params.lat) : NaN;
  const paramLng = params.lng ? Number(params.lng) : NaN;
  const latitude = Number.isFinite(paramLat) ? paramLat : currentLocation.latitude;
  const longitude = Number.isFinite(paramLng) ? paramLng : currentLocation.longitude;
  const hasCoordinates = latitude !== null && longitude !== null;

  const [results, setResults] = useState<ParkingLotWithDistance[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'garagego-google-maps-web',
    googleMapsApiKey: GOOGLE_MAPS_WEB_API_KEY,
  });

  useEffect(() => {
    if (!hasCoordinates) return;
    searchParkingLots({
      latitude,
      longitude,
      radiusKm: Number(params.radiusKm) || 5,
      maxPrice: params.maxPrice ? Number(params.maxPrice) : null,
      minRating: params.minRating ? Number(params.minRating) : null,
    })
      .then(setResults)
      .catch(() => setErrorMessage('No se pudieron cargar los estacionamientos.'));
  }, [hasCoordinates, latitude, longitude, params.radiusKm, params.maxPrice, params.minRating]);

  const selected = results.find((r) => r.id === selectedId) ?? null;

  if (!GOOGLE_MAPS_WEB_API_KEY) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 20 }]}>
        <Banner message="Falta configurar EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY en .env para ver el mapa en la versión web." />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 20 }]}>
        <Banner message="No se pudo cargar Google Maps." />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        {/* El logo hace de identidad de la pantalla; antes había un saludo "HOLA, {nombre}". */}
        <Logo />
        <SearchBar placeholder="¿A dónde vas?" onPress={() => router.push('/(client)/search')} />
      </View>

      {errorMessage ? (
        <View style={styles.banner}>
          <Banner message={errorMessage} />
        </View>
      ) : null}
      {!hasCoordinates && currentLocation.errorMessage ? (
        <View style={styles.banner}>
          <Banner message={currentLocation.errorMessage} />
        </View>
      ) : null}

      {isLoaded && latitude !== null && longitude !== null ? (
        <View style={styles.mapWrapper}>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={{ lat: latitude, lng: longitude }}
            zoom={13}
          >
            {results.map((lot) => (
              <MarkerF
                key={lot.id}
                position={{ lat: lot.latitude, lng: lot.longitude }}
                icon={buildParkingMarkerIcon(colors.primary)}
                onClick={() => setSelectedId(lot.id)}
              />
            ))}
          </GoogleMap>
        </View>
      ) : null}

      {selected ? (
        <ParkingPreviewSheet
          lot={selected}
          onClose={() => setSelectedId(null)}
          onViewDetail={() =>
            router.push({ pathname: '/(client)/search/parking/[id]', params: { id: selected.id } })
          }
          onBook={() =>
            router.push({ pathname: '/(client)/search/booking/[parkingId]', params: { parkingId: selected.id } })
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    // Separa el logo del buscador (antes lo hacía el margen del saludo).
    gap: spacing.md,
  },
  banner: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  mapWrapper: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
});
