import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
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
import { hideBooking, listClientBookingsPage } from '@/features/booking/api';
import type { BookingCursor, ClientBookingItem } from '@/features/booking/types';
import { RateBookingDialog } from '@/features/rating/RateBookingDialog';
import { flattenPages, type Page } from '@/lib/pagination';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Historial del conductor: lo que ya terminó (finalizadas y canceladas), de la más reciente a la
 * más vieja, de a una página. La pantalla de "Mis reservas" queda solo con la sesión activa y
 * los lugares reservados, que es sobre lo que se puede actuar.
 *
 * Es una lista cronológica y no dos secciones porque se pagina (ver el historial del
 * propietario). "Calificar" vive acá y no en la lista principal porque solo se puede calificar
 * una reserva finalizada, y las finalizadas ya no aparecen allá.
 */
type HistoryPages = InfiniteData<Page<ClientBookingItem, BookingCursor>, BookingCursor | null>;

export default function ClientBookingHistoryScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const userId = profile?.id;

  const [deleteTarget, setDeleteTarget] = useState<ClientBookingItem | null>(null);
  const [rateTarget, setRateTarget] = useState<ClientBookingItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const queryKey = queryKeys.bookings.myHistory(userId ?? '');
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => listClientBookingsPage('history', pageParam),
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

  /** Aplica un cambio a las reservas ya cargadas, sin volver a pedir las páginas. */
  const updateCachedItems = (update: (items: ClientBookingItem[]) => ClientBookingItem[]) => {
    queryClient.setQueryData<HistoryPages>(queryKey, (current) =>
      current ? { ...current, pages: current.pages.map((p) => ({ ...p, items: update(p.items) })) } : current
    );
  };

  const hide = useMutation({
    mutationFn: (booking: ClientBookingItem) => hideBooking(booking.id, userId as string),
    onSuccess: (_void, booking) => {
      updateCachedItems((items) => items.filter((b) => b.id !== booking.id));
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

      {!isLoading && bookings.length === 0 && !visibleError ? (
        <EmptyState
          icon="time-outline"
          title="Tu historial está vacío"
          description="Acá van a quedar tus reservas finalizadas y canceladas."
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
        renderItem={({ item }) => {
          // Sin registro de entrada (no se presentó) no se califica: lo exige también la 0066.
          const canRate = item.status === 'completed' && item.actualStartAt !== null && !item.isRated;
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
            const ratedId = rateTarget.id;
            setRateTarget(null);
            updateCachedItems((items) => items.map((b) => (b.id === ratedId ? { ...b, isRated: true } : b)));
            // La ficha pública de la cochera muestra la reseña nueva.
            queryClient.invalidateQueries({ queryKey: queryKeys.parkingLots.all });
          }}
        />
      ) : null}
    </Screen>
  );
}
