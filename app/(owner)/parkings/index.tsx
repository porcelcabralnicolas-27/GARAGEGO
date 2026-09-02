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
import type { ParkingLot } from '@/features/parking/types';
import { useAuthStore } from '@/store/useAuthStore';
import { spacing, useTheme } from '@/theme';

type Filter = 'all' | 'active' | 'paused';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'paused', label: 'Pausadas' },
];

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
    if (filter === 'active') return lots.filter((lot) => lot.isActive);
    if (filter === 'paused') return lots.filter((lot) => !lot.isActive);
    return lots;
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
        Gestioná tus anuncios activos y pausados.
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
          No tenés publicaciones {filter === 'active' ? 'activas' : 'pausadas'}.
        </Text>
      ) : null}

      <FlatList
        data={visibleLots}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={load}
        renderItem={({ item }) => (
          <ParkingCard
            name={item.name}
            address={item.address}
            pricePerHour={item.pricePerHour}
            ratingAvg={item.ratingAvg}
            isActive={item.isActive}
            imageUrl={coverImages[item.id]}
            onPress={() => router.push({ pathname: '/(owner)/parkings/[id]/edit', params: { id: item.id } })}
          />
        )}
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
