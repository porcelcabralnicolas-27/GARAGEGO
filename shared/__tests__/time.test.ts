import {
  addDays,
  businessDate,
  businessInstant,
  businessMinutesOfDay,
  businessOffsetMinutes,
  deviceUsesBusinessTime,
  formatCalendarDayLong,
  formatCalendarDayShort,
  formatDateMonthName,
  formatDateTime,
  formatDayMonthTime,
  formatTime,
  weekdayOf,
} from '../time';

// `npm run test:tz` corre este archivo (y los demás sensibles a la hora) una vez por cada zona
// del dispositivo, con TZ fijada al lanzar el proceso: dentro de Jest cambiar process.env.TZ no
// tiene efecto. Todas las aserciones tienen que dar igual en cualquier zona.
describe(`hora de negocio (dispositivo en ${process.env.TZ ?? 'la zona del sistema'})`, () => {
  it('el proceso corre en la zona pedida (si no, el resto no prueba nada)', () => {
    if (!process.env.TZ) return;
    // Se compara el formato y no el nombre: el motor puede reportar un alias
    // (America/Buenos_Aires en vez de America/Argentina/Buenos_Aires).
    for (const instant of [Date.UTC(2026, 0, 15, 12), Date.UTC(2026, 6, 15, 12)]) {
      expect(new Date(instant).toLocaleString('en-US')).toBe(
        new Date(instant).toLocaleString('en-US', { timeZone: process.env.TZ })
      );
    }
  });

  it('Buenos Aires está en UTC-3', () => {
    expect(businessOffsetMinutes(Date.UTC(2026, 8, 21, 12))).toBe(-180);
    expect(businessOffsetMinutes(Date.UTC(2026, 0, 15, 12))).toBe(-180);
  });

  it('businessInstant interpreta la hora como de Buenos Aires, igual que el servidor', () => {
    expect(businessInstant('2026-09-21', '10:00').toISOString()).toBe('2026-09-21T13:00:00.000Z');
    expect(businessInstant('2026-09-21', '22:30:00').toISOString()).toBe('2026-09-22T01:30:00.000Z');
    expect(businessInstant('2026-09-21', '00:00').toISOString()).toBe('2026-09-21T03:00:00.000Z');
  });

  it('businessDate y businessMinutesOfDay usan el día y la hora de Buenos Aires', () => {
    // 02:30 UTC del 22 = 23:30 del 21 en Buenos Aires.
    const lateNight = Date.UTC(2026, 8, 22, 2, 30);
    expect(businessDate(lateNight)).toBe('2026-09-21');
    expect(businessMinutesOfDay(lateNight)).toBe(23 * 60 + 30);

    // 03:00 UTC del 22 = 00:00 del 22 en Buenos Aires.
    const midnight = Date.UTC(2026, 8, 22, 3, 0);
    expect(businessDate(midnight)).toBe('2026-09-22');
    expect(businessMinutesOfDay(midnight)).toBe(0);
  });

  it('las fechas de calendario no se corren de día', () => {
    expect(weekdayOf('2026-09-21')).toBe(1);
    expect(weekdayOf('2026-09-27')).toBe(0);
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(formatCalendarDayShort('2026-09-21')).toBe('lun 21/09');
    expect(formatCalendarDayLong('2026-09-27')).toBe('domingo 27/09');
  });

  it('los instantes se muestran en hora de Buenos Aires', () => {
    const iso = '2026-09-22T02:05:00.000Z';
    expect(formatTime(iso)).toBe('23:05');
    expect(formatDayMonthTime(iso)).toBe('21/09 23:05');
    expect(formatDateTime(iso)).toBe('21/09/2026 23:05');
    expect(formatDateMonthName(iso)).toBe('21 sept 2026');
  });

  it('deviceUsesBusinessTime solo es true si el dispositivo está en hora de Argentina', () => {
    const instant = Date.UTC(2026, 8, 21, 12);
    expect(deviceUsesBusinessTime(instant)).toBe(new Date(instant).getTimezoneOffset() === 180);
  });
});
