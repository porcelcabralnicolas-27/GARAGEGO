import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';

import { ParkingMarker } from '@/components/parking/ParkingMarker';
import { ParkingPreviewSheet } from '@/components/parking/ParkingPreviewSheet';
import { Banner } from '@/components/ui/Banner';
import { Logo } from '@/components/ui/Logo';
import { SearchBar } from '@/components/ui/SearchBar';
import { searchParkingLots } from '@/features/parking/api';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { formatPricePerHour } from '@/lib/money';
import { queryKeys } from '@/lib/queryKeys';
import { radius, spacing, useTheme } from '@/theme';

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

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = {
    latitude: latitude ?? 0,
    longitude: longitude ?? 0,
    radiusKm: Number(params.radiusKm) || 5,
    maxPrice: params.maxPrice ? Number(params.maxPrice) : null,
    minRating: params.minRating ? Number(params.minRating) : null,
  };
  const { data: results = [], isError } = useQuery({
    queryKey: queryKeys.parkingLots.nearby(filters),
    queryFn: () => searchParkingLots(filters),
    enabled: latitude !== null && longitude !== null,
  });
  const errorMessage = isError ? 'No se pudieron cargar los estacionamientos.' : null;

  const selected = results.find((r) => r.id === selectedId) ?? null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
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
        {latitude === null && currentLocation.errorMessage ? (
          <View style={styles.banner}>
            <Banner message={currentLocation.errorMessage} />
          </View>
        ) : null}
      </SafeAreaView>

      {latitude !== null && longitude !== null ? (
        <View style={styles.mapWrapper}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude,
            longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          // Tocar el mapa fuera de un marcador cierra la tarjeta de vista previa.
          onPress={() => setSelectedId(null)}
        >
          {results.map((lot) => (
            <ParkingMarker
              key={lot.id}
              coordinate={{ latitude: lot.latitude, longitude: lot.longitude }}
              title={lot.name}
              description={`${formatPricePerHour(lot.pricePerHour)} · ★ ${lot.ratingAvg.toFixed(1)}`}
              // Antes navegaba directo al detalle; ahora muestra la tarjeta inferior primero,
              // así se puede comparar entre marcadores sin salir del mapa.
              onPress={() => setSelectedId(lot.id)}
            />
          ))}
        </MapView>
        </View>
      ) : (
        <View style={styles.centerFill}>
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Obteniendo tu ubicación…</Text>
        </View>
      )}

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
  // El recorte va en el contenedor y no en el MapView: en Android un borderRadius aplicado
  // directamente sobre el mapa no recorta la superficie nativa.
  mapWrapper: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
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
