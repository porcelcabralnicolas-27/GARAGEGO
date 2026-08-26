import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
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
import { useTheme } from '@/theme';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DAY_OPTIONS = DAY_LABELS.map((label, index) => ({ value: String(index), label: label.slice(0, 2) }));

/** ¿Se superponen [aStart,aEnd) y [bStart,bEnd)? Las horas son strings "HH:MM", comparables como texto. */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function AvailabilityEditor({ parkingLotId }: { parkingLotId: string }) {
  const { colors, typography } = useTheme();
  const [recurring, setRecurring] = useState<RecurringAvailability[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedDays, setSelectedDays] = useState<string[]>(['1']);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);

  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionMode, setExceptionMode] = useState<'blocked' | 'special'>('blocked');
  const [exceptionStart, setExceptionStart] = useState('');
  const [exceptionEnd, setExceptionEnd] = useState('');
  const [exceptionError, setExceptionError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getRecurringAvailability(parkingLotId), getAvailabilityExceptions(parkingLotId)])
      .then(([r, e]) => {
        setRecurring(r);
        setExceptions(e);
      })
      .catch(() => setErrorMessage('No se pudo cargar la disponibilidad.'));
  }, [parkingLotId]);

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
      setRecurring((prev) => [...prev, ...entries].sort((a, b) => a.dayOfWeek - b.dayOfWeek));
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
      setRecurring((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setRecurringError('No se pudo eliminar el horario.');
    }
  };

  const handleAddException = async () => {
    setExceptionError(null);
    if (!DATE_REGEX.test(exceptionDate)) {
      setExceptionError('Usa el formato YYYY-MM-DD.');
      return;
    }
    if (exceptionMode === 'special') {
      if (!exceptionStart || !exceptionEnd || exceptionStart >= exceptionEnd) {
        setExceptionError('Elegí un horario válido, con inicio menor a fin.');
        return;
      }
    }
    try {
      const entry = await addAvailabilityException(parkingLotId, {
        date: exceptionDate,
        startTime: exceptionMode === 'special' ? exceptionStart : null,
        endTime: exceptionMode === 'special' ? exceptionEnd : null,
        isAvailable: exceptionMode === 'special',
      });
      setExceptions((prev) => [...prev, entry].sort((a, b) => a.date.localeCompare(b.date)));
      setExceptionDate('');
      setExceptionStart('');
      setExceptionEnd('');
    } catch {
      setExceptionError('No se pudo agregar la excepción.');
    }
  };

  const handleRemoveException = async (id: string) => {
    try {
      await removeAvailabilityException(id);
      setExceptions((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setExceptionError('No se pudo eliminar la excepción.');
    }
  };

  return (
    <View>
      {errorMessage ? <Banner message={errorMessage} /> : null}

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
        Bloquea un día puntual o abre un horario especial fuera de lo recurrente.
      </Text>

      {exceptions.map((entry) => (
        <View key={entry.id} style={[styles.entryRow, { borderColor: colors.outline }]}>
          <Text style={[typography.bodyLarge, { color: colors.onSurface }]}>
            {entry.date} ·{' '}
            {entry.isAvailable && entry.startTime && entry.endTime
              ? `${entry.startTime.slice(0, 5)} - ${entry.endTime.slice(0, 5)}`
              : 'Bloqueado'}
          </Text>
          <Pressable onPress={() => handleRemoveException(entry.id)}>
            <Ionicons name="trash" size={18} color={colors.error} />
          </Pressable>
        </View>
      ))}

      <TextField label="Fecha (YYYY-MM-DD)" placeholder="2026-08-20" value={exceptionDate} onChangeText={setExceptionDate} />

      <SegmentedControl
        value={exceptionMode}
        onChange={setExceptionMode}
        options={[
          { value: 'blocked', label: 'Bloquear día' },
          { value: 'special', label: 'Horario especial' },
        ]}
      />

      <View style={styles.sectionSpacerSmall} />

      {exceptionMode === 'special' ? (
        <View style={styles.timeRow}>
          <View style={styles.timeField}>
            <TimeSelect label="Inicio" value={exceptionStart} onChange={setExceptionStart} />
          </View>
          <View style={styles.timeField}>
            <TimeSelect label="Fin" value={exceptionEnd} onChange={setExceptionEnd} />
          </View>
        </View>
      ) : null}

      {exceptionError ? <Banner message={exceptionError} /> : null}
      <Button label="Agregar excepción" variant="outlined" onPress={handleAddException} />
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
