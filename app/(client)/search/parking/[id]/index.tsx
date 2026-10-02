import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AmenityList } from '@/components/parking/AmenityList';
import { ParkingGallery } from '@/components/parking/ParkingGallery';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import {
  getParkingLot,
  getParkingLotOwnerName,
  getRecurringAvailability,
  listParkingImages,
} from '@/features/parking/api';
import { formatPricePerHour } from '@/lib/money';
import { DAY_LABELS, type ParkingImage, type ParkingLot, type RecurringAvailability } from '@/features/parking/types';
import { listRatingsPage, type RatingCursor } from '@/features/rating/api';
import { StarRating } from '@/components/ui/StarRating';
import { flattenPages } from '@/lib/pagination';
import { queryKeys } from '@/lib/queryKeys';
import { useTheme } from '@/theme';

/** Opiniones que se ven antes de tocar "Ver más opiniones". */
const VISIBLE_RATINGS = 3;

type ParkingDetailData = {
  lot: ParkingLot;
  images: ParkingImage[];
  availability: RecurringAvailability[];
  ownerName: string | null;
};

export default function ParkingDetailScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Todo en paralelo: el nombre del dueño se pide por id de cochera, así que ya no hace falta
  // esperar al lote para saber a quién buscar.
  const { data, isError } = useQuery({
    queryKey: queryKeys.parkingLots.publicDetail(id),
    queryFn: async (): Promise<ParkingDetailData> => {
      const [lot, images, availability, ownerName] = await Promise.all([
        getParkingLot(id),
        listParkingImages(id),
        getRecurringAvailability(id),
        getParkingLotOwnerName(id).catch(() => null),
      ]);
      return { lot, images, availability, ownerName };
    },
  });

  // Las opiniones van aparte y de a una página: una cochera muy calificada no trae todas.
  const ratingsQuery = useInfiniteQuery({
    queryKey: queryKeys.parkingLots.ratings(id),
    queryFn: ({ pageParam }) => listRatingsPage(id, pageParam),
    initialPageParam: null as RatingCursor | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  const ratings = flattenPages(ratingsQuery.data);
  // Se ven pocas opiniones de entrada para que la ficha no se llene; el resto está detrás de un botón.
  const [showAllRatings, setShowAllRatings] = useState(false);
  const visibleRatings = showAllRatings ? ratings : ratings.slice(0, VISIBLE_RATINGS);
  const hasMoreRatings = ratings.length > VISIBLE_RATINGS || ratingsQuery.hasNextPage;

  if (isError) {
    return (
      <Screen>
        <ScreenHeader title="Estacionamiento" backHref="/(client)/search/list" />
        <Banner message="No se pudo cargar el estacionamiento." />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
      </Screen>
    );
  }

  const { lot, images, availability, ownerName } = data;

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <ScreenHeader title={lot.name} backHref="/(client)/search/list" />

        <View style={styles.gallery}>
          <ParkingGallery images={images} />
        </View>

        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginTop: 16, marginBottom: 4 }]}>
          {lot.address}
        </Text>
        {ownerName ? (
          <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 12 }]}>
            Publicado por {ownerName}
          </Text>
        ) : null}

        <View style={styles.row}>
          <Text style={[typography.titleLarge, { color: colors.accent }]}>{formatPricePerHour(lot.pricePerHour)}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={16} color={colors.onSurfaceVariant} />
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginLeft: 4 }]}>
              {lot.ratingAvg.toFixed(1)}
            </Text>
          </View>
        </View>

        <View style={styles.capacityRow}>
          <Ionicons name="car-outline" size={16} color={colors.onSurfaceVariant} />
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginLeft: 6 }]}>
            Capacidad: {lot.capacity} {lot.capacity === 1 ? 'auto' : 'autos'} a la vez
          </Text>
        </View>

        {lot.description ? (
          <Text style={[typography.bodyLarge, { color: colors.onSurface, marginTop: 16 }]}>{lot.description}</Text>
        ) : null}

        <Text style={[typography.titleMedium, { color: colors.onBackground, marginTop: 24, marginBottom: 8 }]}>
          Servicios
        </Text>
        <AmenityList amenities={lot.amenities} />

        <Text style={[typography.titleMedium, { color: colors.onBackground, marginTop: 24, marginBottom: 8 }]}>
          Horario disponible
        </Text>
        {availability.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
            El propietario todavía no definió un horario recurrente.
          </Text>
        ) : (
          availability.map((entry) => (
            <Text key={entry.id} style={[typography.bodyMedium, { color: colors.onSurface }]}>
              {DAY_LABELS[entry.dayOfWeek]}: {entry.startTime.slice(0, 5)} - {entry.endTime.slice(0, 5)}
            </Text>
          ))
        )}

        <Text style={[typography.titleMedium, { color: colors.onBackground, marginTop: 24, marginBottom: 8 }]}>
          {/* El total solo se conoce cuando ya se cargaron todas las páginas. */}
          Opiniones {ratings.length > 0 && !ratingsQuery.hasNextPage ? `(${ratings.length})` : ''}
        </Text>
        {ratingsQuery.isLoading ? null : ratings.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
            Todavía no hay opiniones sobre este estacionamiento.
          </Text>
        ) : (
          visibleRatings.map((rating) => (
            <View key={rating.id} style={[styles.reviewCard, { borderColor: colors.outline }]}>
              <View style={styles.reviewHeader}>
                <Text style={[typography.bodyLarge, { color: colors.onSurface }]}>{rating.authorName}</Text>
                <StarRating value={rating.score} size={14} />
              </View>
              {rating.comment ? (
                <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginTop: 4 }]}>
                  {rating.comment}
                </Text>
              ) : null}
            </View>
          ))
        )}
        {!showAllRatings && hasMoreRatings ? (
          <Button label="Ver más opiniones" variant="text" onPress={() => setShowAllRatings(true)} />
        ) : null}
        {showAllRatings && ratingsQuery.hasNextPage ? (
          <Button
            label="Cargar más opiniones"
            variant="text"
            onPress={() => ratingsQuery.fetchNextPage()}
            loading={ratingsQuery.isFetchingNextPage}
          />
        ) : null}
        {showAllRatings && ratings.length > VISIBLE_RATINGS ? (
          <Button label="Ver menos" variant="text" onPress={() => setShowAllRatings(false)} />
        ) : null}

        <View style={styles.spacerLarge} />

        <Button
          label="Cómo llegar"
          variant="outlined"
          onPress={() => router.push({ pathname: '/(client)/search/parking/[id]/route', params: { id: lot.id } })}
        />
        <View style={styles.spacer} />
        <Button
          label="Reservar"
          onPress={() => router.push({ pathname: '/(client)/search/booking/[parkingId]', params: { parkingId: lot.id } })}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gallery: {
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  spacer: {
    height: 12,
  },
  spacerLarge: {
    height: 24,
  },
  reviewCard: {
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
