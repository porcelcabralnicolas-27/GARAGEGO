import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList } from 'react-native';

import { ParkingCard } from '@/components/parking/ParkingCard';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { getCoverImageUrls, searchParkingLotsPage, type SearchCursor } from '@/features/parking/api';
import type { ParkingLotWithDistance } from '@/features/parking/types';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import type { Page } from '@/lib/pagination';
import { queryKeys } from '@/lib/queryKeys';

type SearchParams = {
  lat: string;
  lng: string;
  radiusKm: string;
  maxPrice: string;
  minRating: string;
};

/** Una página de resultados con sus portadas, que se piden junto con la página. */
type ResultsPage = Page<ParkingLotWithDistance, SearchCursor> & { coverImages: Record<string, string> };

export default function ListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<SearchParams>();
  const currentLocation = useCurrentLocation();

  const paramLat = params.lat ? Number(params.lat) : NaN;
  const paramLng = params.lng ? Number(params.lng) : NaN;
  const latitude = Number.isFinite(paramLat) ? paramLat : currentLocation.latitude;
  const longitude = Number.isFinite(paramLng) ? paramLng : currentLocation.longitude;

  const filters = {
    latitude: latitude ?? 0,
    longitude: longitude ?? 0,
    radiusKm: Number(params.radiusKm) || 5,
    maxPrice: params.maxPrice ? Number(params.maxPrice) : null,
    minRating: params.minRating ? Number(params.minRating) : null,
  };

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: queryKeys.parkingLots.search(filters),
    queryFn: async ({ pageParam }): Promise<ResultsPage> => {
      const page = await searchParkingLotsPage(filters, pageParam);
      return { ...page, coverImages: await getCoverImageUrls(page.items.map((l) => l.id)) };
    },
    initialPageParam: null as SearchCursor | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: latitude !== null && longitude !== null,
  });

  const results = data?.pages.flatMap((page) => page.items) ?? [];
  const coverImages = Object.assign({}, ...(data?.pages.map((page) => page.coverImages) ?? [])) as Record<string, string>;
  const errorMessage = isError ? 'No se pudieron cargar los estacionamientos.' : null;

  // Mientras haya más páginas, el total todavía no se sabe.
  const title = hasNextPage
    ? `Más de ${results.length} resultados`
    : `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}`;

  return (
    <Screen>
      <ScreenHeader title={title} backHref="/(client)/search" />

      {errorMessage ? <Banner message={errorMessage} /> : null}
      {latitude === null && currentLocation.errorMessage ? <Banner message={currentLocation.errorMessage} /> : null}

      {!isLoading && results.length === 0 && !errorMessage ? (
        <EmptyState
          icon="search-outline"
          title="Sin resultados"
          description="No encontramos estacionamientos con esos filtros. Probá ampliar la distancia o el precio."
          actionLabel="Cambiar filtros"
          onAction={() => router.replace('/(client)/search')}
        />
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={<LoadMoreFooter isFetching={isFetchingNextPage} />}
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
