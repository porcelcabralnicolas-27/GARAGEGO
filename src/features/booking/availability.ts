import type { AvailabilityException, RecurringAvailability } from '@/features/parking/types';

import {
  addDays,
  businessDate,
  businessMinutesOfDay,
  businessToDisplay,
  displayDate,
  displaysBusinessTime,
  displayToBusiness,
  weekdayOf,
} from '../../../shared/time';
import type { BookedInterval } from './api';

// Fechas y horas de este archivo son hora de la cochera (Buenos Aires), igual que en el servidor:
// "hoy" y "ahora" salen de shared/time.ts y nunca de la zona del dispositivo.

export type TimeWindow = { start: string; end: string };

const STEP_MINUTES = 30;
const MIN_DURATION_MINUTES = 30;
/** Margen alrededor de cada reserva. Tiene que coincidir con `v_buffer` de
 *  `_assert_slot_bookable` (migración 0064): si no, la app ofrece horarios que el servidor
 *  rechaza con `buffer_conflict`. */
const BUFFER_MINUTES = 15;
const MINUTES_PER_DAY = 24 * 60;

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function toTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function normalizeTime(time: string): string {
  return time.slice(0, 5);
}

function subtractInterval(window: TimeWindow, booked: TimeWindow): TimeWindow[] {
  const wStart = toMinutes(window.start);
  const wEnd = toMinutes(window.end);
  const bStart = toMinutes(booked.start);
  const bEnd = toMinutes(booked.end);

  if (bEnd <= wStart || bStart >= wEnd) return [window];

  const result: TimeWindow[] = [];
  if (bStart > wStart) result.push({ start: window.start, end: toTimeString(bStart) });
  if (bEnd < wEnd) result.push({ start: toTimeString(bEnd), end: window.end });
  return result;
}

function subtractAll(windows: TimeWindow[], booked: TimeWindow[]): TimeWindow[] {
  return booked.reduce((current, interval) => current.flatMap((w) => subtractInterval(w, interval)), windows);
}

/**
 * Tramos donde la ocupación simultánea llega a `capacity`: ahí no entra otro auto. Con
 * capacidad 1 es simplemente la unión de las reservas. Los intervalos son semiabiertos
 * [inicio, fin), igual que los tsrange de `_assert_slot_bookable` (0064): uno que termina a las
 * 11:00 no se suma a otro que empieza a las 11:00.
 */
function fullSegments(intervals: TimeWindow[], capacity: number): TimeWindow[] {
  const events = intervals.flatMap((i) => [
    { at: toMinutes(i.start), delta: 1 },
    { at: toMinutes(i.end), delta: -1 },
  ]);
  // A igual minuto, primero los fines: así los intervalos que se tocan no se pisan.
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);

  const result: TimeWindow[] = [];
  let occupancy = 0;
  let fullSince: number | null = null;
  for (const event of events) {
    occupancy += event.delta;
    if (fullSince === null && occupancy >= capacity) {
      fullSince = event.at;
    } else if (fullSince !== null && occupancy < capacity) {
      if (event.at > fullSince) result.push({ start: toTimeString(fullSince), end: toTimeString(event.at) });
      fullSince = null;
    }
  }
  return result;
}

/** Ventanas horarias configuradas para una fecha (excepción puntual si existe, si no la franja recurrente del día). */
export function getConfiguredWindowsForDate(
  dateStr: string,
  recurring: RecurringAvailability[],
  exceptions: AvailabilityException[]
): TimeWindow[] {
  const exception = exceptions.find((e) => e.date === dateStr);
  if (exception) {
    if (!exception.isAvailable) return [];
    if (exception.startTime && exception.endTime) {
      return [{ start: normalizeTime(exception.startTime), end: normalizeTime(exception.endTime) }];
    }
    return [];
  }

  const dayOfWeek = weekdayOf(dateStr);
  return recurring
    .filter((r) => r.dayOfWeek === dayOfWeek)
    .map((r) => ({ start: normalizeTime(r.startTime), end: normalizeTime(r.endTime) }));
}

/**
 * Recorta las ventanas de HOY que ya pasaron: no tiene sentido ofrecer las 09:00 si son las 18:00.
 * El inicio se redondea hacia arriba al próximo múltiplo de STEP_MINUTES para que coincida
 * con los horarios que después generan generateStartTimeOptions/generateEndTimeOptions.
 * Para fechas futuras devuelve las ventanas intactas; para fechas pasadas, ninguna.
 */
function clipPastWindows(dateStr: string, windows: TimeWindow[], now: Date): TimeWindow[] {
  const todayStr = businessDate(now);
  if (dateStr > todayStr) return windows;
  if (dateStr < todayStr) return [];

  const nowMinutes = businessMinutesOfDay(now);
  const earliest = Math.ceil(nowMinutes / STEP_MINUTES) * STEP_MINUTES;

  return windows.flatMap((w) => {
    const end = toMinutes(w.end);
    if (end <= earliest) return [];
    const start = Math.max(toMinutes(w.start), earliest);
    if (start + MIN_DURATION_MINUTES > end) return [];
    return [{ start: toTimeString(start), end: w.end }];
  });
}

/**
 * Ventanas realmente libres para una fecha: configuradas, menos los tramos donde la cochera ya
 * está llena (`capacity` autos a la vez), menos lo ya pasado.
 */
export function getFreeWindowsForDate(
  dateStr: string,
  recurring: RecurringAvailability[],
  exceptions: AvailabilityException[],
  booked: BookedInterval[],
  capacity: number,
  now: Date = new Date()
): TimeWindow[] {
  const configured = getConfiguredWindowsForDate(dateStr, recurring, exceptions);
  if (configured.length === 0) return [];
  // Cada reserva ocupa también el margen de antes y de después.
  const bookedToday = booked
    .filter((b) => b.date === dateStr)
    .map((b) => ({
      start: toTimeString(Math.max(0, toMinutes(normalizeTime(b.startTime)) - BUFFER_MINUTES)),
      end: toTimeString(Math.min(MINUTES_PER_DAY, toMinutes(normalizeTime(b.endTime)) + BUFFER_MINUTES)),
    }));
  return clipPastWindows(dateStr, subtractAll(configured, fullSegments(bookedToday, capacity)), now);
}

/** Próximas fechas (YYYY-MM-DD) con al menos una ventana libre, dentro de los próximos `days` días. */
export function listAvailableDates(
  recurring: RecurringAvailability[],
  exceptions: AvailabilityException[],
  booked: BookedInterval[],
  capacity: number,
  days = 30,
  now: Date = new Date()
): string[] {
  const result: string[] = [];
  const today = businessDate(now);
  for (let i = 0; i < days; i += 1) {
    const dateStr = addDays(today, i);
    if (getFreeWindowsForDate(dateStr, recurring, exceptions, booked, capacity, now).length > 0) {
      result.push(dateStr);
    }
  }
  return result;
}

export function generateStartTimeOptions(windows: TimeWindow[]): string[] {
  const options: string[] = [];
  for (const w of windows) {
    const start = toMinutes(w.start);
    const end = toMinutes(w.end);
    for (let t = start; t + MIN_DURATION_MINUTES <= end; t += STEP_MINUTES) {
      options.push(toTimeString(t));
    }
  }
  return [...new Set(options)].sort();
}

export function generateEndTimeOptions(windows: TimeWindow[], startTime: string): string[] {
  const startMin = toMinutes(startTime);
  const window = windows.find((w) => toMinutes(w.start) <= startMin && startMin < toMinutes(w.end));
  if (!window) return [];
  const windowEnd = toMinutes(window.end);
  const options: string[] = [];
  for (let t = startMin + STEP_MINUTES; t <= windowEnd; t += STEP_MINUTES) {
    options.push(toTimeString(t));
  }
  return options;
}

// ── En la hora de la región (demo de presentación regional, 0086) ───────────────────────────
// En Argentina son las mismas funciones de arriba. En la demo de Estados Unidos, el día que elige
// el usuario es un día de Nueva York: puede abarcar dos fechas de la cochera (Buenos Aires va
// 1 o 2 horas adelante), así que se calculan las ventanas libres de esas fechas y se convierten.
// Cada ventana sale de una sola fecha de la cochera: una reserva elegida adentro de ella nunca
// cruza la medianoche de Buenos Aires (la base guarda una sola fecha por reserva).

/** Ventanas libres de un día en la hora de la región. */
export function getDisplayWindowsForDate(
  displayDateStr: string,
  recurring: RecurringAvailability[],
  exceptions: AvailabilityException[],
  booked: BookedInterval[],
  capacity: number,
  now: Date = new Date()
): TimeWindow[] {
  if (displaysBusinessTime()) return getFreeWindowsForDate(displayDateStr, recurring, exceptions, booked, capacity, now);

  const firstDate = displayToBusiness(displayDateStr, '00:00').date;
  const lastDate = displayToBusiness(displayDateStr, '23:59').date;
  const businessDates = firstDate === lastDate ? [firstDate] : [firstDate, lastDate];

  const result: TimeWindow[] = [];
  for (const date of businessDates) {
    for (const w of getFreeWindowsForDate(date, recurring, exceptions, booked, capacity, now)) {
      const start = businessToDisplay(date, w.start);
      const end = businessToDisplay(date, w.end);
      if (start.date > displayDateStr || end.date < displayDateStr) continue;
      const window = {
        start: start.date < displayDateStr ? '00:00' : start.time,
        end: end.date > displayDateStr ? '24:00' : end.time,
      };
      if (toMinutes(window.end) - toMinutes(window.start) >= MIN_DURATION_MINUTES) result.push(window);
    }
  }
  return result.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

/** Próximos días (en la hora de la región) con al menos una ventana libre. */
export function listDisplayAvailableDates(
  recurring: RecurringAvailability[],
  exceptions: AvailabilityException[],
  booked: BookedInterval[],
  capacity: number,
  days = 30,
  now: Date = new Date()
): string[] {
  if (displaysBusinessTime()) return listAvailableDates(recurring, exceptions, booked, capacity, days, now);
  const result: string[] = [];
  const today = displayDate(now);
  for (let i = 0; i < days; i += 1) {
    const dateStr = addDays(today, i);
    if (getDisplayWindowsForDate(dateStr, recurring, exceptions, booked, capacity, now).length > 0) {
      result.push(dateStr);
    }
  }
  return result;
}

/**
 * Horario elegido en la región → como se guarda la reserva (fecha y horas de Buenos Aires).
 * null si cruzara la medianoche de la cochera (no pasa con ventanas de getDisplayWindowsForDate).
 */
export function toBusinessBooking(
  displayDateStr: string,
  startTime: string,
  endTime: string
): { date: string; startTime: string; endTime: string } | null {
  const start = displayToBusiness(displayDateStr, startTime);
  const end = displayToBusiness(displayDateStr, endTime);
  if (end.date === start.date) return { date: start.date, startTime: start.time, endTime: end.time };
  // Termina justo a la medianoche de la cochera: es el mismo día hasta las 24:00.
  if (end.date === addDays(start.date, 1) && end.time === '00:00') {
    return { date: start.date, startTime: start.time, endTime: '24:00' };
  }
  return null;
}
