import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCalendarDate, weekdayOf } from '@/lib/time';
import { radius, spacing, useTheme } from '@/theme';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAY_INITIALS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

type YearMonth = { year: number; month: number };

const pad = (n: number) => n.toString().padStart(2, '0');
const dateKey = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const daysInMonth = ({ year, month }: YearMonth) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const parseYearMonth = (date: string): YearMonth => {
  const [year, month] = date.split('-').map(Number);
  return { year, month };
};
const shiftMonth = ({ year, month }: YearMonth, delta: number): YearMonth => {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};
const monthIndex = ({ year, month }: YearMonth) => year * 12 + month;

type DateSelectProps = {
  label: string;
  /** Fecha elegida (YYYY-MM-DD) o '' si todavía no hay. */
  value: string;
  onChange: (value: string) => void;
  /** Primer día elegible (YYYY-MM-DD). Los anteriores se ven pero no se pueden tocar. */
  minDate: string;
  placeholder?: string;
};

/**
 * Selector de fecha con calendario: se ve como un campo y al tocarlo abre un mes navegable,
 * con el mismo patrón de modal que TimeSelect. Las fechas son de calendario (sin zona), así que
 * se arman como texto y nunca pasan por la hora del dispositivo.
 */
export function DateSelect({ label, value, onChange, minDate, placeholder = 'Elegir fecha' }: DateSelectProps) {
  const { colors, typography } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<YearMonth>(() => parseYearMonth(value || minDate));

  const open = () => {
    setVisibleMonth(parseYearMonth(value || minDate));
    setIsOpen(true);
  };

  const handleSelect = (date: string) => {
    onChange(date);
    setIsOpen(false);
  };

  const firstWeekday = weekdayOf(dateKey(visibleMonth.year, visibleMonth.month, 1));
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth(visibleMonth) }, (_, i) => i + 1),
  ];
  const canGoBack = monthIndex(visibleMonth) > monthIndex(parseYearMonth(minDate));

  return (
    <View>
      {label ? (
        <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>{label}</Text>
      ) : null}
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${formatCalendarDate(value)}` : label}
        style={[styles.field, { borderColor: colors.outline, backgroundColor: colors.surface }]}
      >
        <Text style={[typography.bodyLarge, { color: value ? colors.onSurface : colors.onSurfaceVariant }]}>
          {value ? formatCalendarDate(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={colors.onSurfaceVariant} />
      </Pressable>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setIsOpen(false)}>
          {/* Pressable propio para que tocar el card no cierre el modal. */}
          <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={styles.monthRow}>
              <Pressable
                onPress={() => setVisibleMonth((m) => shiftMonth(m, -1))}
                disabled={!canGoBack}
                accessibilityRole="button"
                accessibilityLabel="Mes anterior"
                hitSlop={8}
                style={{ opacity: canGoBack ? 1 : 0.3 }}
              >
                <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
              </Pressable>
              <Text style={[typography.titleMedium, { color: colors.onSurface }]}>
                {MONTH_NAMES[visibleMonth.month - 1]} {visibleMonth.year}
              </Text>
              <Pressable
                onPress={() => setVisibleMonth((m) => shiftMonth(m, 1))}
                accessibilityRole="button"
                accessibilityLabel="Mes siguiente"
                hitSlop={8}
              >
                <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
              </Pressable>
            </View>

            <View style={styles.grid}>
              {WEEKDAY_INITIALS.map((initial) => (
                <View key={initial} style={styles.cell}>
                  <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{initial}</Text>
                </View>
              ))}
              {cells.map((day, index) => {
                if (day === null) return <View key={`empty-${index}`} style={styles.cell} />;
                const date = dateKey(visibleMonth.year, visibleMonth.month, day);
                const disabled = date < minDate;
                const selected = date === value;
                return (
                  <Pressable
                    key={date}
                    onPress={() => handleSelect(date)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel={formatCalendarDate(date)}
                    accessibilityState={{ disabled, selected }}
                    style={[styles.cell, styles.day, selected ? { backgroundColor: colors.primary } : null]}
                  >
                    <Text
                      style={[
                        typography.bodyMedium,
                        {
                          color: selected ? colors.onPrimary : disabled ? colors.onSurfaceVariant : colors.onSurface,
                          opacity: disabled ? 0.4 : 1,
                        },
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: spacing.lg,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    borderRadius: radius.pill,
  },
});
