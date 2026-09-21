import type { AvailabilityException, RecurringAvailability } from '@/features/parking/types';

import type { BookedInterval } from './api';

export type TimeWindow = { start: string; end: string };

const STEP_MINUTES = 30;
const MIN_DURATION_MINUTES = 30;
/** Margen entre reservas de una misma cochera. Tiene que coincidir con `v_buffer` de
 *  `_assert_slot_bookable` (migración 0048): si no, la app ofrece horarios que el servidor
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

/** Formatea una fecha YYYY-MM-DD a un string local sin desfases de zona horaria. */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
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

  const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();
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
  const todayStr = toDateString(now);
  if (dateStr > todayStr) return windows;
  if (dateStr < todayStr) return [];

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const earliest = Math.ceil(nowMinutes / STEP_MINUTES) * STEP_MINUTES;

  return windows.flatMap((w) => {
    const end = toMinutes(w.end);
    if (end <= earliest) return [];
    const start = Math.max(toMinutes(w.start), earliest);
    if (start + MIN_DURATION_MINUTES > end) return [];
    return [{ start: toTimeString(start), end: w.end }];
  });
}

/** Ventanas realmente libres para una fecha: configuradas, menos lo ya reservado, menos lo ya pasado. */
export function getFreeWindowsForDate(
  dateStr: string,
  recurring: RecurringAvailability[],
  exceptions: AvailabilityException[],
  booked: BookedInterval[],
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
  return clipPastWindows(dateStr, subtractAll(configured, bookedToday), now);
}

/** Próximas fechas (YYYY-MM-DD) con al menos una ventana libre, dentro de los próximos `days` días. */
export function listAvailableDates(
  recurring: RecurringAvailability[],
  exceptions: AvailabilityException[],
  booked: BookedInterval[],
  days = 30,
  now: Date = new Date()
): string[] {
  const result: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + i);
    const dateStr = toDateString(date);
    if (getFreeWindowsForDate(dateStr, recurring, exceptions, booked, now).length > 0) {
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
