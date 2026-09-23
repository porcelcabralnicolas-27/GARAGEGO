import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text } from 'react-native';

import { BookingCard } from '@/components/booking/BookingCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { hideBooking, listHiddenBookingIds, listReceivedBookings } from '@/features/booking/api';
import type { OwnerBookingItem } from '@/features/booking/types';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { spacing, useTheme } from '@/theme';

/**
 * Historial del propietario: las reservas de sus cocheras que ya terminaron. La pantalla de
 * "Reservas recibidas" queda solo con las que están en curso o por venir.
 *
 * El "Borrar" oculta la reserva solo para él: el conductor la sigue viendo en su propio
 * historial y no se toca ningún registro de plata. Ver la migración 0031.
 */
const SECTION_DEFS = [
  { key: 'done', title: 'Finalizadas', match: (b: OwnerBookingItem) => b.status === 'completed' },
  { key: 'cancelled', title: 'Canceladas', match: (b: OwnerBookingItem) => b.status === 'cancelled' },
] as const;

type HistoryData = { bookings: OwnerBookingItem[]; hiddenIds: Set<string> };

const EMPTY_DATA: HistoryData = { bookings: [], hiddenIds: new Set() };

export default function OwnerBookingHistoryScreen() {
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const userId = profile?.id;

  const [deleteTarget, setDeleteTarget] = useState<OwnerBookingItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const queryKey = queryKeys.bookings.receivedHistory(userId ?? '');
  const {
    data: { bookings, hiddenIds } = EMPTY_DATA,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<HistoryData> => {
      const [bookingsResult, hidden] = await Promise.all([
        listReceivedBookings(userId as string),
        listHiddenBookingIds(userId as string),
      ]);
      return { bookings: bookingsResult, hiddenIds: hidden };
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
    mutationFn: (booking: OwnerBookingItem) => hideBooking(booking.id, userId as string),
    onSuccess: (_void, booking) => {
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

  const visibleError = errorMessage ?? (isError ? 'No se pudo cargar el historial.' : null);

  return (
    <Screen>
      <ScreenHeader title="Historial" backHref="/(owner)/bookings" />

      {visibleError ? <Banner message={visibleError} /> : null}

      {!isLoading && sections.length === 0 && !visibleError ? (
        <EmptyState
          icon="time-outline"
          title="Tu historial está vacío"
          description="Acá van a quedar las reservas finalizadas y canceladas de tus estacionamientos."
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
        renderItem={({ item }) => (
          <BookingCard
            title={item.parkingLotName}
            subtitle={item.clientName}
            date={item.date}
            startTime={item.startTime}
            endTime={item.endTime}
            totalPrice={item.totalPrice}
            status={item.status}
            actualStartAt={item.actualStartAt}
            vehicleLabel={item.vehicle ? [item.vehicle.plate, item.vehicle.brand].filter(Boolean).join(' · ') : null}
            overtimeMinutes={item.overtimeMinutes}
            overtimeCharge={item.overtimeCharge}
            actions={
              <Button
                label="Borrar"
                size="compact"
                variant="outlined"
                onPress={() => setDeleteTarget(item)}
              />
            }
          />
        )}
      />

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Borrar del historial"
        message="Esta reserva se saca de tu historial y no la vas a ver más. No afecta al conductor, que la sigue viendo en el suyo."
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
