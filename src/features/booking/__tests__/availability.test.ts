import type { AvailabilityException, RecurringAvailability } from '@/features/parking/types';

import type { BookedInterval } from '../api';
import {
  generateEndTimeOptions,
  generateStartTimeOptions,
  getConfiguredWindowsForDate,
  getFreeWindowsForDate,
  listAvailableDates,
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

/**
 * Un instante dado en hora de Argentina. Se escribe con el offset explícito para que el test
 * signifique lo mismo en cualquier zona: `npm run test:tz` lo corre con el dispositivo en varias.
 */
function argentina(dateTime: string): Date {
  return new Date(`${dateTime}-03:00`);
}

/** Un momento del día anterior a todas las fechas de prueba: no recorta ninguna ventana. */
const BEFORE_ALL = argentina('2026-09-20T08:00:00');

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
    const laterThanMonday = argentina('2026-09-23T10:00:00');
    expect(getFreeWindowsForDate(MONDAY, openAllMonday, [], [], laterThanMonday)).toEqual([]);
  });

  it('recorta lo que ya pasó de hoy y redondea al próximo bloque de 30 min', () => {
    const monday1010 = argentina('2026-09-21T10:10:00');
    expect(getFreeWindowsForDate(MONDAY, openAllMonday, [], [], monday1010)).toEqual([
      { start: '10:30', end: '20:00' },
    ]);
  });

  it('descarta lo que queda de hoy si no entra la duración mínima', () => {
    const monday1950 = argentina('2026-09-21T19:50:00');
    expect(getFreeWindowsForDate(MONDAY, openAllMonday, [], [], monday1950)).toEqual([]);
  });

  it('"hoy" y "ahora" son los de la cochera aunque en UTC ya sea el día siguiente', () => {
    // 22:30 del lunes en Argentina = 01:30 del martes en UTC (y 10:30 del martes en Tokio).
    // Antes, un teléfono en otra zona recortaba con su propia hora y su propio día.
    const lateMonday = argentina('2026-09-21T22:30:00');
    const openLateMonday = [recurring(1, '08:00', '23:30')];
    expect(getFreeWindowsForDate(MONDAY, openLateMonday, [], [], lateMonday)).toEqual([
      { start: '22:30', end: '23:30' },
    ]);
  });
});

describe('listAvailableDates', () => {
  it('devuelve solo los días con alguna ventana libre', () => {
    const monday0700 = argentina('2026-09-21T07:00:00');
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

  it('arranca en el día de hoy de la cochera, no en el del dispositivo', () => {
    // 23:00 del domingo en Argentina: en Tokio ya es lunes a la mañana. El domingo tiene que
    // seguir listado (queda media hora) y el lunes también.
    const lateSunday = argentina('2026-09-20T23:00:00');
    const dates = listAvailableDates(
      [recurring(0, '08:00', '23:30'), recurring(1, '08:00', '20:00')],
      [],
      [],
      2,
      lateSunday
    );
    expect(dates).toEqual(['2026-09-20', MONDAY]);
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
