/**
 * Helpers deterministas para los mocks.
 *
 * Dos decisiones que importan:
 *  · Los ids son estables entre recargas (no `crypto.randomUUID()`), para que los deep links
 *    tipo `?id=...` sigan funcionando después de un F5.
 *  · Las fechas son RELATIVAS a "ahora", así la demo nunca envejece: si se abre en seis meses,
 *    la cola de aprobaciones sigue teniendo publicaciones de "hace 2 días".
 */

/** Id estable con forma de uuid, derivado del prefijo y el índice. */
export function id(prefix: string, n: number): string {
  const tag = prefix.padEnd(4, '0').slice(0, 4);
  const seq = String(n).padStart(12, '0');
  return `${tag}${seq.slice(0, 4)}-${seq.slice(4, 8)}-4000-8000-${seq}`;
}

/** Ancla de la demo: se fija una sola vez al cargar el módulo para que todas las fechas sean
 *  coherentes entre sí durante la sesión. */
export const NOW = Date.now();

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

export function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString();
}

export function hoursAgo(n: number): string {
  return new Date(NOW - n * HOUR).toISOString();
}

export function minutesAgo(n: number): string {
  return new Date(NOW - n * MINUTE).toISOString();
}

export function daysAhead(n: number): string {
  return new Date(NOW + n * DAY).toISOString();
}

/** `YYYY-MM-DD` de un día relativo a hoy. Para `bookings.date`, que es un `date` pelado. */
export function dateOnly(offsetDays: number): string {
  return new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10);
}

/** `HH:MM:SS`, como los `time` de la base. */
export function timeOnly(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

/**
 * PRNG determinista (mulberry32). Se usa para repartir datos con aspecto natural sin que
 * cambien en cada recarga — un `Math.random()` haría que la demo se vea distinta cada vez y
 * que los números de las métricas no cuadren entre paneles.
 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

export function intBetween(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
