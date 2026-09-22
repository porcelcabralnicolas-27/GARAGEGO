import type { AvailabilityException, RecurringAvailability } from '@/features/parking/types';

import type { BookedInterval } from '../api';
import {
  generateEndTimeOptions,
  generateStartTimeOptions,
  getConfiguredWindowsForDate,
  getFreeWindowsForDate,
  listAvailableDates,
  toDateString,
} from '../availability';

// 2026-09-21 es un LUNES (dayOfWeek = 1). Las fechas de los tests se eligen a partir de ahí
// para que el día de la semana sea explícito y no dependa de cuándo se corran.
const MONDAY = '2026-09-21';
const TUESDAY = '2026-09-22';

function recurring(dayOfWeek: number, startTime: string, endTime: string): RecurringAvailability {
  return { id: `${dayOfWeek}-${startTime}`, dayOfWeek, startTime, endTime };
}

function exception(
  date: string,
  isAvailable: boolean,
  startTime: string | null = null,
  endTime: string | null = null
): AvailabilityException {
  return { id: date, date, isAvailable, startTime, endTime };
}

function booked(date: string, startTime: string, endTime: string): BookedInterval {
  return { date, startTime, endTime };
}

/** Un momento del día anterior a todas las fechas de prueba: no recorta ninguna ventana. */
const BEFORE_ALL = new Date('2026-09-20T08:00:00');

describe('getConfiguredWindowsForDate', () => {
  it('usa la franja recurrente del día de la semana', () => {
    const windows = getConfiguredWindowsForDate(MONDAY, [recurring(1, '08:00', '20:00')], []);
    expect(windows).toEqual([{ start: '08:00', end: '20:00' }]);
  });

  it('ignora las franjas de otros días de la semana', () => {
    const windows = getConfiguredWindowsForDate(MONDAY, [recurring(2, '08:00', '20:00')], []);
    expect(windows).toEqual([]);
  });

  it('una excepción cerrada tapa la franja recurrente', () => {
    const windows = getConfiguredWindowsForDate(MONDAY, [recurring(1, '08:00', '20:00')], [exception(MONDAY, false)]);
    expect(windows).toEqual([]);
  });

  it('una excepción con horario reemplaza a la franja recurrente', () => {
    const windows = getConfiguredWindowsForDate(
      MONDAY,
      [recurring(1, '08:00', '20:00')],
      [exception(MONDAY, true, '10:00', '12:00')]
    );
    expect(windows).toEqual([{ start: '10:00', end: '12:00' }]);
  });

  it('una excepción de otra fecha no afecta al día consultado', () => {
    const windows = getConfiguredWindowsForDate(MONDAY, [recurring(1, '08:00', '20:00')], [exception(TUESDAY, false)]);
    expect(windows).toEqual([{ start: '08:00', end: '20:00' }]);
  });
});

describe('getFreeWindowsForDate', () => {
  const openAllMonday = [recurring(1, '08:00', '20:00')];

  it('sin reservas devuelve la ventana completa', () => {
    expect(getFreeWindowsForDate(MONDAY, openAllMonday, [], [], BEFORE_ALL)).toEqual([
      { start: '08:00', end: '20:00' },
    ]);
  });

  it('parte la ventana en dos alrededor de una reserva, dejando 15 min de margen a cada lado', () => {
    // El buffer tiene que coincidir con `_assert_slot_bookable` (migración 0048): si la app
    // ofreciera 12:00 o 14:00 pegados, el servidor rechazaría la reserva con buffer_conflict.
    expect(getFreeWindowsForDate(MONDAY, openAllMonday, [], [booked(MONDAY, '12:00', '14:00')], BEFORE_ALL)).toEqual([
      { start: '08:00', end: '11:45' },
      { start: '14:15', end: '20:00' },
    ]);
  });

  it('ignora las reservas de otras fechas', () => {
    expect(getFreeWindowsForDate(MONDAY, openAllMonday, [], [booked(TUESDAY, '12:00', '14:00')], BEFORE_ALL)).toEqual([
      { start: '08:00', end: '20:00' },
    ]);
  });

  it('descarta un día que ya pasó', () => {
    const laterThanMonday = new Date('2026-09-23T10:00:00');
    expect(getFreeWindowsForDate(MONDAY, openAllMonday, [], [], laterThanMonday)).toEqual([]);
  });

  it('recorta lo que ya pasó de hoy y redondea al próximo bloque de 30 min', () => {
    const monday1010 = new Date('2026-09-21T10:10:00');
    expect(getFreeWindowsForDate(MONDAY, openAllMonday, [], [], monday1010)).toEqual([
      { start: '10:30', end: '20:00' },
    ]);
  });

  it('descarta lo que queda de hoy si no entra la duración mínima', () => {
    const monday1950 = new Date('2026-09-21T19:50:00');
    expect(getFreeWindowsForDate(MONDAY, openAllMonday, [], [], monday1950)).toEqual([]);
  });
});

describe('listAvailableDates', () => {
  it('devuelve solo los días con alguna ventana libre', () => {
    const monday0700 = new Date('2026-09-21T07:00:00');
    // Abre lunes y martes; el martes está reservado de punta a punta.
    const dates = listAvailableDates(
      [recurring(1, '08:00', '20:00'), recurring(2, '08:00', '20:00')],
      [],
      [booked(TUESDAY, '08:00', '20:00')],
      3,
      monday0700
    );
    expect(dates).toEqual([MONDAY]);
  });
});

describe('generateStartTimeOptions', () => {
  it('avanza de a 30 min y deja lugar para la duración mínima', () => {
    expect(generateStartTimeOptions([{ start: '10:00', end: '11:30' }])).toEqual(['10:00', '10:30', '11:00']);
  });

  it('no duplica horarios cuando dos ventanas se tocan', () => {
    const options = generateStartTimeOptions([
      { start: '10:00', end: '11:00' },
      { start: '10:00', end: '12:00' },
    ]);
    expect(options).toEqual(['10:00', '10:30', '11:00', '11:30']);
  });
});

describe('generateEndTimeOptions', () => {
  it('ofrece múltiplos de 30 min hasta el fin de la ventana del inicio elegido', () => {
    expect(generateEndTimeOptions([{ start: '10:00', end: '12:00' }], '10:30')).toEqual(['11:00', '11:30', '12:00']);
  });

  it('devuelve vacío si el inicio no cae en ninguna ventana', () => {
    expect(generateEndTimeOptions([{ start: '10:00', end: '12:00' }], '14:00')).toEqual([]);
  });
});

describe('toDateString', () => {
  it('usa la fecha local y no el día UTC', () => {
    // 21:00 en Argentina (UTC-3) ya es el día siguiente en UTC: toDateString tiene que
    // devolver igual el día local, porque es el que ve el usuario en el calendario.
    expect(toDateString(new Date(2026, 8, 21, 21, 0, 0))).toBe('2026-09-21');
  });
});
