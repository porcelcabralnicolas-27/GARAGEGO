import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Text } from 'react-native';

import { BookingCard } from '@/components/booking/BookingCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import { cancelBooking, getBookingErrorMessage, listMyBookings } from '@/features/booking/api';
import type { ClientBookingItem } from '@/features/booking/types';
import { RateBookingDialog } from '@/features/rating/RateBookingDialog';
import { listMyRatedBookingIds } from '@/features/rating/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function MyBookingsScreen() {
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);

  const [bookings, setBookings] = useState<ClientBookingItem[]>([]);
  const [ratedBookingIds, setRatedBookingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ClientBookingItem | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [rateTarget, setRateTarget] = useState<ClientBookingItem | null>(null);

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
        renderItem={({ item }) => (
          <BookingCard
            title={item.parkingLotName}
            subtitle={item.parkingLotAddress}
            date={item.date}
            startTime={item.startTime}
            endTime={item.endTime}
            totalPrice={item.totalPrice}
            status={item.status}
            overtimeMinutes={item.overtimeMinutes}
            overtimeCharge={item.overtimeCharge}
            actions={
              item.status === 'pending' || item.status === 'confirmed' ? (
                <Button label="Cancelar" size="compact" variant="outlined" onPress={() => setCancelTarget(item)} />
              ) : item.status === 'completed' && !ratedBookingIds.has(item.id) ? (
                <Button label="Calificar" size="compact" onPress={() => setRateTarget(item)} />
              ) : undefined
            }
          />
        )}
      />

      <ConfirmDialog
        visible={cancelTarget !== null}
        title="Cancelar reserva"
        message="¿Seguro que querés cancelar esta reserva? El monto pagado se te reintegrará a tu saldo."
        confirmLabel="Cancelar reserva"
        cancelLabel="Volver"
        loading={isCancelling}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelTarget(null)}
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
