import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import {
  addAvailabilityException,
  addRecurringAvailability,
  getAvailabilityExceptions,
  getRecurringAvailability,
  removeAvailabilityException,
  removeRecurringAvailability,
} from '@/features/parking/api';
import { DAY_LABELS, type AvailabilityException, type RecurringAvailability } from '@/features/parking/types';
import { useTheme } from '@/theme';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function DayChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.dayChip,
        { borderColor: colors.outline, backgroundColor: selected ? colors.primary : 'transparent' },
      ]}
    >
      <Text style={[typography.label, { color: selected ? colors.onPrimary : colors.onSurfaceVariant }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function AvailabilityEditor({ parkingLotId }: { parkingLotId: string }) {
  const { colors, typography } = useTheme();
  const [recurring, setRecurring] = useState<RecurringAvailability[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState(1);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [recurringError, setRecurringError] = useState<string | null>(null);

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
    if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
      setRecurringError('Usa el formato HH:MM (ej. 08:00).');
      return;
    }
    if (startTime >= endTime) {
      setRecurringError('La hora de inicio debe ser menor a la de fin.');
      return;
    }
    try {
      const entry = await addRecurringAvailability(parkingLotId, {
        dayOfWeek: selectedDay,
        startTime,
        endTime,
      });
      setRecurring((prev) => [...prev, entry].sort((a, b) => a.dayOfWeek - b.dayOfWeek));
      setStartTime('');
      setEndTime('');
    } catch {
      setRecurringError('No se pudo agregar el horario.');
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
      if (!TIME_REGEX.test(exceptionStart) || !TIME_REGEX.test(exceptionEnd) || exceptionStart >= exceptionEnd) {
        setExceptionError('Ingresa un horario válido (HH:MM) con inicio menor a fin.');
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

      <View style={styles.dayRow}>
        {DAY_LABELS.map((label, index) => (
          <DayChip key={label} label={label.slice(0, 2)} selected={selectedDay === index} onPress={() => setSelectedDay(index)} />
        ))}
      </View>

      <View style={styles.timeRow}>
        <View style={styles.timeField}>
          <TextField label="Inicio (HH:MM)" placeholder="08:00" value={startTime} onChangeText={setStartTime} />
        </View>
        <View style={styles.timeField}>
          <TextField label="Fin (HH:MM)" placeholder="18:00" value={endTime} onChangeText={setEndTime} />
        </View>
      </View>

      {recurringError ? <Banner message={recurringError} /> : null}
      <Button label="Agregar horario" variant="outlined" onPress={handleAddRecurring} />

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
            <TextField label="Inicio (HH:MM)" placeholder="09:00" value={exceptionStart} onChangeText={setExceptionStart} />
          </View>
          <View style={styles.timeField}>
            <TextField label="Fin (HH:MM)" placeholder="14:00" value={exceptionEnd} onChangeText={setExceptionEnd} />
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
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
  },
  dayChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
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
