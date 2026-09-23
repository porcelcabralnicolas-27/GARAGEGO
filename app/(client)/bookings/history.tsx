import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text } from 'react-native';

import { BookingCard } from '@/components/booking/BookingCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { hideBooking, listHiddenBookingIds, listMyBookings } from '@/features/booking/api';
import type { ClientBookingItem } from '@/features/booking/types';
import { RateBookingDialog } from '@/features/rating/RateBookingDialog';
import { listMyRatedBookingIds } from '@/features/rating/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { spacing, useTheme } from '@/theme';

/**
 * Historial del conductor: lo que ya terminó. La pantalla de "Mis reservas" queda solo con la
 * sesión activa y los lugares reservados, que es sobre lo que se puede actuar.
 *
 * "Calificar" vive acá y no en la lista principal porque solo se puede calificar una reserva
 * finalizada, y las finalizadas ya no aparecen allá.
 */
const SECTION_DEFS = [
  { key: 'completed', title: 'Finalizadas', match: (b: ClientBookingItem) => b.status === 'completed' },
  { key: 'cancelled', title: 'Canceladas', match: (b: ClientBookingItem) => b.status === 'cancelled' },
] as const;

type HistoryData = {
  bookings: ClientBookingItem[];
  hiddenIds: Set<string>;
  ratedBookingIds: Set<string>;
};

const EMPTY_DATA: HistoryData = { bookings: [], hiddenIds: new Set(), ratedBookingIds: new Set() };

export default function ClientBookingHistoryScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const userId = profile?.id;

  const [deleteTarget, setDeleteTarget] = useState<ClientBookingItem | null>(null);
  const [rateTarget, setRateTarget] = useState<ClientBookingItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const queryKey = queryKeys.bookings.myHistory(userId ?? '');
  const {
    data: { bookings, hiddenIds, ratedBookingIds } = EMPTY_DATA,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<HistoryData> => {
      const [bookingsResult, hidden, ratedIds] = await Promise.all([
        listMyBookings(userId as string),
        listHiddenBookingIds(userId as string),
        listMyRatedBookingIds(userId as string),
      ]);
      return { bookings: bookingsResult, hiddenIds: hidden, ratedBookingIds: ratedIds };
    },
    enabled: Boolean(userId),
  });

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch])
  );

  const sections = useMemo(
    () =>
      SECTION_DEFS.map((def) => ({
        key: def.key,
        title: def.title,
        data: bookings.filter((b) => def.match(b) && !hiddenIds.has(b.id)),
      })).filter((section) => section.data.length > 0),
    [bookings, hiddenIds]
  );

  const hide = useMutation({
    mutationFn: (booking: ClientBookingItem) => hideBooking(booking.id, userId as string),
    onSuccess: (_void, booking) => {
      // Se agrega al set de ocultas en la cache en vez de recargar: el resultado es el mismo y
      // evita el parpadeo de toda la pantalla por borrar una fila.
      queryClient.setQueryData<HistoryData>(queryKey, (current = EMPTY_DATA) => ({
        ...current,
        hiddenIds: new Set(current.hiddenIds).add(booking.id),
      }));
      setDeleteTarget(null);
    },
    onError: () => {
      setErrorMessage('No se pudo borrar la reserva del historial.');
      setDeleteTarget(null);
    },
  });

  const visibleError = errorMessage ?? (isError ? 'No se pudo cargar tu historial.' : null);

  return (
    <Screen>
      <ScreenHeader title="Historial" backHref="/(client)/bookings" />

      {visibleError ? <Banner message={visibleError} /> : null}

      {!isLoading && sections.length === 0 && !visibleError ? (
        <EmptyState
          icon="time-outline"
          title="Tu historial está vacío"
          description="Acá van a quedar tus reservas finalizadas y canceladas."
        />
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={() => {
          setErrorMessage(null);
          refetch();
        }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={[typography.label, styles.sectionTitle, { color: colors.onSurfaceVariant }]}>
            {section.title.toUpperCase()}
          </Text>
        )}
        renderItem={({ item }) => {
          const canRate = item.status === 'completed' && !ratedBookingIds.has(item.id);
          return (
            <BookingCard
              title={item.parkingLotName}
              subtitle={item.parkingLotAddress}
              date={item.date}
              startTime={item.startTime}
              endTime={item.endTime}
              totalPrice={item.totalPrice}
              status={item.status}
              actualStartAt={item.actualStartAt}
              overtimeMinutes={item.overtimeMinutes}
              overtimeCharge={item.overtimeCharge}
              onPress={() => router.push({ pathname: '/(client)/bookings/[id]', params: { id: item.id } })}
              actions={
                <>
                  {canRate ? <Button label="Calificar" size="compact" onPress={() => setRateTarget(item)} /> : null}
                  <Button
                    label="Borrar"
                    size="compact"
                    variant="outlined"
                    onPress={() => setDeleteTarget(item)}
                  />
                </>
              }
            />
          );
        }}
      />

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Borrar del historial"
        message="Esta reserva se saca de tu historial y no la vas a ver más. No afecta al propietario, que la sigue viendo en el suyo."
        confirmLabel="Borrar"
        cancelLabel="Volver"
        loading={hide.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          setErrorMessage(null);
          hide.mutate(deleteTarget);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {rateTarget && profile ? (
        <RateBookingDialog
          visible={rateTarget !== null}
          bookingId={rateTarget.id}
          parkingLotId={rateTarget.parkingLotId}
          userId={profile.id}
          parkingLotName={rateTarget.parkingLotName}
          onClose={() => setRateTarget(null)}
          onSuccess={() => {
            setRateTarget(null);
            queryClient.invalidateQueries({ queryKey });
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
