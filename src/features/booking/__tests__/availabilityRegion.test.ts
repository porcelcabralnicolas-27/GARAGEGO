import type { RecurringAvailability } from '@/features/parking/types';

import {
  businessToDisplay,
  businessWeeklyToDisplay,
  displayDate,
  displayToBusiness,
  setDisplayTimeZone,
} from '../../../../shared/time';
import { getDisplayWindowsForDate, listDisplayAvailableDates, toBusinessBooking } from '../availability';

// Demo de presentación regional (0086): la base guarda hora de Buenos Aires y la app muestra e
// ingresa los horarios en hora de Nueva York. Buenos Aires está 2 horas adelante en el invierno
// de EE. UU. y 1 hora en su verano (Argentina no tiene horario de verano).
//
// `npm run test:tz` corre este archivo con el dispositivo en varias zonas: nada de acá puede
// depender de la zona del teléfono.

const NEW_YORK = 'America/New_York';
const WINTER_DAY = '2026-12-15'; // martes
const SUMMER_DAY = '2026-07-15';
/** Un "ahora" muy anterior a las fechas de los tests: no recorta nada como pasado. */
const LONG_AGO = new Date('2026-06-01T12:00:00Z');

const allWeek = (startTime: string, endTime: string): RecurringAvailability[] =>
  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ id: `${dayOfWeek}`, dayOfWeek, startTime, endTime }));

afterEach(() => setDisplayTimeZone('America/Argentina/Buenos_Aires'));

describe('en Argentina no se convierte nada', () => {
  it('muestra e ingresa los horarios tal como se guardan', () => {
    expect(businessToDisplay(WINTER_DAY, '10:00:00')).toEqual({ date: WINTER_DAY, time: '10:00' });
    expect(displayToBusiness(WINTER_DAY, '10:00')).toEqual({ date: WINTER_DAY, time: '10:00' });
    expect(toBusinessBooking(WINTER_DAY, '10:00', '11:30')).toEqual({
      date: WINTER_DAY,
      startTime: '10:00',
      endTime: '11:30',
    });
  });
});

describe('conversión Buenos Aires ↔ Nueva York', () => {
  beforeEach(() => setDisplayTimeZone(NEW_YORK));

  it('en el invierno de EE. UU. Nueva York va 2 horas atrás', () => {
    expect(businessToDisplay(WINTER_DAY, '10:00')).toEqual({ date: WINTER_DAY, time: '08:00' });
    expect(displayToBusiness(WINTER_DAY, '08:00')).toEqual({ date: WINTER_DAY, time: '10:00' });
  });

  it('en el verano de EE. UU. va 1 hora atrás', () => {
    expect(businessToDisplay(SUMMER_DAY, '10:00')).toEqual({ date: SUMMER_DAY, time: '09:00' });
    expect(displayToBusiness(SUMMER_DAY, '09:00')).toEqual({ date: SUMMER_DAY, time: '10:00' });
  });

  it('cruza la medianoche hacia el día anterior y vuelve', () => {
    expect(businessToDisplay('2026-12-15', '01:00')).toEqual({ date: '2026-12-14', time: '23:00' });
    expect(displayToBusiness('2026-12-14', '23:00')).toEqual({ date: '2026-12-15', time: '01:00' });
  });

  it('el horario semanal se corre las horas que correspondan', () => {
    const shown = businessWeeklyToDisplay(1, '10:00');
    expect(shown.dayOfWeek).toBe(1);
    expect(['08:00', '09:00']).toContain(shown.time);
  });

  it('la fecha de hoy es la de Nueva York', () => {
    // 2026-12-15 01:00 en Buenos Aires = 2026-12-14 23:00 en Nueva York.
    expect(displayDate(new Date('2026-12-15T04:00:00Z'))).toBe('2026-12-14');
  });
});

describe('disponibilidad en hora de Nueva York', () => {
  beforeEach(() => setDisplayTimeZone(NEW_YORK));

  it('una cochera de 10 a 22 (Buenos Aires) se ve de 8 a 20', () => {
    expect(getDisplayWindowsForDate(WINTER_DAY, allWeek('10:00', '22:00'), [], [], 1, LONG_AGO)).toEqual([
      { start: '08:00', end: '20:00' },
    ]);
  });

  it('una cochera abierta todo el día se parte en la medianoche de Buenos Aires', () => {
    // Del día 15 de la cochera: 22:00 del 14 al 22:00 del 15 (se recorta a 00:00). Del 16:
    // 22:00 del 15 en adelante. No se unen, así ninguna reserva cruza la medianoche de la cochera.
    expect(getDisplayWindowsForDate(WINTER_DAY, allWeek('00:00', '24:00'), [], [], 1, LONG_AGO)).toEqual([
      { start: '00:00', end: '22:00' },
      { start: '22:00', end: '24:00' },
    ]);
  });

  it('una reserva tomada (con su margen) se resta en la hora correcta', () => {
    const booked = [{ date: WINTER_DAY, startTime: '12:00', endTime: '13:00' }];
    // 11:45-13:15 en Buenos Aires = 09:45-11:15 en Nueva York.
    expect(getDisplayWindowsForDate(WINTER_DAY, allWeek('10:00', '22:00'), [], booked, 1, LONG_AGO)).toEqual([
      { start: '08:00', end: '09:45' },
      { start: '11:15', end: '20:00' },
    ]);
  });

  it('lista los días desde hoy en Nueva York, sin los que ya no tienen horarios', () => {
    // Son las 23:00 del 14 en Nueva York (01:00 del 15 en Buenos Aires): el 14 ya cerró a las
    // 20:00, así que la lista de 3 días (14, 15 y 16) arranca el 15.
    const dates = listDisplayAvailableDates(allWeek('10:00', '22:00'), [], [], 1, 3, new Date('2026-12-15T04:00:00Z'));
    expect(dates).toEqual(['2026-12-15', '2026-12-16']);
  });

  it('el horario elegido se guarda en hora de Buenos Aires', () => {
    expect(toBusinessBooking(WINTER_DAY, '08:00', '09:30')).toEqual({
      date: WINTER_DAY,
      startTime: '10:00',
      endTime: '11:30',
    });
    // De noche en Nueva York ya es el día siguiente en Buenos Aires.
    expect(toBusinessBooking(WINTER_DAY, '22:00', '23:00')).toEqual({
      date: '2026-12-16',
      startTime: '00:00',
      endTime: '01:00',
    });
    // Terminar justo a la medianoche de Buenos Aires es el mismo día hasta las 24:00.
    expect(toBusinessBooking(WINTER_DAY, '21:00', '22:00')).toEqual({
      date: WINTER_DAY,
      startTime: '23:00',
      endTime: '24:00',
    });
  });

  it('rechaza un horario que cruzaría la medianoche de Buenos Aires', () => {
    expect(toBusinessBooking(WINTER_DAY, '21:00', '23:00')).toBeNull();
  });
});
