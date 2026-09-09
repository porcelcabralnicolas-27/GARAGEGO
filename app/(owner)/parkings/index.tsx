import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { ParkingCard } from '@/components/parking/ParkingCard';
import { Banner } from '@/components/ui/Banner';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { getCoverImageUrls, listMyParkingLots } from '@/features/parking/api';
import { getListingStatus, type ParkingLot } from '@/features/parking/types';
import { useAuthStore } from '@/store/useAuthStore';
import { spacing, useTheme } from '@/theme';

type Filter = 'all' | 'active' | 'paused' | 'pending' | 'rejected';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'paused', label: 'Pausadas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'rejected', label: 'Rechazadas' },
];

/** ¿Bajo qué filtro cae esta publicación? Un lote está en exactamente uno. */
function filterBucket(lot: ParkingLot): Exclude<Filter, 'all'> {
  const status = getListingStatus(lot);
  if (status === 'rejected') return 'rejected';
  if (status === 'pending' || status === 'changes_requested') return 'pending';
  if (status === 'active') return 'active';
  return 'paused'; // paused, paused_by_admin, suspended
}

export default function OwnerParkingsScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [coverImages, setCoverImages] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    listMyParkingLots(profile.id)
      .then(async (data) => {
        setLots(data);
        setCoverImages(await getCoverImageUrls(data.map((lot) => lot.id)));
      })
      .catch(() => setErrorMessage('No se pudieron cargar tus publicaciones.'))
      .finally(() => setIsLoading(false));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const visibleLots = useMemo(() => {
    if (filter === 'all') return lots;
    return lots.filter((lot) => filterBucket(lot) === filter);
  }, [lots, filter]);

  return (
    <Screen>
      <ScreenHeader
        title="Mis publicaciones"
        action={
          <IconButton
            name="add-circle"
            size={28}
            color={colors.accent}
            onPress={() => router.push('/(owner)/parkings/create')}
            accessibilityLabel="Publicar un estacionamiento"
          />
        }
      />

      <Text style={[typography.bodyMedium, styles.subtitle, { color: colors.onSurfaceVariant }]}>
        Gestioná tus anuncios y seguí el estado de revisión del equipo.
      </Text>

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {lots.length > 0 ? (
        <View style={styles.filterRow}>
          <ChipSelect options={FILTERS} value={filter} onChange={setFilter} />
        </View>
      ) : null}

      {!isLoading && lots.length === 0 && !errorMessage ? (
        <EmptyState
          icon="business-outline"
          title="Todavía no publicaste ningún estacionamiento"
          description="Publicá tu primer lugar y empezá a recibir reservas."
          actionLabel="Publicar estacionamiento"
          onAction={() => router.push('/(owner)/parkings/create')}
        />
      ) : null}

      {!isLoading && lots.length > 0 && visibleLots.length === 0 ? (
        <Text style={[typography.bodyMedium, styles.emptyFilter, { color: colors.onSurfaceVariant }]}>
          No tenés publicaciones {FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}.
        </Text>
      ) : null}

      <FlatList
        data={visibleLots}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={load}
        renderItem={({ item }) => {
          const status = getListingStatus(item);
          const note =
            (status === 'rejected' || status === 'changes_requested') && item.rejectionReason
              ? item.rejectionReason
              : null;
          return (
            <ParkingCard
              name={item.name}
              address={item.address}
              pricePerHour={item.pricePerHour}
              ratingAvg={item.ratingAvg}
              status={status}
              note={note}
              imageUrl={coverImages[item.id]}
              onPress={() => router.push({ pathname: '/(owner)/parkings/[id]/edit', params: { id: item.id } })}
            />
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    marginBottom: spacing.lg,
  },
  filterRow: {
    marginBottom: spacing.lg,
  },
  emptyFilter: {
    marginTop: spacing.md,
  },
});
