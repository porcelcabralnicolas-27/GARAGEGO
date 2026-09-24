import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BusinessTimeNote } from '@/components/booking/BusinessTimeNote';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { getBookedIntervals, type BookedInterval } from '@/features/booking/api';
import {
  generateEndTimeOptions,
  generateStartTimeOptions,
  getFreeWindowsForDate,
  listAvailableDates,
} from '@/features/booking/availability';
import { computeBookingPrice } from '@/features/booking/pricing';
import { getParkingLot, getAvailabilityExceptions, getRecurringAvailability } from '@/features/parking/api';
import type { AvailabilityException, ParkingLot, RecurringAvailability } from '@/features/parking/types';
import { listMyVehicles } from '@/features/vehicle/api';
import { formatMoney, formatPricePerHour } from '@/lib/money';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { businessDate, formatCalendarDayShort } from '@/lib/time';
import { useTheme } from '@/theme';

type AvailabilityData = {
  lot: ParkingLot;
  recurring: RecurringAvailability[];
  exceptions: AvailabilityException[];
  booked: BookedInterval[];
};

export default function BookingScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { parkingId } = useLocalSearchParams<{ parkingId: string }>();
  const profile = useAuthStore((s) => s.profile);
  const walletBalance = useAuthStore((s) => s.walletBalance);

  const { data: availability, isError: loadError } = useQuery({
    queryKey: queryKeys.parkingLots.bookingAvailability(parkingId),
    queryFn: async (): Promise<AvailabilityData> => {
      const [lot, recurring, exceptions, booked] = await Promise.all([
        getParkingLot(parkingId),
        getRecurringAvailability(parkingId),
        getAvailabilityExceptions(parkingId),
        getBookedIntervals(parkingId, businessDate()),
      ]);
      return { lot, recurring, exceptions, booked };
    },
    // Los horarios ocupados cambian con cada reserva de cualquier conductor: siempre frescos.
    staleTime: 0,
  });
  const { lot = null, recurring = [], exceptions = [], booked = [] } = availability ?? {};

  const { data: vehicles = [] } = useQuery({
    queryKey: queryKeys.vehicles.list(profile?.id ?? ''),
    queryFn: () => listMyVehicles(profile?.id as string),
    enabled: Boolean(profile),
  });

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (vehicles.length === 1 && selectedVehicleId === null) setSelectedVehicleId(vehicles[0].id);
  }, [vehicles, selectedVehicleId]);

  const availableDates = useMemo(
    () => listAvailableDates(recurring, exceptions, booked, 30),
    [recurring, exceptions, booked]
  );

  useEffect(() => {
    if (availableDates.length > 0 && selectedDate === null) setSelectedDate(availableDates[0]);
  }, [availableDates, selectedDate]);

  const windowsForDate = useMemo(
    () => (selectedDate ? getFreeWindowsForDate(selectedDate, recurring, exceptions, booked) : []),
    [selectedDate, recurring, exceptions, booked]
  );
  const startOptions = useMemo(() => generateStartTimeOptions(windowsForDate), [windowsForDate]);
  const endOptions = useMemo(
    () => (selectedStart ? generateEndTimeOptions(windowsForDate, selectedStart) : []),
    [windowsForDate, selectedStart]
  );

  const estimatedPrice =
    lot && selectedStart && selectedEnd ? computeBookingPrice(lot.pricePerHour, selectedStart, selectedEnd) : null;

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedStart(null);
    setSelectedEnd(null);
  };

  const handleSelectStart = (time: string) => {
    setSelectedStart(time);
    setSelectedEnd(null);
  };

  // La reserva ya no se crea acá: este paso solo junta los datos y los pasa a la pantalla de
  // pago, que es la que llama `create_booking` (y con eso cobra). Ver el documento de decisión
  // de la Fase 8, Q4·A.
  const onContinue = () => {
    if (!selectedDate || !selectedStart || !selectedEnd) {
      setErrorMessage('Elegí fecha, hora de inicio y hora de fin.');
      return;
    }
    if (!selectedVehicleId) {
      setErrorMessage('Elegí el vehículo con el que vas a llegar.');
      return;
    }
    setErrorMessage(null);
    router.push({
      pathname: '/(client)/search/booking/[parkingId]/payment',
      params: {
        parkingId,
        date: selectedDate,
        startTime: selectedStart,
        endTime: selectedEnd,
        vehicleId: selectedVehicleId,
      },
    });
  };

  if (loadError) {
    return (
      <Screen>
        <ScreenHeader
          title="Reservar"
          backHref={{ pathname: '/(client)/search/parking/[id]', params: { id: parkingId } }}
        />
        <Banner message="No se pudo cargar la disponibilidad de este estacionamiento." />
      </Screen>
    );
  }

  if (!lot) {
    return (
      <Screen>
        <ScreenHeader
          title="Reservar"
          backHref={{ pathname: '/(client)/search/parking/[id]', params: { id: parkingId } }}
        />
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title="Reservar"
          backHref={{ pathname: '/(client)/search/parking/[id]', params: { id: parkingId } }}
        />

        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginTop: 8, marginBottom: 20 }]}>
          {lot.name} · {formatPricePerHour(lot.pricePerHour)}
        </Text>

        {errorMessage ? <Banner message={errorMessage} /> : null}

        <BusinessTimeNote />

        {availableDates.length === 0 ? (
          <Banner message="Este estacionamiento no tiene horarios disponibles en los próximos 30 días." />
        ) : (
          <>
            <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>Fecha</Text>
            <ChipSelect
              options={availableDates.map((d) => ({ value: d, label: formatCalendarDayShort(d) }))}
              value={selectedDate ?? ''}
              onChange={handleSelectDate}
            />

            <View style={styles.spacer} />

            <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>Hora de inicio</Text>
            {startOptions.length === 0 ? (
              <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
                No hay horarios disponibles ese día.
              </Text>
            ) : (
              <ChipSelect
                options={startOptions.map((t) => ({ value: t, label: t }))}
                value={selectedStart ?? ''}
                onChange={handleSelectStart}
              />
            )}

            {selectedStart ? (
              <>
                <View style={styles.spacer} />
                <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>Hora de fin</Text>
                <ChipSelect
                  options={endOptions.map((t) => ({ value: t, label: t }))}
                  value={selectedEnd ?? ''}
                  onChange={setSelectedEnd}
                />
              </>
            ) : null}
          </>
        )}

        <View style={styles.spacer} />

        <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>Tu vehículo</Text>
        {vehicles.length === 0 ? (
          <>
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>
              Todavía no cargaste ningún vehículo.
            </Text>
            <Button
              label="+ Agregar vehículo"
              variant="outlined"
              size="compact"
              onPress={() => router.push('/(client)/vehicles/create')}
            />
          </>
        ) : (
          <ChipSelect
            options={vehicles.map((v) => ({
              value: v.id,
              label: [v.plate, v.brand].filter(Boolean).join(' · '),
            }))}
            value={selectedVehicleId ?? ''}
            onChange={setSelectedVehicleId}
          />
        )}

        <View style={styles.spacer} />

        <View style={[styles.summaryCard, { backgroundColor: colors.primaryContainer }]}>
          <Text style={[typography.label, { color: colors.onPrimaryContainer }]}>Total estimado</Text>
          <Text style={[typography.displayLarge, { color: colors.onPrimaryContainer }]}>
            {estimatedPrice !== null ? formatMoney(estimatedPrice) : '—'}
          </Text>
          <Text style={[typography.label, { color: colors.onPrimaryContainer, marginTop: 4 }]}>
            Tu saldo: {walletBalance !== null ? formatMoney(walletBalance) : '—'}
          </Text>
        </View>

        <View style={styles.spacer} />

        <Button
          label="Continuar al pago"
          onPress={onContinue}
          disabled={!selectedDate || !selectedStart || !selectedEnd || !selectedVehicleId}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    borderRadius: 16,
    padding: 16,
  },
  spacer: {
    height: 16,
  },
});
