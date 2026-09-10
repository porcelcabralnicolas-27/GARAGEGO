/**
 * Datos REALES de Supabase para toda la sección Inventario (además del login).
 *
 * Cubre las dos pestañas: "Aprobaciones" (revisión de altas) y "Cocheras publicadas"
 * (pausar / suspender / reactivar). Trae las publicaciones con dueños, fotos y estadísticas de
 * reservas, y expone las tres acciones de moderación como RPC.
 *
 * Depende de las migraciones:
 *   - 0034  → la policy de lectura deja al admin ver cocheras no aprobadas y sus fotos;
 *   - 0035  → `admin_review_parking_lot`, `admin_set_parking_lot_moderation` (validan admin);
 *   - 0039  → `admin_lot_stats` (agregados de `bookings`, que el admin no puede leer directo).
 *
 * Lo único que sigue sin poder traerse:
 *   - email del propietario → vive en `auth.users`, ilegible con la anon key (README pto. 5).
 */

import { supabase } from '../../lib/supabase';
import type { AdminParkingLot, AdminProfile, ApprovalStatus, LotRow, ModerationState } from '../../domain';

const STORAGE_BUCKET = 'parking-images';

export type ReviewDecision = Exclude<ApprovalStatus, 'pending'>;

type LotStatsRow = {
  lot_id: string;
  bookings_30d: number;
  upcoming_bookings: number;
  has_active_session: boolean;
};

type ParkingLotRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  address: string;
  latitude: number;
  longitude: number;
  price_per_hour: number;
  rating_avg: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  approval_status: ApprovalStatus;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  moderation_state: ModerationState;
  pause_reason: string | null;
  suspended_until: string | null;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  active_role: 'client' | 'owner';
  is_owner_enabled: boolean;
  created_at: string;
};

function toAdminLot(row: ParkingLotRow): AdminParkingLot {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    pricePerHour: row.price_per_hour,
    ratingAvg: row.rating_avg,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvalStatus: row.approval_status,
    // No hay `submitted_at` en la base: el alta se envía a revisión al crearse.
    submittedAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    rejectionReason: row.rejection_reason,
    moderationState: row.moderation_state,
    pauseReason: row.pause_reason,
    suspendedUntil: row.suspended_until,
  };
}

function toAdminProfile(row: ProfileRow): AdminProfile {
  return {
    id: row.id,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    phone: row.phone,
    avatarUrl: row.avatar_url,
    activeRole: row.active_role,
    isOwnerEnabled: row.is_owner_enabled,
    createdAt: row.created_at,
    email: '', // no legible con la anon key
  };
}

/** Trae todas las publicaciones para la cola de moderación, ya convertidas a `LotRow`. */
export async function fetchModerationLots(): Promise<LotRow[]> {
  if (!supabase) throw new Error('Supabase no está configurado (falta el .env del panel).');

  const { data: lots, error } = await supabase
    .from('parking_lots')
    .select(
      'id, owner_id, name, description, address, latitude, longitude, price_per_hour, rating_avg, is_active, created_at, updated_at, approval_status, rejection_reason, reviewed_at, reviewed_by, moderation_state, pause_reason, suspended_until'
    )
    .order('created_at', { ascending: true })
    .returns<ParkingLotRow[]>();
  if (error) throw error;
  if (!lots || lots.length === 0) return [];

  const ownerIds = [...new Set(lots.map((l) => l.owner_id))];
  const lotIds = lots.map((l) => l.id);

  const [ownersRes, imagesRes, statsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, first_name, last_name, phone, avatar_url, active_role, is_owner_enabled, created_at')
      .in('id', ownerIds)
      .returns<ProfileRow[]>(),
    supabase
      .from('parking_images')
      .select('parking_lot_id, storage_path, position')
      .in('parking_lot_id', lotIds)
      .order('position', { ascending: true })
      .returns<{ parking_lot_id: string; storage_path: string; position: number }[]>(),
    supabase.rpc('admin_lot_stats'),
  ]);
  if (ownersRes.error) throw ownersRes.error;
  if (imagesRes.error) throw imagesRes.error;
  // Las estadísticas no son fatales: si falta la migración 0039, "Aprobaciones" igual anda y
  // "Cocheras publicadas" muestra los contadores en cero.
  if (statsRes.error) console.warn('admin_lot_stats no disponible:', statsRes.error.message);

  const ownerById = new Map((ownersRes.data ?? []).map((o) => [o.id, toAdminProfile(o)]));
  const statsByLot = new Map(
    ((statsRes.data ?? []) as LotStatsRow[]).map((s) => [s.lot_id, s])
  );

  const imagesByLot = new Map<string, string[]>();
  for (const img of imagesRes.data ?? []) {
    const { publicUrl } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(img.storage_path).data;
    const list = imagesByLot.get(img.parking_lot_id) ?? [];
    list.push(publicUrl);
    imagesByLot.set(img.parking_lot_id, list);
  }

  const now = Date.now();
  return lots.map((row) => {
    const lot = toAdminLot(row);
    const stats = statsByLot.get(row.id);
    return {
      lot,
      owner: ownerById.get(row.owner_id),
      images: imagesByLot.get(row.id) ?? [],
      ageHours: (now - new Date(lot.submittedAt).getTime()) / 3_600_000,
      hasActiveSession: stats?.has_active_session ?? false,
      upcomingBookings: stats?.upcoming_bookings ?? 0,
      bookings30d: stats?.bookings_30d ?? 0,
    } satisfies LotRow;
  });
}

/** Aprueba / rechaza / pide cambios. `reason` es obligatorio salvo al aprobar. */
export async function reviewLot(
  lotId: string,
  decision: ReviewDecision,
  reason: string | null
): Promise<void> {
  if (!supabase) throw new Error('Supabase no está configurado (falta el .env del panel).');

  const { error } = await supabase.rpc('admin_review_parking_lot', {
    p_lot_id: lotId,
    p_decision: decision,
    p_reason: reason,
  });
  if (error) throw error;
}

/**
 * Palanca operativa sobre una cochera ya aprobada.
 *   live            → vuelve a la búsqueda
 *   paused_by_admin → fuera de la búsqueda, con motivo
 *   suspended       → fuera de la búsqueda, con motivo y (opcional) fecha de reanudación
 * `reason` es obligatorio salvo para `live`.
 */
export async function setLotModeration(
  lotId: string,
  state: ModerationState,
  reason: string | null,
  until: string | null
): Promise<void> {
  if (!supabase) throw new Error('Supabase no está configurado (falta el .env del panel).');

  const { error } = await supabase.rpc('admin_set_parking_lot_moderation', {
    p_lot_id: lotId,
    p_state: state,
    p_reason: reason,
    p_until: until,
  });
  if (error) throw error;
}
