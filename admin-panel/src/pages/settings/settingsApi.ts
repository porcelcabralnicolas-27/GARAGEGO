/**
 * Ajustes de `app_settings` (migración 0093) y, en particular, los límites (`section = 'limits'`). El
 * equipo los lee por RLS y los guarda solo con la RPC `admin_update_settings`, que valida en el
 * servidor. `validateLimits` repite esas reglas acá para avisar antes de guardar; si alguna vez no
 * coinciden, manda el servidor.
 */

import { supabase } from '../../lib/supabase';

export type LimitKey =
  | 'max_parking_images'
  | 'max_vehicles_per_region'
  | 'parking_capacity_min'
  | 'parking_capacity_max'
  | 'wallet_max_balance'
  | 'topup_min'
  | 'topup_max'
  | 'topup_quick_amounts';

export type Limits = {
  max_parking_images: number;
  max_vehicles_per_region: number;
  parking_capacity_min: number;
  parking_capacity_max: number;
  wallet_max_balance: number;
  topup_min: number;
  topup_max: number;
  topup_quick_amounts: number[];
};

/** Los valores de antes de la 0093: el panel los usa si la migración no está corrida. */
export const DEFAULT_LIMITS: Limits = {
  max_parking_images: 3,
  max_vehicles_per_region: 3,
  parking_capacity_min: 1,
  parking_capacity_max: 50,
  wallet_max_balance: 200000,
  topup_min: 100,
  topup_max: 50000,
  topup_quick_amounts: [5000, 10000, 15000, 20000],
};

export const LIMIT_KEYS = Object.keys(DEFAULT_LIMITS) as LimitKey[];

/** Rango que acepta el servidor para cada número suelto (las reglas cruzadas van aparte). */
export const LIMIT_RANGES: Record<Exclude<LimitKey, 'topup_quick_amounts'>, { min: number; max: number }> = {
  max_parking_images: { min: 1, max: 10 },
  max_vehicles_per_region: { min: 1, max: 10 },
  parking_capacity_min: { min: 1, max: 500 },
  parking_capacity_max: { min: 1, max: 500 },
  wallet_max_balance: { min: 1000, max: 10000000 },
  topup_min: { min: 100, max: 10000000 },
  topup_max: { min: 100, max: 10000000 },
};

export const MAX_QUICK_AMOUNTS = 6;

/** Último cambio de una sección de ajustes (null si nunca se tocaron). */
export type SettingsMeta = {
  updatedAt: string | null;
  updatedByName: string | null;
};

export type LimitsMeta = SettingsMeta;

type SettingRow = { key: string; value: unknown; updated_at: string; updated_by: string | null };

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.');
  return supabase;
}

/**
 * Lee una sección de `app_settings`: los valores por clave y quién la cambió por última vez. Si la
 * sección no tiene filas, avisa con `emptyMessage` (normalmente, falta la migración).
 */
export async function fetchSettingsSection(
  section: string,
  emptyMessage: string
): Promise<{ values: Record<string, unknown>; meta: SettingsMeta }> {
  const db = client();
  const { data, error } = await db
    .from('app_settings')
    .select('key, value, updated_at, updated_by')
    .eq('section', section);
  // PostgrestError no es un Error: se convierte para que la pantalla muestre el motivo.
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SettingRow[];
  if (rows.length === 0) throw new Error(emptyMessage);

  const values: Record<string, unknown> = {};
  for (const row of rows) values[row.key] = row.value;

  // El cambio más reciente de un humano (los valores semilla no tienen autor).
  const touched = rows.filter((row) => row.updated_by).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const last = touched[0];
  let updatedByName: string | null = null;
  if (last?.updated_by) {
    const { data: profile } = await db
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', last.updated_by)
      .maybeSingle();
    const p = profile as { first_name: string | null; last_name: string | null } | null;
    updatedByName = p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Un admin' : 'Un admin';
  }
  return { values, meta: { updatedAt: last?.updated_at ?? null, updatedByName } };
}

/**
 * Guarda ajustes con `admin_update_settings` (valida el servidor). `labels` traduce la clave que
 * rechazó el servidor; `migration` es la que falta si la función o la clave no existen.
 */
export async function saveSettings(
  changes: Record<string, unknown>,
  labels: Record<string, string>,
  migration: string
): Promise<void> {
  const { error } = await client().rpc('admin_update_settings', { p_values: changes });
  if (!error) return;
  const message = error.message;
  if (message.includes('not_admin')) throw new Error('Solo un admin puede cambiar estos ajustes.');
  const invalid = message.match(/setting_invalid: (\w+)/)?.[1];
  if (invalid && invalid in labels) throw new Error(`El servidor rechazó «${labels[invalid]}»: revisá el valor.`);
  if (message.includes('setting_unknown')) {
    throw new Error(`Se intentó guardar un ajuste que no existe (¿está corrida la migración ${migration}?).`);
  }
  if (message.includes('admin_update_settings')) throw new Error(`Falta correr la migración ${migration} en Supabase.`);
  throw new Error(message);
}

export async function fetchLimits(): Promise<{ limits: Limits; meta: LimitsMeta }> {
  const { values, meta } = await fetchSettingsSection('limits', 'No hay límites cargados.');
  const limits: Limits = { ...DEFAULT_LIMITS, topup_quick_amounts: [...DEFAULT_LIMITS.topup_quick_amounts] };
  for (const key of LIMIT_KEYS) {
    const value = values[key];
    if (key === 'topup_quick_amounts') {
      if (Array.isArray(value)) limits.topup_quick_amounts = value.map(Number);
    } else if (typeof value === 'number') {
      limits[key] = value;
    }
  }
  return { limits, meta };
}

/** Guarda solo los límites que cambiaron. Devuelve el error del servidor en castellano. */
export async function saveLimits(changes: Partial<Limits>): Promise<void> {
  await saveSettings(changes, LIMIT_LABELS, '0093');
}

export const LIMIT_LABELS: Record<LimitKey, string> = {
  max_parking_images: 'Fotos por publicación',
  max_vehicles_per_region: 'Vehículos por cuenta y país',
  parking_capacity_min: 'Capacidad mínima',
  parking_capacity_max: 'Capacidad máxima',
  wallet_max_balance: 'Saldo máximo de la billetera',
  topup_min: 'Recarga mínima',
  topup_max: 'Recarga máxima',
  topup_quick_amounts: 'Montos rápidos de recarga',
};

/** Errores por campo, con las mismas reglas que `admin_update_settings`. Vacío = se puede guardar. */
export function validateLimits(limits: Limits): Partial<Record<LimitKey, string>> {
  const errors: Partial<Record<LimitKey, string>> = {};
  for (const key of Object.keys(LIMIT_RANGES) as Array<keyof typeof LIMIT_RANGES>) {
    const value = limits[key];
    const { min, max } = LIMIT_RANGES[key];
    if (!Number.isInteger(value)) errors[key] = 'Tiene que ser un número entero.';
    else if (value < min || value > max) {
      errors[key] = `Tiene que estar entre ${min.toLocaleString('es-AR')} y ${max.toLocaleString('es-AR')}.`;
    }
  }
  if (!errors.parking_capacity_max && limits.parking_capacity_max < limits.parking_capacity_min) {
    errors.parking_capacity_max = 'No puede ser menor que la capacidad mínima.';
  }
  if (!errors.topup_max && limits.topup_max < limits.topup_min) {
    errors.topup_max = 'No puede ser menor que la recarga mínima.';
  } else if (!errors.topup_max && limits.topup_max > limits.wallet_max_balance) {
    errors.topup_max = 'No puede superar el saldo máximo.';
  }
  const amounts = limits.topup_quick_amounts;
  if (amounts.length === 0) errors.topup_quick_amounts = 'Tiene que haber al menos un monto.';
  else if (amounts.length > MAX_QUICK_AMOUNTS) errors.topup_quick_amounts = `Como máximo ${MAX_QUICK_AMOUNTS} montos.`;
  else if (amounts.some((a) => !Number.isInteger(a))) errors.topup_quick_amounts = 'Los montos tienen que ser enteros.';
  else if (new Set(amounts).size !== amounts.length) errors.topup_quick_amounts = 'Hay montos repetidos.';
  else if (amounts.some((a) => a < limits.topup_min || a > limits.topup_max)) {
    errors.topup_quick_amounts = 'Cada monto tiene que estar entre la recarga mínima y la máxima.';
  }
  return errors;
}

/** Qué límites cambiaron respecto de lo guardado (para guardar solo eso y mostrar el resumen). */
export function changedLimits(saved: Limits, draft: Limits): Partial<Limits> {
  const changes: Partial<Limits> = {};
  for (const key of LIMIT_KEYS) {
    if (key === 'topup_quick_amounts') {
      const a = [...saved.topup_quick_amounts].sort((x, y) => x - y);
      const b = [...draft.topup_quick_amounts].sort((x, y) => x - y);
      if (a.join(',') !== b.join(',')) changes.topup_quick_amounts = b;
    } else if (saved[key] !== draft[key]) {
      changes[key] = draft[key];
    }
  }
  return changes;
}
