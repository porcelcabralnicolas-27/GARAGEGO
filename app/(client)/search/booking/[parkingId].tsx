import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackHeader } from '@/components/ui/BackHeader';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Screen } from '@/components/ui/Screen';
import {
  getBookedIntervals,
  createBooking,
  getBookingErrorMessage,
  type BookedInterval,
} from '@/features/booking/api';
import {
  generateEndTimeOptions,
  generateStartTimeOptions,
  getFreeWindowsForDate,
  listAvailableDates,
  toDateString,
} from '@/features/booking/availability';
import { getParkingLot, getAvailabilityExceptions, getRecurringAvailability } from '@/features/parking/api';
import type { AvailabilityException, ParkingLot, RecurringAvailability } from '@/features/parking/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

const DAY_SHORT_LABELS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function formatDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = DAY_SHORT_LABELS[date.getDay()];
  const dd = date.getDate().toString().padStart(2, '0');
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day} ${dd}/${mm}`;
}

function computePrice(pricePerHour: number, startTime: string, endTime: string): number | null {
  if (!startTime || !endTime) return null;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const hours = (endH * 60 + endM - (startH * 60 + startM)) / 60;
  if (hours <= 0) return null;
  return Math.round(pricePerHour * hours * 100) / 100;
}

export default function BookingScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { parkingId } = useLocalSearchParams<{ parkingId: string }>();
  const walletBalance = useAuthStore((s) => s.walletBalance);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);

  const [lot, setLot] = useState<ParkingLot | null>(null);
  const [recurring, setRecurring] = useState<RecurringAvailability[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [booked, setBooked] = useState<BookedInterval[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    Promise.all([
      getParkingLot(parkingId),
      getRecurringAvailability(parkingId),
      getAvailabilityExceptions(parkingId),
      getBookedIntervals(parkingId, toDateString(new Date())),
    ])
      .then(([lotResult, recurringResult, exceptionsResult, bookedResult]) => {
        setLot(lotResult);
        setRecurring(recurringResult);
        setExceptions(exceptionsResult);
        setBooked(bookedResult);
      })
      .catch(() => setLoadError('No se pudo cargar la disponibilidad de este estacionamiento.'));
  }, [parkingId]);

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

  const estimatedPrice = lot && selectedStart && selectedEnd ? computePrice(lot.pricePerHour, selectedStart, selectedEnd) : null;

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedStart(null);
    setSelectedEnd(null);
  };

  const handleSelectStart = (time: string) => {
    setSelectedStart(time);
    setSelectedEnd(null);
  };

  const onSubmit = async () => {
    if (!selectedDate || !selectedStart || !selectedEnd) {
      setErrorMessage('Elegí fecha, hora de inicio y hora de fin.');
      return;
    }
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const bookingId = await createBooking({
        parkingLotId: parkingId,
        date: selectedDate,
        startTime: selectedStart,
        endTime: selectedEnd,
      });
      reloadProfile();
      router.replace({ pathname: '/(client)/bookings', params: { justCreated: bookingId } });
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <Screen>
        <BackHeader href={{ pathname: '/(client)/search/parking/[id]', params: { id: parkingId } }} />
        <Banner message={loadError} />
      </Screen>
    );
  }

  if (!lot) {
    return (
      <Screen>
        <BackHeader href={{ pathname: '/(client)/search/parking/[id]', params: { id: parkingId } }} />
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <BackHeader href={{ pathname: '/(client)/search/parking/[id]', params: { id: parkingId } }} />

        <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 4 }]}>Reservar</Text>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 20 }]}>
          {lot.name} · ${lot.pricePerHour.toFixed(2)}/hora
        </Text>

        {errorMessage ? <Banner message={errorMessage} /> : null}

        {availableDates.length === 0 ? (
          <Banner message="Este estacionamiento no tiene horarios disponibles en los próximos 30 días." />
        ) : (
          <>
            <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>Fecha</Text>
            <ChipSelect
              options={availableDates.map((d) => ({ value: d, label: formatDateLabel(d) }))}
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

        <View style={[styles.summaryCard, { backgroundColor: colors.primaryContainer }]}>
          <Text style={[typography.label, { color: colors.onPrimaryContainer }]}>Total estimado</Text>
          <Text style={[typography.displayLarge, { color: colors.onPrimaryContainer }]}>
            {estimatedPrice !== null ? `$${estimatedPrice.toFixed(2)}` : '—'}
          </Text>
          <Text style={[typography.label, { color: colors.onPrimaryContainer, marginTop: 4 }]}>
            Tu saldo: {walletBalance !== null ? `$${walletBalance.toFixed(2)}` : '—'}
          </Text>
        </View>

        <View style={styles.spacer} />

        <Button
          label="Confirmar reserva"
          onPress={onSubmit}
          loading={isSubmitting}
          disabled={isSubmitting || !selectedDate || !selectedStart || !selectedEnd}
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
