/**
 * Catálogos configurables (migración 0094): servicios de las cocheras (`parking_amenities`) y
 * categorías de los tickets (`ticket_categories`). El equipo los lee y edita por RLS; borrar va por
 * la RPC `admin_delete_catalog_item`, que no deja borrar algo en uso. El código de cada ítem lo
 * genera la base a partir del nombre y no cambia.
 */

import { AMENITY_LABELS, TICKET_CATEGORY_LABELS } from '../../domain';
import { supabase } from '../../lib/supabase';

/** Íconos permitidos (los mismos del check de la 0094). En la app son íconos de Ionicons
 *  (`<nombre>-outline`); acá se muestran con un emoji parecido y un nombre. */
export const AMENITY_ICONS = {
  videocam: { emoji: '📹', label: 'Cámara' },
  'shield-checkmark': { emoji: '🛡️', label: 'Escudo' },
  bulb: { emoji: '💡', label: 'Lamparita' },
  flash: { emoji: '⚡', label: 'Rayo' },
  water: { emoji: '💧', label: 'Agua' },
  'lock-closed': { emoji: '🔒', label: 'Candado' },
  home: { emoji: '🏠', label: 'Casa' },
  accessibility: { emoji: '♿', label: 'Accesible' },
  wifi: { emoji: '📶', label: 'Wifi' },
  umbrella: { emoji: '☂️', label: 'Techado' },
  car: { emoji: '🚗', label: 'Auto' },
  bicycle: { emoji: '🚲', label: 'Bicicleta' },
  time: { emoji: '🕒', label: 'Reloj' },
  key: { emoji: '🔑', label: 'Llave' },
  person: { emoji: '🧍', label: 'Persona' },
  construct: { emoji: '🔧', label: 'Herramientas' },
  leaf: { emoji: '🍃', label: 'Hoja' },
  'checkmark-circle': { emoji: '✅', label: 'Tilde' },
} as const;

export type AmenityIcon = keyof typeof AMENITY_ICONS;
export const AMENITY_ICON_KEYS = Object.keys(AMENITY_ICONS) as AmenityIcon[];

export type AmenityItem = {
  code: string;
  label: string;
  labelEn: string | null;
  icon: AmenityIcon;
  position: number;
  isActive: boolean;
};

export type TicketCategoryItem = {
  code: string;
  label: string;
  forClient: boolean;
  forOwner: boolean;
  position: number;
  isActive: boolean;
};

export type CatalogName = 'amenities' | 'ticket_categories';

export type AmenityInput = Pick<AmenityItem, 'label' | 'labelEn' | 'icon' | 'isActive'>;
export type TicketCategoryInput = Pick<TicketCategoryItem, 'label' | 'forClient' | 'forOwner' | 'isActive'>;

const TABLES: Record<CatalogName, string> = {
  amenities: 'parking_amenities',
  ticket_categories: 'ticket_categories',
};

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.');
  return supabase;
}

/** Los errores de la base, en castellano. */
export function catalogErrorMessage(message: string): string {
  const inUse = message.match(/catalog_item_in_use: (\d+)/)?.[1];
  if (inUse) return `No se puede eliminar: lo usan ${inUse}. Desactivalo en su lugar.`;
  const role = message.match(/catalog_role_without_categories: (\w+)/)?.[1];
  if (role) {
    return `Tiene que quedar al menos una categoría activa para el ${role === 'client' ? 'conductor' : 'propietario'}.`;
  }
  if (message.includes('catalog_code_immutable')) return 'El código de un ítem no se puede cambiar.';
  if (message.includes('ticket_categories_some_role')) return 'Elegí al menos un rol: conductor o propietario.';
  if (message.includes('not_admin')) return 'Solo un admin puede cambiar los catálogos.';
  if (message.includes('parking_amenities') || message.includes('ticket_categories')) {
    return `${message} (¿está corrida la migración 0094?)`;
  }
  return message;
}

function fail(error: { message: string }): never {
  throw new Error(catalogErrorMessage(error.message));
}

export async function fetchAmenities(): Promise<AmenityItem[]> {
  const { data, error } = await client()
    .from('parking_amenities')
    .select('code, label, label_en, icon, position, is_active')
    .order('position')
    .order('created_at');
  if (error) fail(error);
  return (data ?? []).map((row) => ({
    code: row.code as string,
    label: row.label as string,
    labelEn: (row.label_en as string | null) ?? null,
    icon: row.icon as AmenityIcon,
    position: row.position as number,
    isActive: row.is_active as boolean,
  }));
}

export async function fetchTicketCategories(): Promise<TicketCategoryItem[]> {
  const { data, error } = await client()
    .from('ticket_categories')
    .select('code, label, for_client, for_owner, position, is_active')
    .order('position')
    .order('created_at');
  if (error) fail(error);
  return (data ?? []).map((row) => ({
    code: row.code as string,
    label: row.label as string,
    forClient: row.for_client as boolean,
    forOwner: row.for_owner as boolean,
    position: row.position as number,
    isActive: row.is_active as boolean,
  }));
}

/** Cuántas cocheras (servicios) o tickets (categorías) usan cada ítem: `catalog:code` → usos. */
export async function fetchCatalogUsage(): Promise<Record<string, number>> {
  const { data, error } = await client().rpc('admin_catalog_usage');
  if (error) fail(error);
  const usage: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ catalog: string; code: string; uses: number }>) {
    usage[`${row.catalog}:${row.code}`] = Number(row.uses);
  }
  return usage;
}

const nextPosition = (items: Array<{ position: number }>) =>
  items.reduce((max, item) => Math.max(max, item.position), 0) + 10;

export async function createAmenity(input: AmenityInput, items: AmenityItem[]): Promise<void> {
  const { error } = await client().from('parking_amenities').insert({
    label: input.label.trim(),
    label_en: input.labelEn?.trim() ? input.labelEn.trim() : null,
    icon: input.icon,
    is_active: input.isActive,
    position: nextPosition(items),
  });
  if (error) fail(error);
}

export async function updateAmenity(code: string, input: Partial<AmenityInput>): Promise<void> {
  const row = {
    ...(input.label !== undefined ? { label: input.label.trim() } : {}),
    ...(input.labelEn !== undefined ? { label_en: input.labelEn?.trim() ? input.labelEn.trim() : null } : {}),
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  };
  const { error } = await client().from('parking_amenities').update(row).eq('code', code);
  if (error) fail(error);
}

export async function createTicketCategory(input: TicketCategoryInput, items: TicketCategoryItem[]): Promise<void> {
  const { error } = await client().from('ticket_categories').insert({
    label: input.label.trim(),
    for_client: input.forClient,
    for_owner: input.forOwner,
    is_active: input.isActive,
    position: nextPosition(items),
  });
  if (error) fail(error);
}

export async function updateTicketCategory(code: string, input: Partial<TicketCategoryInput>): Promise<void> {
  const row = {
    ...(input.label !== undefined ? { label: input.label.trim() } : {}),
    ...(input.forClient !== undefined ? { for_client: input.forClient } : {}),
    ...(input.forOwner !== undefined ? { for_owner: input.forOwner } : {}),
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  };
  const { error } = await client().from('ticket_categories').update(row).eq('code', code);
  if (error) fail(error);
}

/** Intercambia el orden de dos ítems del mismo catálogo. */
export async function swapCatalogItems(
  catalog: CatalogName,
  a: { code: string; position: number },
  b: { code: string; position: number }
): Promise<void> {
  const table = TABLES[catalog];
  // Si quedaron con la misma posición, se separan para que el cambio se note.
  const [posA, posB] = a.position === b.position ? [b.position + 1, a.position] : [b.position, a.position];
  const first = await client().from(table).update({ position: posA }).eq('code', a.code);
  if (first.error) fail(first.error);
  const second = await client().from(table).update({ position: posB }).eq('code', b.code);
  if (second.error) fail(second.error);
}

export async function deleteCatalogItem(catalog: CatalogName, code: string): Promise<void> {
  const { error } = await client().rpc('admin_delete_catalog_item', { p_catalog: catalog, p_code: code });
  if (error) fail(error);
}

// ── Nombres para Inventario y Soporte ─────────────────────────────────────────────────────────

export type CatalogLabels = {
  amenities: Array<{ code: string; label: string; isActive: boolean }>;
  ticketCategories: Array<{ code: string; label: string; isActive: boolean }>;
};

/** Las listas de antes de la 0094: se usan si la migración no está corrida. */
export const FALLBACK_CATALOG_LABELS: CatalogLabels = {
  amenities: Object.entries(AMENITY_LABELS).map(([code, label]) => ({ code, label, isActive: true })),
  ticketCategories: Object.entries(TICKET_CATEGORY_LABELS).map(([code, label]) => ({ code, label, isActive: true })),
};

/** Nombres de los dos catálogos con `public_catalogs()`; si falla, las listas de antes. */
export async function fetchCatalogLabels(): Promise<CatalogLabels> {
  const { data, error } = await client().rpc('public_catalogs');
  if (error || !data) return FALLBACK_CATALOG_LABELS;
  const raw = data as {
    amenities?: Array<{ code: string; label: string; is_active: boolean }>;
    ticket_categories?: Array<{ code: string; label: string; is_active: boolean }>;
  };
  const map = (rows: Array<{ code: string; label: string; is_active: boolean }> | undefined) =>
    (rows ?? []).map((row) => ({ code: row.code, label: row.label, isActive: row.is_active }));
  const amenities = map(raw.amenities);
  const ticketCategories = map(raw.ticket_categories);
  return {
    amenities: amenities.length > 0 ? amenities : FALLBACK_CATALOG_LABELS.amenities,
    ticketCategories: ticketCategories.length > 0 ? ticketCategories : FALLBACK_CATALOG_LABELS.ticketCategories,
  };
}
