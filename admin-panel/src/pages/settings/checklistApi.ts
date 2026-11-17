/**
 * Checklist de aprobación configurable (migración 0092). Los puntos viven en
 * `review_checklist_items` (solo el equipo los ve y los edita, por RLS) y la RPC de aprobación
 * exige los obligatorios que corresponden a cada publicación.
 */

import { supabase } from '../../lib/supabase';
import type { LotType } from '../../domain';

/** A qué tipo de lugar se aplica un punto. */
export type ChecklistLotType = 'all' | LotType;
/** En qué momento: siempre, solo en altas nuevas o solo en ediciones de una ya aprobada. */
export type ChecklistMoment = 'always' | 'new' | 'edit';

/** Campos de una publicación que pueden cambiar en una edición (0096). Mismos códigos que
 *  `ListingChange.field` y que `lot_review_changes` en SQL. */
export const CHECKLIST_CHANGE_FIELDS = [
  'name',
  'description',
  'address',
  'location',
  'price',
  'capacity',
  'amenities',
  'photos',
  'lot_type',
] as const;
export type ChecklistChangeField = (typeof CHECKLIST_CHANGE_FIELDS)[number];

export const CHECKLIST_CHANGE_FIELD_LABELS: Record<ChecklistChangeField, string> = {
  name: 'Nombre',
  description: 'Descripción',
  address: 'Dirección',
  location: 'Ubicación en el mapa',
  price: 'Tarifa',
  capacity: 'Capacidad',
  amenities: 'Servicios',
  photos: 'Fotos',
  lot_type: 'Tipo de lugar',
};

/** Control automático que el panel muestra junto al punto (0096). No tilda ni bloquea. */
export type AutoCheck = 'photos' | 'contact_info' | 'price';

export const AUTO_CHECK_LABELS: Record<AutoCheck, string> = {
  photos: 'Fotos: cantidad y límite',
  contact_info: 'Datos de contacto en la descripción',
  price: 'Tarifa comparada con cocheras parecidas',
};

export type ChecklistItem = {
  id: string;
  label: string;
  help: string | null;
  required: boolean;
  appliesLotType: ChecklistLotType;
  appliesTo: ChecklistMoment;
  /** Solo mientras la titularidad no esté verificada (hay documentos que mirar). */
  needsDocuments: boolean;
  /** En una edición, solo si cambió alguno de estos campos. Vacío = siempre (0096). */
  appliesWhenChanged: ChecklistChangeField[];
  autoCheck: AutoCheck | null;
  position: number;
  isActive: boolean;
  updatedAt: string;
};

export type ChecklistItemInput = Pick<
  ChecklistItem,
  'label' | 'help' | 'required' | 'appliesLotType' | 'appliesTo' | 'needsDocuments' | 'appliesWhenChanged' | 'autoCheck' | 'isActive'
>;

export const CHECKLIST_LOT_TYPE_LABELS: Record<ChecklistLotType, string> = {
  all: 'Todos los lugares',
  house: 'Solo cocheras de casa',
  lot: 'Solo estacionamientos',
};

export const CHECKLIST_MOMENT_LABELS: Record<ChecklistMoment, string> = {
  always: 'Altas y ediciones',
  new: 'Solo altas nuevas',
  edit: 'Solo ediciones de una aprobada',
};

type ItemRow = {
  id: string;
  label: string;
  help: string | null;
  required: boolean;
  applies_lot_type: ChecklistLotType;
  applies_to: ChecklistMoment;
  needs_documents: boolean;
  applies_when_changed: ChecklistChangeField[] | null;
  auto_check: AutoCheck | null;
  position: number;
  is_active: boolean;
  updated_at: string;
};

const LEGACY_COLUMNS =
  'id, label, help, required, applies_lot_type, applies_to, needs_documents, position, is_active, updated_at';
const COLUMNS = `${LEGACY_COLUMNS}, applies_when_changed, auto_check`;

function toItem(row: ItemRow): ChecklistItem {
  return {
    id: row.id,
    label: row.label,
    help: row.help,
    required: row.required,
    appliesLotType: row.applies_lot_type,
    appliesTo: row.applies_to,
    needsDocuments: row.needs_documents,
    appliesWhenChanged: row.applies_when_changed ?? [],
    autoCheck: row.auto_check ?? null,
    position: row.position,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

function toRow(input: Partial<ChecklistItemInput>) {
  return {
    ...(input.label !== undefined ? { label: input.label.trim() } : {}),
    ...(input.help !== undefined ? { help: input.help?.trim() ? input.help.trim() : null } : {}),
    ...(input.required !== undefined ? { required: input.required } : {}),
    ...(input.appliesLotType !== undefined ? { applies_lot_type: input.appliesLotType } : {}),
    ...(input.appliesTo !== undefined ? { applies_to: input.appliesTo } : {}),
    ...(input.needsDocuments !== undefined ? { needs_documents: input.needsDocuments } : {}),
    ...(input.appliesWhenChanged !== undefined ? { applies_when_changed: input.appliesWhenChanged } : {}),
    ...(input.autoCheck !== undefined ? { auto_check: input.autoCheck } : {}),
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  };
}

function client() {
  if (!supabase) throw new Error('Supabase no está configurado (falta el .env del panel).');
  return supabase;
}

/** Error al guardar, con la migración que falta si es por las columnas de la 0096. */
function failSave(error: { message: string }): never {
  if (error.message.includes('applies_when_changed') || error.message.includes('auto_check')) {
    throw new Error('Falta correr la migración 0096 en Supabase para guardar "solo si cambió" y los controles.');
  }
  throw new Error(error.message);
}

/** Todos los puntos (activos e inactivos), en el orden en que se muestran. */
export async function fetchChecklistItems(): Promise<ChecklistItem[]> {
  const { data, error } = await client()
    .from('review_checklist_items')
    .select(COLUMNS)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .returns<ItemRow[]>();
  if (error) {
    // Sin la 0096 faltan las columnas nuevas: se leen las de la 0092 (los puntos se aplican como
    // antes), así la revisión de Inventario sigue funcionando hasta que se corra.
    if (error.message.includes('applies_when_changed') || error.message.includes('auto_check')) {
      const legacy = await client()
        .from('review_checklist_items')
        .select(LEGACY_COLUMNS)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
        .returns<ItemRow[]>();
      if (legacy.error) throw new Error(legacy.error.message);
      return (legacy.data ?? []).map(toItem);
    }
    throw new Error(error.message);
  }
  return (data ?? []).map(toItem);
}

/** Agrega un punto al final de la lista. */
export async function createChecklistItem(input: ChecklistItemInput, items: ChecklistItem[]): Promise<void> {
  const position = items.reduce((max, item) => Math.max(max, item.position), 0) + 10;
  const { error } = await client()
    .from('review_checklist_items')
    .insert({ ...toRow(input), position });
  if (error) failSave(error);
}

export async function updateChecklistItem(id: string, input: Partial<ChecklistItemInput>): Promise<void> {
  const { error } = await client().from('review_checklist_items').update(toRow(input)).eq('id', id);
  if (error) failSave(error);
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const { error } = await client().from('review_checklist_items').delete().eq('id', id);
  if (error) throw error;
}

/** Intercambia el lugar de dos puntos (subir / bajar). */
export async function swapChecklistItems(a: ChecklistItem, b: ChecklistItem): Promise<void> {
  // Si comparten posición (cargados a mano), se separan para que el cambio se note.
  const aPosition = a.position === b.position ? b.position + 1 : b.position;
  const db = client();
  const [first, second] = await Promise.all([
    db.from('review_checklist_items').update({ position: aPosition }).eq('id', a.id),
    db.from('review_checklist_items').update({ position: a.position }).eq('id', b.id),
  ]);
  if (first.error) throw first.error;
  if (second.error) throw second.error;
}

/**
 * Los puntos que corresponden a una publicación. MISMA regla que `lot_checklist_items` en SQL
 * (0092 y 0096): si se cambia una, hay que cambiar la otra. El servidor es el que la hace cumplir.
 * `changedFields`: qué cambió desde la última aprobación; null = alta nueva (se revisa todo).
 */
export function itemsForLot(
  items: ChecklistItem[],
  lot: {
    lotType: LotType;
    isEdit: boolean;
    ownershipVerified: boolean;
    /** Subió algún documento de titularidad (0097: sin documentos, no hay nada que mirar). */
    hasDocuments: boolean;
    changedFields: readonly string[] | null;
  }
): ChecklistItem[] {
  return items.filter(
    (item) =>
      item.isActive &&
      (item.appliesLotType === 'all' || item.appliesLotType === lot.lotType) &&
      (item.appliesTo === 'always' || (item.appliesTo === 'edit') === lot.isEdit) &&
      (!item.needsDocuments || (!lot.ownershipVerified && lot.hasDocuments)) &&
      (item.appliesWhenChanged.length === 0 ||
        lot.changedFields === null ||
        item.appliesWhenChanged.some((field) => lot.changedFields!.includes(field)))
  );
}

/* ---------------------------------------------------------------- Constancia de aprobaciones */

export type ReviewCheck = {
  lotId: string;
  at: string;
  items: Array<{ id: string; label: string; required: boolean; checked: boolean }>;
};

/** Constancias de aprobación (qué se tildó) de esas cocheras, más nuevas primero. */
export async function fetchReviewChecks(lotIds: string[]): Promise<ReviewCheck[]> {
  if (lotIds.length === 0) return [];
  const { data, error } = await client()
    .from('listing_review_checks')
    .select('parking_lot_id, items, created_at')
    .in('parking_lot_id', lotIds)
    .order('created_at', { ascending: false })
    .returns<Array<{ parking_lot_id: string; items: ReviewCheck['items']; created_at: string }>>();
  if (error) throw error;
  return (data ?? []).map((row) => ({ lotId: row.parking_lot_id, at: row.created_at, items: row.items ?? [] }));
}
