import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Text } from 'react-native';

import { ParkingCard } from '@/components/parking/ParkingCard';
import { BackHeader } from '@/components/ui/BackHeader';
import { Banner } from '@/components/ui/Banner';
import { Screen } from '@/components/ui/Screen';
import { getCoverImageUrls, searchParkingLots } from '@/features/parking/api';
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

export default function ListScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const params = useLocalSearchParams<SearchParams>();
  const currentLocation = useCurrentLocation();

  const paramLat = params.lat ? Number(params.lat) : NaN;
  const paramLng = params.lng ? Number(params.lng) : NaN;
  const latitude = Number.isFinite(paramLat) ? paramLat : currentLocation.latitude;
  const longitude = Number.isFinite(paramLng) ? paramLng : currentLocation.longitude;

  const [results, setResults] = useState<ParkingLotWithDistance[]>([]);
  const [coverImages, setCoverImages] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    setIsLoading(true);
    setErrorMessage(null);
    searchParkingLots({
      latitude,
      longitude,
      radiusKm: Number(params.radiusKm) || 5,
      maxPrice: params.maxPrice ? Number(params.maxPrice) : null,
      minRating: params.minRating ? Number(params.minRating) : null,
    })
      .then(async (lots) => {
        setResults(lots);
        setCoverImages(await getCoverImageUrls(lots.map((l) => l.id)));
      })
      .catch(() => setErrorMessage('No se pudieron cargar los estacionamientos.'))
      .finally(() => setIsLoading(false));
  }, [latitude, longitude, params.radiusKm, params.maxPrice, params.minRating]);

  return (
    <Screen>
      <BackHeader href="/(client)/search" />

      <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 16 }]}>
        {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
      </Text>

      {errorMessage ? <Banner message={errorMessage} /> : null}
      {latitude === null && currentLocation.errorMessage ? <Banner message={currentLocation.errorMessage} /> : null}

      {!isLoading && results.length === 0 && !errorMessage ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          No encontramos estacionamientos con esos filtros. Probá ampliar la distancia o el precio.
        </Text>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        renderItem={({ item }) => (
          <ParkingCard
            name={item.name}
            address={item.address}
            pricePerHour={item.pricePerHour}
            ratingAvg={item.ratingAvg}
            distanceKm={item.distanceKm}
            imageUrl={coverImages[item.id]}
            onPress={() => router.push({ pathname: '/(client)/search/parking/[id]', params: { id: item.id } })}
          />
        )}
      />
    </Screen>
  );
}
