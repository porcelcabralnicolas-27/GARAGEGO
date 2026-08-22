import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackHeader } from '@/components/ui/BackHeader';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { getParkingLot, getRecurringAvailability, listParkingImages } from '@/features/parking/api';
import { getProfile } from '@/features/profile/api';
import { DAY_LABELS, type ParkingImage, type ParkingLot, type RecurringAvailability } from '@/features/parking/types';
import { listRatingsForParkingLot } from '@/features/rating/api';
import type { RatingWithAuthor } from '@/features/rating/types';
import { StarRating } from '@/components/ui/StarRating';
import { useTheme } from '@/theme';

export default function ParkingDetailScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [lot, setLot] = useState<ParkingLot | null>(null);
  const [images, setImages] = useState<ParkingImage[]>([]);
  const [availability, setAvailability] = useState<RecurringAvailability[]>([]);
  const [ratings, setRatings] = useState<RatingWithAuthor[]>([]);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getParkingLot(id)
      .then(async (data) => {
        setLot(data);
        const [imgs, avail, owner, ratingList] = await Promise.all([
          listParkingImages(id),
          getRecurringAvailability(id),
          getProfile(data.ownerId).catch(() => null),
          listRatingsForParkingLot(id).catch(() => []),
        ]);
        setImages(imgs);
        setAvailability(avail);
        setRatings(ratingList);
        if (owner) setOwnerName(`${owner.firstName} ${owner.lastName}`.trim());
      })
      .catch(() => setErrorMessage('No se pudo cargar el estacionamiento.'));
  }, [id]);

  if (errorMessage) {
    return (
      <Screen>
        <BackHeader href="/(client)/search/list" />
        <Banner message={errorMessage} />
      </Screen>
    );
  }

  if (!lot) {
    return (
      <Screen>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <BackHeader href="/(client)/search/list" />

        {images.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gallery}>
            {images.map((image) => (
              <Image key={image.id} source={{ uri: image.publicUrl }} style={styles.galleryImage} />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.galleryImage, styles.galleryPlaceholder, { backgroundColor: colors.primaryContainer }]}>
            <Ionicons name="car" size={40} color={colors.onPrimaryContainer} />
          </View>
        )}

        <Text style={[typography.displayLarge, { color: colors.onBackground, marginTop: 16 }]}>{lot.name}</Text>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 4 }]}>{lot.address}</Text>
        {ownerName ? (
          <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 12 }]}>
            Publicado por {ownerName}
          </Text>
        ) : null}

        <View style={styles.row}>
          <Text style={[typography.titleLarge, { color: colors.accent }]}>${lot.pricePerHour.toFixed(2)}/hora</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={16} color={colors.onSurfaceVariant} />
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginLeft: 4 }]}>
              {lot.ratingAvg.toFixed(1)}
            </Text>
          </View>
        </View>

        {lot.description ? (
          <Text style={[typography.bodyLarge, { color: colors.onSurface, marginTop: 16 }]}>{lot.description}</Text>
        ) : null}

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
          Opiniones {ratings.length > 0 ? `(${ratings.length})` : ''}
        </Text>
        {ratings.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
            Todavía no hay opiniones sobre este estacionamiento.
          </Text>
        ) : (
          ratings.map((rating) => (
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

        <View style={styles.spacerLarge} />

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
  galleryImage: {
    width: 280,
    height: 180,
    borderRadius: 12,
    marginRight: 10,
  },
  galleryPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
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
