import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Text } from 'react-native';

import { BookingCard } from '@/components/booking/BookingCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import {
  cancelBooking,
  completeBooking,
  confirmBooking,
  getBookingErrorMessage,
  listReceivedBookings,
} from '@/features/booking/api';
import type { OwnerBookingItem } from '@/features/booking/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function OwnerBookingsScreen() {
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);

  const [bookings, setBookings] = useState<OwnerBookingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OwnerBookingItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    listReceivedBookings(profile.id)
      .then(setBookings)
      .catch(() => setErrorMessage('No se pudieron cargar las reservas.'))
      .finally(() => setIsLoading(false));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleConfirm = async (booking: OwnerBookingItem) => {
    setBusyId(booking.id);
    setErrorMessage(null);
    try {
      await confirmBooking(booking.id);
      load();
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async (booking: OwnerBookingItem) => {
    setBusyId(booking.id);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const { overtimeMinutes, overtimeCharge } = await completeBooking(booking.id);
      if (overtimeCharge > 0) {
        setInfoMessage(`El cliente se quedó ${overtimeMinutes} min de más. Se le cobraron $${overtimeCharge.toFixed(2)}.`);
      }
      reloadProfile();
      load();
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setBusyId(cancelTarget.id);
    try {
      await cancelBooking(cancelTarget.id);
      setCancelTarget(null);
      load();
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
      setCancelTarget(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen>
      <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 16 }]}>
        Reservas recibidas
      </Text>

      {errorMessage ? <Banner message={errorMessage} /> : null}
      {infoMessage ? <Banner message={infoMessage} variant="success" /> : null}

      {!isLoading && bookings.length === 0 && !errorMessage ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          Todavía no recibiste ninguna reserva.
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
              <>
                {item.status === 'pending' ? (
                  <Button
                    label="Confirmar"
                    size="compact"
                    onPress={() => handleConfirm(item)}
                    loading={busyId === item.id}
                    disabled={busyId !== null}
                  />
                ) : null}
                {item.status === 'confirmed' ? (
                  <Button
                    label="Finalizar"
                    size="compact"
                    onPress={() => handleComplete(item)}
                    loading={busyId === item.id}
                    disabled={busyId !== null}
                  />
                ) : null}
                {item.status === 'pending' || item.status === 'confirmed' ? (
                  <Button
                    label="Cancelar"
                    size="compact"
                    variant="outlined"
                    onPress={() => setCancelTarget(item)}
                    disabled={busyId !== null}
                  />
                ) : null}
              </>
            }
          />
        )}
      />

      <ConfirmDialog
        visible={cancelTarget !== null}
        title="Cancelar reserva"
        message="¿Seguro que querés cancelar esta reserva? Se reintegrará el monto al cliente."
        confirmLabel="Cancelar reserva"
        cancelLabel="Volver"
        loading={busyId === cancelTarget?.id}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </Screen>
  );
}
