// Catálogos que el equipo configura desde el panel (Configuración → Catálogos, migración 0094):
// servicios de las cocheras y categorías de los tickets de soporte.
//
// La base hace cumplir las reglas (un servicio que se agrega tiene que estar activo; un ticket se
// abre con una categoría activa de su rol); la app lee los catálogos con `public_catalogs()` para
// mostrar los nombres y ofrecer solo lo que corresponde. Como `appLimits`, el valor vigente vive
// en un estado de módulo y las pantallas usan `useCatalogs()`.
//
// Si la consulta falla (sin conexión, migración sin correr), se usan las listas de antes de la 0094.

import { AMENITY_LABELS, TICKET_CATEGORY_LABELS } from '../../shared/domain';
import { t } from '@/lib/i18n';
import { activeRegion } from '@/lib/region';
import { supabase } from '@/lib/supabase/client';

export type AmenityEntry = {
  code: string;
  label: string;
  labelEn: string | null;
  /** Nombre base de un ícono de Ionicons; se dibuja la variante `-outline`. */
  icon: string;
  isActive: boolean;
};

export type TicketCategoryEntry = {
  code: string;
  label: string;
  forClient: boolean;
  forOwner: boolean;
  isActive: boolean;
};

export type Catalogs = {
  amenities: AmenityEntry[];
  ticketCategories: TicketCategoryEntry[];
};

const DEFAULT_ICONS: Record<string, string> = {
  cameras: 'videocam',
  security_staff: 'shield-checkmark',
  lighting: 'bulb',
  ev_charger: 'flash',
  restrooms: 'water',
};

/** Para quién eran las categorías de siempre (antes, TICKET_CATEGORIES_BY_ROLE). */
const DEFAULT_ROLES: Record<string, { forClient: boolean; forOwner: boolean }> = {
  access: { forClient: true, forOwner: false },
  listing: { forClient: false, forOwner: true },
};

export const DEFAULT_CATALOGS: Catalogs = {
  amenities: Object.entries(AMENITY_LABELS).map(([code, label]) => ({
    code,
    label,
    labelEn: null,
    icon: DEFAULT_ICONS[code] ?? 'checkmark-circle',
    isActive: true,
  })),
  // El orden de siempre en la app: las específicas del rol primero.
  ticketCategories: ['access', 'listing', 'payment', 'behavior', 'other'].map((code) => ({
    code,
    label: TICKET_CATEGORY_LABELS[code],
    forClient: DEFAULT_ROLES[code]?.forClient ?? true,
    forOwner: DEFAULT_ROLES[code]?.forOwner ?? true,
    isActive: true,
  })),
};

let current: Catalogs = DEFAULT_CATALOGS;

export function catalogs(): Catalogs {
  return current;
}

export function setCatalogs(next: Catalogs): void {
  current = next;
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

/** Convierte lo que devuelve `public_catalogs()`. Una lista vacía o rara cae a la de siempre. */
export function parseCatalogs(raw: unknown): Catalogs {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rows = (value: unknown) =>
    Array.isArray(value) ? value.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') : [];

  const amenities: AmenityEntry[] = rows(data.amenities)
    .filter((r) => str(r.code) && str(r.label))
    .map((r) => ({
      code: r.code as string,
      label: r.label as string,
      labelEn: str(r.label_en),
      icon: str(r.icon) ?? 'checkmark-circle',
      isActive: r.is_active !== false,
    }));

  const ticketCategories: TicketCategoryEntry[] = rows(data.ticket_categories)
    .filter((r) => str(r.code) && str(r.label))
    .map((r) => ({
      code: r.code as string,
      label: r.label as string,
      forClient: r.for_client === true,
      forOwner: r.for_owner === true,
      isActive: r.is_active !== false,
    }));

  return {
    amenities: amenities.length > 0 ? amenities : DEFAULT_CATALOGS.amenities,
    ticketCategories: ticketCategories.length > 0 ? ticketCategories : DEFAULT_CATALOGS.ticketCategories,
  };
}

/** Trae los catálogos, los deja como vigentes y los devuelve. */
export async function fetchCatalogs(): Promise<Catalogs> {
  const { data, error } = await supabase.rpc('public_catalogs');
  if (error) throw error;
  const next = parseCatalogs(data);
  setCatalogs(next);
  return next;
}

// ── Ayudas para las pantallas ───────────────────────────────────────────────────────────────

/** Nombre del servicio en el idioma de la región. En inglés, si el equipo no lo tradujo, se
 *  intenta con la traducción de la app (las de siempre la tienen) y si no, queda en castellano. */
export function amenityName(entry: AmenityEntry): string {
  if (activeRegion().language === 'en') return entry.labelEn ?? t(entry.label);
  return entry.label;
}

/** Servicios de una cochera, en el orden del catálogo. Un código que ya no existe se muestra igual
 *  (con su código como nombre), así no desaparece de la ficha. */
export function amenitiesOf(codes: string[], list: AmenityEntry[] = current.amenities): AmenityEntry[] {
  const known = list.filter((entry) => codes.includes(entry.code));
  const unknown = codes
    .filter((code) => !list.some((entry) => entry.code === code))
    .map((code) => ({ code, label: code, labelEn: null, icon: 'checkmark-circle', isActive: false }));
  return [...known, ...unknown];
}

/** Lo que se puede marcar al publicar o editar: los activos, más los que la cochera ya tenía. */
export function amenityOptions(selected: string[], list: AmenityEntry[] = current.amenities): AmenityEntry[] {
  return list.filter((entry) => entry.isActive || selected.includes(entry.code));
}

/** Categorías para abrir un ticket con ese rol (solo activas). */
export function ticketCategoriesFor(
  role: 'client' | 'owner',
  list: TicketCategoryEntry[] = current.ticketCategories
): TicketCategoryEntry[] {
  return list.filter((entry) => entry.isActive && (role === 'client' ? entry.forClient : entry.forOwner));
}

/** Nombre de una categoría (activa o no); si el código ya no existe, el código tal cual. */
export function ticketCategoryName(code: string, list: TicketCategoryEntry[] = current.ticketCategories): string {
  return list.find((entry) => entry.code === code)?.label ?? code;
}
