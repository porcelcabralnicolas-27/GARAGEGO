/**
 * Hora de GarageGo: la de la cochera, o sea Argentina.
 *
 * El servidor interpreta `date` + `start_time` de una reserva como hora de Buenos Aires
 * (`at time zone 'America/Argentina/Buenos_Aires'` en las RPC). La app y el panel tienen que usar
 * exactamente la misma convención sin importar la zona configurada en el dispositivo: si no, a un
 * usuario con el teléfono en otra zona le cambian el día de la semana, el contador y el momento
 * en que se habilita "Comenzar".
 *
 * Reglas para el resto del código:
 *  · Nunca usar los getters locales de Date (getHours, getDay, toLocaleString sin timeZone...):
 *    dependen de la zona del dispositivo.
 *  · Las fechas de calendario (YYYY-MM-DD) se manipulan con `weekdayOf` / `addDays`, que operan
 *    en UTC y no tienen saltos de horario de verano.
 *  · Los instantes (created_at, actual_start_at...) se muestran con los formatters de acá, que
 *    los convierten a hora de Buenos Aires.
 *
 * Lo comparten la app (src/) y el panel (admin-panel/src/) por ruta relativa, igual que domain.ts.
 */

export const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** Argentina no tiene horario de verano desde 2009: UTC-3. Solo se usa si el motor JS no soporta zonas en Intl. */
const FALLBACK_OFFSET_MINUTES = -180;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

let partsFormatter: Intl.DateTimeFormat | null | undefined;

/**
 * Formatter de Intl fijado a Buenos Aires, o null si el motor no lo soporta. Se valida con
 * `resolvedOptions`: un motor que ignorara `timeZone` en silencio usaría la zona del dispositivo,
 * que es justo el error que se quiere evitar.
 */
function getPartsFormatter(): Intl.DateTimeFormat | null {
  if (partsFormatter !== undefined) return partsFormatter;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const resolved = formatter.resolvedOptions().timeZone;
    const supported =
      (resolved === BUSINESS_TIME_ZONE || resolved === 'America/Buenos_Aires') &&
      typeof formatter.formatToParts === 'function';
    partsFormatter = supported ? formatter : null;
  } catch {
    partsFormatter = null;
  }
  return partsFormatter;
}

/** Minutos entre la hora de Buenos Aires y UTC en ese instante (hoy, -180). */
export function businessOffsetMinutes(instantMs: number): number {
  const formatter = getPartsFormatter();
  if (!formatter) return FALLBACK_OFFSET_MINUTES;

  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instantMs)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  const offset = Math.round((wallAsUtc - Math.floor(instantMs / 1000) * 1000) / MINUTE_MS);
  return Number.isFinite(offset) ? offset : FALLBACK_OFFSET_MINUTES;
}

export type WallClock = {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = domingo, igual que `day_of_week` en la base. */
  weekday: number;
};

function toMs(instant: Date | number | string): number {
  return instant instanceof Date ? instant.getTime() : typeof instant === 'number' ? instant : new Date(instant).getTime();
}

/** Día y hora en Buenos Aires de un instante. */
export function toBusinessWallClock(instant: Date | number | string): WallClock {
  const ms = toMs(instant);
  const shifted = new Date(ms + businessOffsetMinutes(ms) * MINUTE_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function dateKey(wall: Pick<WallClock, 'year' | 'month' | 'day'>): string {
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
}

/** Fecha (YYYY-MM-DD) de ese instante en Buenos Aires. Sin argumento, la de ahora. */
export function businessDate(instant: Date | number | string = Date.now()): string {
  return dateKey(toBusinessWallClock(instant));
}

/** Minutos desde la medianoche de Buenos Aires. Sin argumento, los de ahora. */
export function businessMinutesOfDay(instant: Date | number | string = Date.now()): number {
  const wall = toBusinessWallClock(instant);
  return wall.hour * 60 + wall.minute;
}

/**
 * Instante que corresponde a `date` (YYYY-MM-DD) + `time` (HH:MM o HH:MM:SS) en Buenos Aires.
 * Es la conversión que hace el servidor con `(date + time) at time zone '...Buenos_Aires'`.
 */
export function businessInstant(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Segunda pasada con el offset del resultado: corrige el caso de que el offset cambie justo
  // entre la hora de pared y el instante real (un cambio de horario de verano).
  const firstGuess = wallAsUtc - businessOffsetMinutes(wallAsUtc) * MINUTE_MS;
  return new Date(wallAsUtc - businessOffsetMinutes(firstGuess) * MINUTE_MS);
}

function parseCalendarDate(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Día de la semana (0 = domingo) de una fecha de calendario. No depende de ninguna zona. */
export function weekdayOf(date: string): number {
  return new Date(parseCalendarDate(date)).getUTCDay();
}

/** Suma días a una fecha de calendario (YYYY-MM-DD). */
export function addDays(date: string, days: number): string {
  const shifted = new Date(parseCalendarDate(date) + days * DAY_MS);
  return dateKey({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() });
}

/**
 * ¿El dispositivo está en la misma hora que Buenos Aires? Si no, las pantallas que muestran
 * horarios de reserva avisan que están en hora de Argentina.
 */
export function deviceUsesBusinessTime(instant: Date | number = Date.now()): boolean {
  const ms = toMs(instant);
  return -new Date(ms).getTimezoneOffset() === businessOffsetMinutes(ms);
}

// ── Formato ──────────────────────────────────────────────────────────────────────────────────
// Fechas de calendario (YYYY-MM-DD): se formatean tal cual, sin conversión.

/** `lun 21/09` */
export function formatCalendarDayShort(date: string): string {
  const [, month, day] = date.split('-');
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${day}/${month}`;
}

/** `lunes 21/09` */
export function formatCalendarDayLong(date: string): string {
  const [, month, day] = date.split('-');
  return `${WEEKDAYS_LONG[weekdayOf(date)]} ${day}/${month}`;
}

/** `21/09/2026` */
export function formatCalendarDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

// Instantes (ISO con hora): se convierten a Buenos Aires.

/** `14:05` */
export function formatTime(instant: Date | number | string): string {
  const wall = toBusinessWallClock(instant);
  return `${pad(wall.hour)}:${pad(wall.minute)}`;
}

/** `21/09` */
export function formatDayMonth(instant: Date | number | string): string {
  const wall = toBusinessWallClock(instant);
  return `${pad(wall.day)}/${pad(wall.month)}`;
}

/** `21/09 14:05` */
export function formatDayMonthTime(instant: Date | number | string): string {
  return `${formatDayMonth(instant)} ${formatTime(instant)}`;
}

/** `21/09/2026` */
export function formatDate(instant: Date | number | string): string {
  const wall = toBusinessWallClock(instant);
  return `${pad(wall.day)}/${pad(wall.month)}/${wall.year}`;
}

/** `21/09/2026 14:05` */
export function formatDateTime(instant: Date | number | string): string {
  return `${formatDate(instant)} ${formatTime(instant)}`;
}

/** `05 sept 2026` */
export function formatDateMonthName(instant: Date | number | string): string {
  const wall = toBusinessWallClock(instant);
  return `${pad(wall.day)} ${MONTHS_SHORT[wall.month - 1]} ${wall.year}`;
}

/** `sept` */
export function formatMonthName(instant: Date | number | string): string {
  return MONTHS_SHORT[toBusinessWallClock(instant).month - 1];
}
