import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList } from 'react-native';

import { BookingCard } from '@/components/booking/BookingCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadMoreFooter } from '@/components/ui/LoadMoreFooter';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { hideBooking, listOwnerBookingsPage } from '@/features/booking/api';
import type { BookingCursor, OwnerBookingItem } from '@/features/booking/types';
import { flattenPages, type Page } from '@/lib/pagination';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Historial del propietario: las reservas de sus cocheras que ya terminaron (finalizadas y
 * canceladas), de la más reciente a la más vieja, de a una página. La pantalla de "Reservas
 * recibidas" queda solo con las que están en curso o por venir.
 *
 * Es una lista cronológica y no dos secciones (finalizadas / canceladas) porque se pagina: con
 * secciones, cada página nueva agregaría reservas en las dos, arriba de donde está mirando el
 * usuario. El estado de cada una lo muestra la tarjeta.
 *
 * El "Borrar" oculta la reserva solo para él: el conductor la sigue viendo en su propio
 * historial y no se toca ningún registro de plata. Ver la migración 0031.
 */
type HistoryPages = InfiniteData<Page<OwnerBookingItem, BookingCursor>, BookingCursor | null>;

export default function OwnerBookingHistoryScreen() {
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const userId = profile?.id;

  const [deleteTarget, setDeleteTarget] = useState<OwnerBookingItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const queryKey = queryKeys.bookings.receivedHistory(userId ?? '');
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => listOwnerBookingsPage('history', pageParam),
    initialPageParam: null as BookingCursor | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: Boolean(userId),
  });
  const bookings = flattenPages(data);

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch])
  );

  const hide = useMutation({
    mutationFn: (booking: OwnerBookingItem) => hideBooking(booking.id, userId as string),
    onSuccess: (_void, booking) => {
      // Se saca de la página en cache en vez de recargar todas las páginas cargadas.
      queryClient.setQueryData<HistoryPages>(queryKey, (current) =>
        current
          ? { ...current, pages: current.pages.map((p) => ({ ...p, items: p.items.filter((b) => b.id !== booking.id) })) }
          : current
      );
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

      {!isLoading && bookings.length === 0 && !visibleError ? (
        <EmptyState
          icon="time-outline"
          title="Tu historial está vacío"
          description="Acá van a quedar las reservas finalizadas y canceladas de tus estacionamientos."
        />
      ) : null}

      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={() => {
          setErrorMessage(null);
          refetch();
        }}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={<LoadMoreFooter isFetching={isFetchingNextPage} />}
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
