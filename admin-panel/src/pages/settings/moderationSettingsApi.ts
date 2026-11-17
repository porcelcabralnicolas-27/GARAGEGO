/**
 * Moderación configurable (migración 0095): motivos de rechazo, pausa y ocultar reseña
 * (`moderation_reasons`) y plazos de la cola de aprobación (`app_settings`, sección `moderation`).
 *
 * Solo los usa el panel. El motivo elegido se guarda como texto en la cochera o la reseña, así que
 * editar o borrar un motivo no cambia el historial.
 */

import { supabase } from '../../lib/supabase';
import { fetchSettingsSection, saveSettings, type SettingsMeta } from './settingsApi';

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.');
  return supabase;
}

// ── Motivos ─────────────────────────────────────────────────────────────────────────────────

export type ReasonKind = 'reject' | 'pause' | 'hide_review';

export const REASON_KINDS: ReasonKind[] = ['reject', 'pause', 'hide_review'];

export const REASON_KIND_INFO: Record<ReasonKind, { title: string; where: string }> = {
  reject: {
    title: 'Rechazo de publicaciones',
    where: 'Se elige al rechazar una publicación en Inventario. El propietario lo ve junto con el detalle.',
  },
  pause: {
    title: 'Pausa o suspensión',
    where: 'Se elige al pausar o suspender una cochera desde Inventario. Queda en su historial.',
  },
  hide_review: {
    title: 'Ocultar reseñas',
    where: 'Se elige al ocultar una reseña desde Usuarios. Queda registrado junto a la reseña.',
  },
};

/** Las listas de antes de la 0095: el panel las usa si la migración no está corrida. */
export const FALLBACK_REASONS: Record<ReasonKind, string[]> = {
  reject: [
    'Fotos insuficientes o poco claras',
    'La dirección no se puede verificar',
    'No se pudo verificar la titularidad',
    'Precio fuera de rango',
    'Incluye datos de contacto en la descripción',
    'Contenido inapropiado',
    'Otro',
  ],
  pause: [
    'Denuncias de acceso bloqueado',
    'Datos de la publicación no verificables',
    'Reclamos reiterados de conductores',
    'Verificación de titularidad pendiente',
    'Otro',
  ],
  hide_review: [
    'Contiene datos personales de terceros',
    'Lenguaje ofensivo',
    'No describe la experiencia real',
    'Sospecha de reseña falsa',
    'Otro',
  ],
};

export const REASON_MIN = 3;
export const REASON_MAX = 120;

export type ModerationReason = {
  id: string;
  kind: ReasonKind;
  label: string;
  position: number;
  isActive: boolean;
};

type ReasonRow = { id: string; kind: ReasonKind; label: string; position: number; is_active: boolean };

export function reasonErrorMessage(message: string): string {
  const kind = message.match(/moderation_kind_without_reasons: (\w+)/)?.[1] as ReasonKind | undefined;
  if (kind && kind in REASON_KIND_INFO) {
    return `Tiene que quedar al menos un motivo activo en «${REASON_KIND_INFO[kind].title}».`;
  }
  if (message.includes('moderation_reasons_kind_label_key') || message.includes('duplicate key')) {
    return 'Ya hay un motivo con ese nombre en esta lista.';
  }
  if (message.includes('moderation_reasons_label_check')) {
    return `El motivo tiene que tener entre ${REASON_MIN} y ${REASON_MAX} caracteres.`;
  }
  if (message.includes('moderation_kind_immutable')) return 'Un motivo no se puede pasar a otra lista.';
  if (message.includes('moderation_reasons')) return `${message} (¿está corrida la migración 0095?)`;
  return message;
}

function fail(error: { message: string }): never {
  throw new Error(reasonErrorMessage(error.message));
}

/** Todos los motivos (activos e inactivos), en orden. */
export async function fetchReasons(): Promise<ModerationReason[]> {
  const { data, error } = await client()
    .from('moderation_reasons')
    .select('id, kind, label, position, is_active')
    .order('position')
    .order('created_at');
  if (error) fail(error);
  return ((data ?? []) as ReasonRow[]).map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    position: row.position,
    isActive: row.is_active,
  }));
}

export async function createReason(kind: ReasonKind, label: string, existing: ModerationReason[]): Promise<void> {
  const sameKind = existing.filter((r) => r.kind === kind);
  const position = sameKind.reduce((max, r) => Math.max(max, r.position), 0) + 10;
  const { error } = await client().from('moderation_reasons').insert({ kind, label: label.trim(), position });
  if (error) fail(error);
}

export async function updateReason(id: string, input: { label?: string; isActive?: boolean }): Promise<void> {
  const row = {
    ...(input.label !== undefined ? { label: input.label.trim() } : {}),
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  };
  const { error } = await client().from('moderation_reasons').update(row).eq('id', id);
  if (error) fail(error);
}

export async function swapReasons(a: ModerationReason, b: ModerationReason): Promise<void> {
  // Si quedaron con la misma posición, se separan para que el cambio se note.
  const [posA, posB] = a.position === b.position ? [b.position + 1, a.position] : [b.position, a.position];
  const first = await client().from('moderation_reasons').update({ position: posA }).eq('id', a.id);
  if (first.error) fail(first.error);
  const second = await client().from('moderation_reasons').update({ position: posB }).eq('id', b.id);
  if (second.error) fail(second.error);
}

export async function deleteReason(id: string): Promise<void> {
  const { error } = await client().from('moderation_reasons').delete().eq('id', id);
  if (error) fail(error);
}

/** Motivos activos por tipo, para los diálogos. Si no se pueden leer, las listas de antes. */
export function activeReasonsByKind(reasons: ModerationReason[]): Record<ReasonKind, string[]> {
  const result = {} as Record<ReasonKind, string[]>;
  for (const kind of REASON_KINDS) {
    const active = reasons.filter((r) => r.kind === kind && r.isActive).map((r) => r.label);
    result[kind] = active.length > 0 ? active : FALLBACK_REASONS[kind];
  }
  return result;
}

// ── Plazos de la cola de aprobación ─────────────────────────────────────────────────────────

export type SlaKey = 'review_sla_info_hours' | 'review_sla_warn_hours' | 'review_sla_danger_hours';
export type SlaHours = Record<SlaKey, number>;

export const SLA_KEYS: SlaKey[] = ['review_sla_info_hours', 'review_sla_warn_hours', 'review_sla_danger_hours'];

/** Los plazos de antes de la 0095. */
export const DEFAULT_SLA: SlaHours = {
  review_sla_info_hours: 24,
  review_sla_warn_hours: 48,
  review_sla_danger_hours: 72,
};

export const SLA_RANGE = { min: 1, max: 720 };

export const SLA_LABELS: Record<SlaKey, string> = {
  review_sla_info_hours: 'Pasa a azul',
  review_sla_warn_hours: 'Pasa a amarillo',
  review_sla_danger_hours: 'Pasa a rojo',
};

/** Plazos de la cola y factor del control de tarifa (sección `moderation` de `app_settings`). */
export async function fetchSla(): Promise<{ sla: SlaHours; priceFactor: number; meta: SettingsMeta }> {
  const { values, meta } = await fetchSettingsSection('moderation', 'No hay plazos cargados.');
  const sla = { ...DEFAULT_SLA };
  for (const key of SLA_KEYS) if (typeof values[key] === 'number') sla[key] = values[key] as number;
  // Sin la 0096 no existe: queda el de siempre.
  const priceFactor =
    typeof values.review_price_factor === 'number' ? values.review_price_factor : DEFAULT_PRICE_FACTOR;
  return { sla, priceFactor, meta };
}

export async function saveSla(changes: Partial<SlaHours>): Promise<void> {
  await saveSettings(changes, SLA_LABELS, '0095');
}

/** Mismas reglas que `admin_update_settings`: enteros de 1 a 720 y de menor a mayor. */
export function validateSla(sla: SlaHours): Partial<Record<SlaKey, string>> {
  const errors: Partial<Record<SlaKey, string>> = {};
  for (const key of SLA_KEYS) {
    const value = sla[key];
    if (!Number.isInteger(value)) errors[key] = 'Tiene que ser un número entero de horas.';
    else if (value < SLA_RANGE.min || value > SLA_RANGE.max) {
      errors[key] = `Tiene que estar entre ${SLA_RANGE.min} y ${SLA_RANGE.max} horas.`;
    }
  }
  if (!errors.review_sla_warn_hours && !errors.review_sla_info_hours && sla.review_sla_warn_hours <= sla.review_sla_info_hours) {
    errors.review_sla_warn_hours = 'Tiene que ser mayor que el plazo de azul.';
  }
  if (!errors.review_sla_danger_hours && !errors.review_sla_warn_hours && sla.review_sla_danger_hours <= sla.review_sla_warn_hours) {
    errors.review_sla_danger_hours = 'Tiene que ser mayor que el plazo de amarillo.';
  }
  return errors;
}

export function changedSla(saved: SlaHours, draft: SlaHours): Partial<SlaHours> {
  const changes: Partial<SlaHours> = {};
  for (const key of SLA_KEYS) if (saved[key] !== draft[key]) changes[key] = draft[key];
  return changes;
}

// ── Control de tarifa (0096) ──────────────────────────────────────────────────────────────

/** El control automático de tarifa avisa si se aparta más de este factor de la mediana. */
export const DEFAULT_PRICE_FACTOR = 2;
export const PRICE_FACTOR_RANGE = { min: 2, max: 10 };

export async function savePriceFactor(value: number): Promise<void> {
  await saveSettings({ review_price_factor: value }, { review_price_factor: 'Control de tarifa' }, '0096');
}

/** "36 h" o, si son días justos, "2 días" (y "1 día"). */
export function formatHours(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? 'día' : 'días'}`;
  }
  return `${hours} h`;
}
