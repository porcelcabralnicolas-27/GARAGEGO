import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { DateSelect } from '@/components/ui/DateSelect';
import { TimeSelect } from '@/components/ui/TimeSelect';
import {
  addAvailabilityException,
  addRecurringAvailabilityBulk,
  getAvailabilityExceptions,
  getParkingErrorMessage,
  getRecurringAvailability,
  removeAvailabilityException,
  removeRecurringAvailability,
} from '@/features/parking/api';
import { DAY_LABELS, type AvailabilityException, type RecurringAvailability } from '@/features/parking/types';
import { queryKeys } from '@/lib/queryKeys';
import { businessDate, formatCalendarDate } from '@/lib/time';
import { useTheme } from '@/theme';

type AvailabilityData = {
  recurring: RecurringAvailability[];
  exceptions: AvailabilityException[];
};

const EMPTY_DATA: AvailabilityData = { recurring: [], exceptions: [] };

const DAY_OPTIONS = DAY_LABELS.map((label, index) => ({ value: String(index), label: label.slice(0, 2) }));

/** ¿Se superponen [aStart,aEnd) y [bStart,bEnd)? Las horas son strings "HH:MM", comparables como texto. */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function AvailabilityEditor({ parkingLotId }: { parkingLotId: string }) {
  const { colors, typography } = useTheme();
  const queryClient = useQueryClient();

  const queryKey = queryKeys.parkingLots.availability(parkingLotId);
  const { data: { recurring, exceptions } = EMPTY_DATA, isError } = useQuery({
    queryKey,
    queryFn: async (): Promise<AvailabilityData> => {
      const [r, e] = await Promise.all([
        getRecurringAvailability(parkingLotId),
        getAvailabilityExceptions(parkingLotId),
      ]);
      return { recurring: r, exceptions: e };
    },
  });

  // La disponibilidad también la usan la ficha pública y la pantalla de reservar: se invalida
  // todo el grupo para que un conductor no vea horarios que el propietario ya cambió.
  const applyChange = (update: (current: AvailabilityData) => AvailabilityData) => {
    queryClient.setQueryData<AvailabilityData>(queryKey, (current = EMPTY_DATA) => update(current));
    queryClient.invalidateQueries({ queryKey: queryKeys.parkingLots.all });
  };

  const [selectedDays, setSelectedDays] = useState<string[]>(['1']);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);

  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionError, setExceptionError] = useState<string | null>(null);
  const [isAddingException, setIsAddingException] = useState(false);

  const handleAddRecurring = async () => {
    setRecurringError(null);
    if (selectedDays.length === 0) {
      setRecurringError('Elegí al menos un día.');
      return;
    }
    if (!startTime || !endTime) {
      setRecurringError('Elegí la hora de inicio y de fin.');
      return;
    }
    if (startTime >= endTime) {
      setRecurringError('La hora de inicio debe ser menor a la de fin.');
      return;
    }

    const days = selectedDays.map(Number);
    for (const day of days) {
      const conflict = recurring.find((r) => r.dayOfWeek === day && overlaps(startTime, endTime, r.startTime.slice(0, 5), r.endTime.slice(0, 5)));
      if (conflict) {
        setRecurringError(
          `${DAY_LABELS[day]} ya tiene un horario que se superpone: ${conflict.startTime.slice(0, 5)} - ${conflict.endTime.slice(0, 5)}.`
        );
        return;
      }
    }

    setIsAddingRecurring(true);
    try {
      const entries = await addRecurringAvailabilityBulk(
        parkingLotId,
        days.map((dayOfWeek) => ({ dayOfWeek, startTime, endTime }))
      );
      applyChange((current) => ({
        ...current,
        recurring: [...current.recurring, ...entries].sort((a, b) => a.dayOfWeek - b.dayOfWeek),
      }));
      setStartTime('');
      setEndTime('');
    } catch (error) {
      setRecurringError(getParkingErrorMessage(error));
    } finally {
      setIsAddingRecurring(false);
    }
  };

  const handleRemoveRecurring = async (id: string) => {
    try {
      await removeRecurringAvailability(id);
      applyChange((current) => ({ ...current, recurring: current.recurring.filter((r) => r.id !== id) }));
    } catch {
      setRecurringError('No se pudo eliminar el horario.');
    }
  };

  // Solo se bloquean días: el "horario especial" se sacó. Las excepciones especiales que ya
  // existían se siguen mostrando (y el servidor las sigue respetando) hasta que se borren.
  const handleAddException = async () => {
    setExceptionError(null);
    if (!exceptionDate) {
      setExceptionError('Elegí la fecha a bloquear.');
      return;
    }
    if (exceptions.some((e) => e.date === exceptionDate)) {
      setExceptionError(`El ${formatCalendarDate(exceptionDate)} ya tiene una excepción. Borrala si querés cambiarla.`);
      return;
    }
    setIsAddingException(true);
    try {
      const entry = await addAvailabilityException(parkingLotId, {
        date: exceptionDate,
        startTime: null,
        endTime: null,
        isAvailable: false,
      });
      applyChange((current) => ({
        ...current,
        exceptions: [...current.exceptions, entry].sort((a, b) => a.date.localeCompare(b.date)),
      }));
      setExceptionDate('');
    } catch {
      setExceptionError('No se pudo agregar la excepción.');
    } finally {
      setIsAddingException(false);
    }
  };

  const handleRemoveException = async (id: string) => {
    try {
      await removeAvailabilityException(id);
      applyChange((current) => ({ ...current, exceptions: current.exceptions.filter((e) => e.id !== id) }));
    } catch {
      setExceptionError('No se pudo eliminar la excepción.');
    }
  };

  return (
    <View>
      {isError ? <Banner message="No se pudo cargar la disponibilidad." /> : null}

      <Text style={[typography.titleMedium, { color: colors.onBackground, marginBottom: 8 }]}>
        Horario recurrente
      </Text>
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 12 }]}>
        Franjas que se repiten cada semana.
      </Text>

      {recurring.map((entry) => (
        <View key={entry.id} style={[styles.entryRow, { borderColor: colors.outline }]}>
          <Text style={[typography.bodyLarge, { color: colors.onSurface }]}>
            {DAY_LABELS[entry.dayOfWeek]} · {entry.startTime.slice(0, 5)} - {entry.endTime.slice(0, 5)}
          </Text>
          <Pressable onPress={() => handleRemoveRecurring(entry.id)}>
            <Ionicons name="trash" size={18} color={colors.error} />
          </Pressable>
        </View>
      ))}

      <Text style={[typography.label, { color: colors.onSurfaceVariant, marginTop: 12, marginBottom: 8 }]}>
        Días (podés elegir más de uno)
      </Text>
      <ChipSelect multiple options={DAY_OPTIONS} value={selectedDays} onChange={setSelectedDays} />

      <View style={styles.timeRow}>
        <View style={styles.timeField}>
          <TimeSelect label="Inicio" value={startTime} onChange={setStartTime} />
        </View>
        <View style={styles.timeField}>
          <TimeSelect label="Fin" value={endTime} onChange={setEndTime} />
        </View>
      </View>

      {recurringError ? <Banner message={recurringError} /> : null}
      <Button label="Agregar horario" variant="outlined" onPress={handleAddRecurring} loading={isAddingRecurring} />

      <View style={styles.sectionSpacer} />

      <Text style={[typography.titleMedium, { color: colors.onBackground, marginBottom: 8 }]}>
        Excepciones por fecha
      </Text>
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 12 }]}>
        Bloqueá un día puntual en el que la cochera no va a estar disponible.
      </Text>

      {exceptions.map((entry) => (
        <View key={entry.id} style={[styles.entryRow, { borderColor: colors.outline }]}>
          <Text style={[typography.bodyLarge, { color: colors.onSurface }]}>
            {formatCalendarDate(entry.date)} ·{' '}
            {entry.isAvailable && entry.startTime && entry.endTime
              ? `${entry.startTime.slice(0, 5)} - ${entry.endTime.slice(0, 5)}`
              : 'Bloqueado'}
          </Text>
          <Pressable onPress={() => handleRemoveException(entry.id)}>
            <Ionicons name="trash" size={18} color={colors.error} />
          </Pressable>
        </View>
      ))}

      <View style={styles.sectionSpacerSmall} />
      <DateSelect label="Fecha" value={exceptionDate} onChange={setExceptionDate} minDate={businessDate()} />
      <View style={styles.sectionSpacerSmall} />

      {exceptionError ? <Banner message={exceptionError} /> : null}
      <Button
        label="Bloquear día"
        variant="outlined"
        onPress={handleAddException}
        loading={isAddingException}
        disabled={isAddingException}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 12,
  },
  timeField: {
    flex: 1,
  },
  sectionSpacer: {
    height: 32,
  },
  sectionSpacerSmall: {
    height: 12,
  },
});
