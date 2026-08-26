import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Text } from 'react-native';

import { BookingCard } from '@/components/booking/BookingCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import { cancelBooking, getBookingErrorMessage, listMyBookings, startBooking } from '@/features/booking/api';
import type { ClientBookingItem } from '@/features/booking/types';
import { RateBookingDialog } from '@/features/rating/RateBookingDialog';
import { listMyRatedBookingIds } from '@/features/rating/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

/** Ventana mínima de antelación para que el cliente pueda cancelar una reserva ya aprobada. */
const CANCEL_LOCK_MS = 60 * 60 * 1000;

/**
 * Una reserva confirmada ya no se puede cancelar cuando falta menos de una hora para el inicio.
 * Las pendientes de aprobación se pueden cancelar siempre. La regla real la impone la RPC
 * cancel_booking; esto es solo para avisar antes de que el usuario intente.
 */
function isCancelLocked(booking: ClientBookingItem, now: Date): boolean {
  if (booking.status !== 'confirmed') return false;
  const startsAt = new Date(`${booking.date}T${booking.startTime}`);
  return startsAt.getTime() - now.getTime() < CANCEL_LOCK_MS;
}

export default function MyBookingsScreen() {
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);

  const [bookings, setBookings] = useState<ClientBookingItem[]>([]);
  const [ratedBookingIds, setRatedBookingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ClientBookingItem | null>(null);
  const [lockedCancelTarget, setLockedCancelTarget] = useState<ClientBookingItem | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [rateTarget, setRateTarget] = useState<ClientBookingItem | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    Promise.all([listMyBookings(profile.id), listMyRatedBookingIds(profile.id)])
      .then(([bookingsResult, ratedIds]) => {
        setBookings(bookingsResult);
        setRatedBookingIds(ratedIds);
      })
      .catch(() => setErrorMessage('No se pudieron cargar tus reservas.'))
      .finally(() => setIsLoading(false));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleStart = async (booking: ClientBookingItem) => {
    setStartingId(booking.id);
    setErrorMessage(null);
    try {
      await startBooking(booking.id);
      load();
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
    } finally {
      setStartingId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      await cancelBooking(cancelTarget.id);
      setCancelTarget(null);
      reloadProfile();
      load();
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
      setCancelTarget(null);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Screen>
      <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 16 }]}>Mis reservas</Text>

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && bookings.length === 0 && !errorMessage ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          Todavía no hiciste ninguna reserva.
        </Text>
      ) : null}

      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={load}
        renderItem={({ item }) => {
          const canCancel = item.status === 'pending' || item.status === 'confirmed';
          const canStart = item.status === 'confirmed' && !item.actualStartAt;
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
              actions={
                canStart || canCancel || canRate ? (
                  <>
                    {canStart ? (
                      <Button
                        label="Iniciar"
                        size="compact"
                        onPress={() => handleStart(item)}
                        loading={startingId === item.id}
                        disabled={startingId !== null}
                      />
                    ) : null}
                    {canCancel ? (
                      <Button
                        label="Cancelar"
                        size="compact"
                        variant="outlined"
                        // El botón sigue visible aunque ya no se pueda cancelar: al tocarlo
                        // aparece el cartel que explica por qué, en vez de un botón muerto.
                        onPress={() =>
                          isCancelLocked(item, new Date()) ? setLockedCancelTarget(item) : setCancelTarget(item)
                        }
                        disabled={startingId !== null}
                      />
                    ) : null}
                    {canRate ? <Button label="Calificar" size="compact" onPress={() => setRateTarget(item)} /> : null}
                  </>
                ) : undefined
              }
            />
          );
        }}
      />

      <ConfirmDialog
        visible={cancelTarget !== null}
        title="Cancelar reserva"
        message={
          cancelTarget?.status === 'confirmed'
            ? '¿Seguro que querés cancelar esta reserva? El monto pagado se te reintegrará a tu saldo. Tené en cuenta que vas a poder cancelarla hasta 1 hora antes del inicio.'
            : '¿Seguro que querés cancelar esta reserva? El monto pagado se te reintegrará a tu saldo.'
        }
        confirmLabel="Cancelar reserva"
        cancelLabel="Volver"
        loading={isCancelling}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        visible={lockedCancelTarget !== null}
        title="Ya no se puede cancelar"
        message="Falta menos de 1 hora para que empiece esta reserva, así que ya no se puede cancelar. Si no vas a poder ir, escribile al propietario por el chat."
        confirmLabel="Entendido"
        hideCancel
        onConfirm={() => setLockedCancelTarget(null)}
        onCancel={() => setLockedCancelTarget(null)}
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
            load();
          }}
        />
      ) : null}
    </Screen>
  );
}
