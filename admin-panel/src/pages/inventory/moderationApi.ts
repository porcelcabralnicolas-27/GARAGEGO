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
import type {
  AdminParkingLot,
  AdminProfile,
  Amenity,
  ApprovalStatus,
  DocumentKind,
  HolderRole,
  ListingChangeField,
  LotRow,
  LotType,
  ModerationState,
} from '../../domain';

const STORAGE_BUCKET = 'parking-images';
// Documentos de titularidad (0078): bucket privado. El admin los lee con URLs firmadas que vencen.
const DOCS_BUCKET = 'ownership-docs';
const DOCS_URL_TTL_SECONDS = 60 * 60;

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
  capacity: number;
  amenities: string[];
  lot_type: LotType;
  holder_role: HolderRole;
  rating_avg: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  approval_status: ApprovalStatus;
  rejection_reason: string | null;
  requested_changes: string[] | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  moderation_state: ModerationState;
  pause_reason: string | null;
  suspended_until: string | null;
  archived_at: string | null;
  ownership_verified_at: string | null;
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
    capacity: row.capacity,
    // El check de la 0065 garantiza que solo vengan códigos conocidos.
    amenities: row.amenities as Amenity[],
    lotType: row.lot_type ?? 'lot',
    holderRole: row.holder_role ?? 'owner',
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
    requestedChanges: (row.requested_changes ?? []) as ListingChangeField[],
    moderationState: row.moderation_state,
    pauseReason: row.pause_reason,
    suspendedUntil: row.suspended_until,
    archivedAt: row.archived_at,
    ownershipVerifiedAt: row.ownership_verified_at,
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
      'id, owner_id, name, description, address, latitude, longitude, price_per_hour, capacity, amenities, lot_type, holder_role, rating_avg, is_active, created_at, updated_at, approval_status, rejection_reason, requested_changes, reviewed_at, reviewed_by, moderation_state, pause_reason, suspended_until, archived_at, ownership_verified_at'
    )
    .order('created_at', { ascending: true })
    .returns<ParkingLotRow[]>();
  if (error) throw error;
  if (!lots || lots.length === 0) return [];

  const ownerIds = [...new Set(lots.map((l) => l.owner_id))];
  const lotIds = lots.map((l) => l.id);
  // Los documentos solo se firman para lo que está en revisión: es donde se usan. Los de una
  // publicación ya decidida no deberían existir (se borran al decidir): si quedó alguno, se barre
  // más abajo.
  const inReview = new Set(
    lots
      .filter((l) => l.approval_status === 'pending' || l.approval_status === 'changes_requested')
      .map((l) => l.id)
  );
  const statusByLot = new Map(lots.map((l) => [l.id, l.approval_status]));

  const [ownersRes, imagesRes, statsRes, docsRes] = await Promise.all([
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
    supabase
      .from('parking_lot_documents')
      .select('id, parking_lot_id, kind, storage_path')
      .in('parking_lot_id', lotIds)
      .returns<DocumentRow[]>(),
  ]);
  if (ownersRes.error) throw ownersRes.error;
  if (imagesRes.error) throw imagesRes.error;
  // Sin la migración 0078 la tabla no existe: la cola igual anda, sin la sección de titularidad.
  if (docsRes.error) console.warn('parking_lot_documents no disponible:', docsRes.error.message);
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

  const allDocRows = docsRes.error ? [] : (docsRes.data ?? []);

  // Red de seguridad: documentos de publicaciones ya aprobadas o rechazadas que no se alcanzaron a
  // borrar (por ejemplo, se cortó la conexión justo después de decidir). Se reintenta sin avisar.
  const leftovers = allDocRows.filter((d) => {
    const status = statusByLot.get(d.parking_lot_id);
    return status === 'approved' || status === 'rejected';
  });
  if (leftovers.length > 0) {
    void purgeDocumentRows(leftovers).catch((err) =>
      console.warn('No se pudieron borrar documentos pendientes:', err)
    );
  }

  // URLs firmadas de los documentos en revisión, en una sola llamada.
  const docRows = allDocRows.filter((d) => inReview.has(d.parking_lot_id));
  const signedByPath = new Map<string, string>();
  if (docRows.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(DOCS_BUCKET)
      .createSignedUrls(
        docRows.map((d) => d.storage_path),
        DOCS_URL_TTL_SECONDS
      );
    if (signError) console.warn('No se pudieron firmar los documentos:', signError.message);
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
    }
  }
  const docsByLot = new Map<string, Array<{ kind: DocumentKind; url: string }>>();
  for (const doc of docRows) {
    const url = signedByPath.get(doc.storage_path);
    if (!url) continue;
    const list = docsByLot.get(doc.parking_lot_id) ?? [];
    list.push({ kind: doc.kind, url });
    docsByLot.set(doc.parking_lot_id, list);
  }

  const now = Date.now();
  return lots.map((row) => {
    const lot = toAdminLot(row);
    const stats = statsByLot.get(row.id);
    return {
      lot,
      owner: ownerById.get(row.owner_id),
      images: imagesByLot.get(row.id) ?? [],
      documents: docsByLot.get(row.id) ?? [],
      ageHours: (now - new Date(lot.submittedAt).getTime()) / 3_600_000,
      hasActiveSession: stats?.has_active_session ?? false,
      upcomingBookings: stats?.upcoming_bookings ?? 0,
      bookings30d: stats?.bookings_30d ?? 0,
    } satisfies LotRow;
  });
}

type DocumentRow = { id: string; parking_lot_id: string; kind: DocumentKind; storage_path: string };

/**
 * Borra de verdad los documentos de titularidad: primero los archivos del bucket y después sus
 * filas (migración 0079). Borrar las filas de `storage.objects` con SQL no alcanza, hay que usar la
 * API de Storage, y por eso lo hace el panel.
 */
async function purgeDocumentRows(rows: Pick<DocumentRow, 'id' | 'storage_path'>[]): Promise<void> {
  if (!supabase || rows.length === 0) return;
  const paths = rows.map((row) => row.storage_path);

  const { error: removeError } = await supabase.storage.from(DOCS_BUCKET).remove(paths);
  if (removeError) throw removeError;

  // `remove` no avisa si una policy le impidió borrar algo: se comprueba que ya no se puedan abrir.
  const { data: stillThere } = await supabase.storage.from(DOCS_BUCKET).createSignedUrls(paths, 10);
  if ((stillThere ?? []).some((item) => item.signedUrl && !item.error)) {
    throw new Error('No se pudieron borrar los archivos de los documentos.');
  }

  const { error } = await supabase
    .from('parking_lot_documents')
    .delete()
    .in(
      'id',
      rows.map((row) => row.id)
    );
  if (error) throw error;
}

/** Borra todos los documentos de una publicación. No hace nada si no tiene. */
async function purgeLotDocuments(lotId: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('parking_lot_documents')
    .select('id, storage_path')
    .eq('parking_lot_id', lotId);
  if (error) throw error;
  await purgeDocumentRows(data ?? []);
}

/**
 * Aprueba / rechaza / pide cambios. `reason` es obligatorio salvo al aprobar. Al pedir cambios,
 * `fields` son los campos que el propietario tiene que modificar: el servidor los guarda y, al
 * reenviar, verifica que realmente cambiaron (migración 0072).
 *
 * Al aprobar o rechazar se borran los documentos de titularidad (0079): ya cumplieron su función y
 * son datos sensibles. Con "Pedir cambios" se conservan, porque el propietario tiene que reenviar.
 * Devuelve `documentsPending: true` si la decisión se tomó pero el borrado falló: se reintenta
 * solo la próxima vez que se carga la cola.
 */
export async function reviewLot(
  lotId: string,
  decision: ReviewDecision,
  reason: string | null,
  fields: ListingChangeField[] | null = null
): Promise<{ documentsPending: boolean }> {
  if (!supabase) throw new Error('Supabase no está configurado (falta el .env del panel).');

  const { error } = await supabase.rpc('admin_review_parking_lot', {
    p_lot_id: lotId,
    p_decision: decision,
    p_reason: reason,
    p_fields: decision === 'changes_requested' ? fields : null,
  });
  if (error) throw error;

  if (decision === 'changes_requested') return { documentsPending: false };
  try {
    await purgeLotDocuments(lotId);
    return { documentsPending: false };
  } catch (err) {
    console.warn('No se pudieron borrar los documentos de la publicación:', err);
    return { documentsPending: true };
  }
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
