/** Formateo, todo en es-AR / ARS, igual que la app mobile (`src/lib/money.ts`). */

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const ARS_EXACT = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export function formatMoney(amount: number): string {
  return ARS.format(amount);
}

export function formatMoneyExact(amount: number): string {
  return ARS_EXACT.format(amount);
}

/** Monto de un movimiento, con signo explícito. El `+` no lo pone Intl. */
export function formatSigned(amount: number): string {
  const base = ARS.format(Math.abs(amount));
  if (amount > 0) return `+ ${base}`;
  if (amount < 0) return `− ${base}`;
  return base;
}

const DATE = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const DATETIME = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const TIME = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });

export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return DATETIME.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}

/** `hace 3 h`, `hace 2 d`. Se usa mucho en las colas, donde lo que importa es la antigüedad. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  return `hace ${Math.floor(months / 12)} a`;
}

/** Duración en milisegundos → `2 h 14 m` / `18 m`. Para los cronómetros de sesión. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} m`;
  return `${minutes} m`;
}

/** `HH:MM` a partir de un `time` de Postgres (`HH:MM:SS`). */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

export function initials(p: { firstName: string; lastName: string }): string {
  return `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();
}
