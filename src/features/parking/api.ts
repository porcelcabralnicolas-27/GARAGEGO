import { sanitizeErrorMessage } from '@/lib/errorMessages';
import { guessImageContentType } from '@/lib/imageMime';
import { toPage, type Page } from '@/lib/pagination';
import { supabase } from '@/lib/supabase/client';

import {
  MAX_PARKING_IMAGES,
  type ApprovalStatus,
  type AvailabilityException,
  type ModerationState,
  type ParkingImage,
  type ParkingLot,
  type ParkingLotWithDistance,
  type RecurringAvailability,
} from './types';

const STORAGE_BUCKET = 'parking-images';

function mapParkingLotRow(row: {
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
  // `search_parking_lots` (RPC) no devuelve estas columnas: sus filas ya están aprobadas y en
  // vivo por definición, así que se les asume el valor bueno. La capacidad no se usa en la
  // búsqueda; las pantallas que la muestran leen la cochera con getParkingLot.
  capacity?: number;
  approval_status?: ApprovalStatus;
  rejection_reason?: string | null;
  moderation_state?: ModerationState;
}): ParkingLot {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    pricePerHour: row.price_per_hour,
    capacity: row.capacity ?? 1,
    ratingAvg: row.rating_avg,
    isActive: row.is_active,
    createdAt: row.created_at,
    approvalStatus: row.approval_status ?? 'approved',
    rejectionReason: row.rejection_reason ?? null,
    moderationState: row.moderation_state ?? 'live',
  };
}

function toPublicUrl(storagePath: string): string {
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export type ParkingSearchFilters = {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  maxPrice?: number | null;
  minRating?: number | null;
};

export const SEARCH_PAGE_SIZE = 20;

/** Cursor de la búsqueda: el orden es (distancia, id) ascendente. */
export type SearchCursor = { distanceKm: number; id: string };

async function runSearch(filters: ParkingSearchFilters, limit: number, cursor: SearchCursor | null) {
  const { data, error } = await supabase.rpc('search_parking_lots', {
    p_lat: filters.latitude,
    p_lng: filters.longitude,
    p_radius_km: filters.radiusKm ?? 5,
    p_max_price: filters.maxPrice ?? null,
    p_min_rating: filters.minRating ?? null,
    p_limit: limit,
    p_cursor_distance: cursor?.distanceKm ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  if (error) throw error;
  return data.map((row): ParkingLotWithDistance => ({ ...mapParkingLotRow(row), distanceKm: row.distance_km }));
}

/**
 * Todas las cocheras cercanas de una vez, para los pines del mapa: el servidor corta en 200 y en
 * 25 km (0055/0059), que es lo que entra razonablemente en pantalla.
 */
export async function searchParkingLots(filters: ParkingSearchFilters): Promise<ParkingLotWithDistance[]> {
  return runSearch(filters, 200, null);
}

/** Una página de resultados, de la más cercana a la más lejana, para la lista de resultados. */
export async function searchParkingLotsPage(
  filters: ParkingSearchFilters,
  cursor: SearchCursor | null = null
): Promise<Page<ParkingLotWithDistance, SearchCursor>> {
  const items = await runSearch(filters, SEARCH_PAGE_SIZE, cursor);
  return toPage(items, SEARCH_PAGE_SIZE, (last) => ({ distanceKm: last.distanceKm, id: last.id }));
}

/** Nombre del propietario, para la ficha pública. Va aparte para pedirlo en paralelo con el lote. */
export async function getParkingLotOwnerName(parkingLotId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('parking_lot_owner_name', { p_parking_lot_id: parkingLotId });
  if (error) throw error;
  return data;
}

export async function listMyParkingLots(ownerId: string): Promise<ParkingLot[]> {
  const { data, error } = await supabase
    .from('parking_lots')
    .select('*')
    .eq('owner_id', ownerId)
    // Las archivadas (borradas con historial, ver deleteParkingLot) ya no se listan.
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data.map(mapParkingLotRow);
}

export async function getParkingLot(id: string): Promise<ParkingLot> {
  const { data, error } = await supabase.from('parking_lots').select('*').eq('id', id).single();
  if (error) throw error;
  return mapParkingLotRow(data);
}

export type ParkingLotInput = {
  name: string;
  description: string | null;
  address: string;
  latitude: number;
  longitude: number;
  pricePerHour: number;
  capacity: number;
};

export async function createParkingLot(
  ownerId: string,
  input: ParkingLotInput,
  // El asistente de publicación crea el lote como borrador (inactivo) en el primer paso y lo
  // activa recién al terminar, para que no aparezca en la búsqueda sin fotos ni horarios.
  options?: { isActive?: boolean }
): Promise<ParkingLot> {
  const { data, error } = await supabase
    .from('parking_lots')
    .insert({
      owner_id: ownerId,
      name: input.name,
      description: input.description,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      price_per_hour: input.pricePerHour,
      capacity: input.capacity,
      is_active: options?.isActive ?? true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapParkingLotRow(data);
}

export async function updateParkingLot(id: string, input: ParkingLotInput): Promise<ParkingLot> {
  const { data, error } = await supabase
    .from('parking_lots')
    .update({
      name: input.name,
      description: input.description,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      price_per_hour: input.pricePerHour,
      capacity: input.capacity,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return mapParkingLotRow(data);
}

export async function setParkingLotActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('parking_lots').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

/**
 * Reenvía a revisión una publicación que el equipo marcó con "cambios pedidos"
 * (`changes_requested`). El trigger `parking_lots_protect_moderation` (migraciones 0037/0038)
 * solo deja pasar esa transición a `pending` y limpia el motivo y la revisión anterior;
 * cualquier otro `approval_status` que mande el cliente se ignora — en particular, una
 * publicación `rejected` no vuelve nunca a la cola.
 */
export async function resubmitParkingLot(id: string): Promise<void> {
  const { error } = await supabase
    .from('parking_lots')
    .update({ approval_status: 'pending' })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Borra una cochera vía la RPC `delete_parking_lot` (0053):
 *  - con reservas vigentes falla con `lot_has_active_bookings`;
 *  - con historial se archiva (deja de listarse, pero sus reservas y fotos se conservan);
 *  - sin reservas se borra de verdad, y acá se limpian sus fotos del bucket.
 */
export async function deleteParkingLot(id: string): Promise<'deleted' | 'archived'> {
  // Las rutas se leen antes: si la cochera se borra, sus filas de parking_images se van en
  // cascada y ya no habría forma de saber qué archivos limpiar.
  const { data: images } = await supabase.from('parking_images').select('storage_path').eq('parking_lot_id', id);

  const { data, error } = await supabase.rpc('delete_parking_lot', { p_parking_lot_id: id });
  if (error) throw error;

  if (data === 'deleted' && images && images.length > 0) {
    // Mejor esfuerzo: si falla, queda un archivo huérfano pero la cochera ya está borrada.
    await supabase.storage.from(STORAGE_BUCKET).remove(images.map((img) => img.storage_path));
  }
  return data === 'archived' ? 'archived' : 'deleted';
}

export async function getCoverImageUrls(parkingLotIds: string[]): Promise<Record<string, string>> {
  if (parkingLotIds.length === 0) return {};
  const { data, error } = await supabase
    .from('parking_images')
    .select('parking_lot_id, storage_path, position')
    .in('parking_lot_id', parkingLotIds)
    .order('position', { ascending: true });
  if (error) throw error;

  const result: Record<string, string> = {};
  for (const row of data) {
    if (!result[row.parking_lot_id]) result[row.parking_lot_id] = toPublicUrl(row.storage_path);
  }
  return result;
}

export async function listParkingImages(parkingLotId: string): Promise<ParkingImage[]> {
  const { data, error } = await supabase
    .from('parking_images')
    .select('*')
    .eq('parking_lot_id', parkingLotId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    parkingLotId: row.parking_lot_id,
    storagePath: row.storage_path,
    publicUrl: toPublicUrl(row.storage_path),
    position: row.position,
  }));
}

export async function uploadParkingImage(params: {
  ownerId: string;
  parkingLotId: string;
  localUri: string;
  position: number;
}): Promise<ParkingImage> {
  const { extension, contentType } = guessImageContentType(params.localUri);
  const path = `${params.ownerId}/${params.parkingLotId}/${Date.now()}.${extension}`;

  // fetch + arrayBuffer funciona igual en web y nativo (a diferencia de expo-file-system, que no puede
  // leer los blob: URIs que devuelve el selector de imágenes en web).
  const response = await fetch(params.localUri);
  if (!response.ok) throw new Error(`No se pudo leer la imagen (${response.status}).`);
  const arrayBuffer = await response.arrayBuffer();
  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, arrayBuffer, { contentType });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('parking_images')
    .insert({ parking_lot_id: params.parkingLotId, storage_path: path, position: params.position })
    .select('*')
    .single();
  if (error) {
    // El archivo ya subió a Storage pero el registro no se pudo crear (por ejemplo, se llegó
    // al máximo de fotos): sin esto, quedaba un archivo huérfano que nadie referencia ni borra.
    await supabase.storage.from(STORAGE_BUCKET).remove([path]).catch(() => {});
    throw error;
  }

  return {
    id: data.id,
    parkingLotId: data.parking_lot_id,
    storagePath: data.storage_path,
    publicUrl: toPublicUrl(data.storage_path),
    position: data.position,
  };
}

export async function deleteParkingImage(image: { id: string; storagePath: string }): Promise<void> {
  const { error: dbError } = await supabase.from('parking_images').delete().eq('id', image.id);
  if (dbError) throw dbError;
  const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove([image.storagePath]);
  // El registro ya se borró (es lo que ve el usuario); si falla la limpieza del archivo, se
  // registra pero no se revierte el borrado — deshacerlo sería más confuso que un archivo
  // huérfano en el bucket.
  if (storageError) console.error('No se pudo borrar el archivo de la imagen de la cochera:', storageError);
}

export async function getRecurringAvailability(parkingLotId: string): Promise<RecurringAvailability[]> {
  const { data, error } = await supabase
    .from('parking_availability_recurring')
    .select('*')
    .eq('parking_lot_id', parkingLotId)
    .order('day_of_week', { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
  }));
}

export async function addRecurringAvailability(
  parkingLotId: string,
  entry: { dayOfWeek: number; startTime: string; endTime: string }
): Promise<RecurringAvailability> {
  const { data, error } = await supabase
    .from('parking_availability_recurring')
    .insert({ parking_lot_id: parkingLotId, day_of_week: entry.dayOfWeek, start_time: entry.startTime, end_time: entry.endTime })
    .select('*')
    .single();
  if (error) throw error;
  return { id: data.id, dayOfWeek: data.day_of_week, startTime: data.start_time, endTime: data.end_time };
}

export async function removeRecurringAvailability(id: string): Promise<void> {
  const { error } = await supabase.from('parking_availability_recurring').delete().eq('id', id);
  if (error) throw error;
}

export async function getAvailabilityExceptions(parkingLotId: string): Promise<AvailabilityException[]> {
  const { data, error } = await supabase
    .from('parking_availability_exceptions')
    .select('*')
    .eq('parking_lot_id', parkingLotId)
    .order('date', { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    isAvailable: row.is_available,
  }));
}

export async function addAvailabilityException(
  parkingLotId: string,
  entry: { date: string; startTime: string | null; endTime: string | null; isAvailable: boolean }
): Promise<AvailabilityException> {
  const { data, error } = await supabase
    .from('parking_availability_exceptions')
    .insert({
      parking_lot_id: parkingLotId,
      date: entry.date,
      start_time: entry.startTime,
      end_time: entry.endTime,
      is_available: entry.isAvailable,
    })
    .select('*')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    date: data.date,
    startTime: data.start_time,
    endTime: data.end_time,
    isAvailable: data.is_available,
  };
}

export async function removeAvailabilityException(id: string): Promise<void> {
  const { error } = await supabase.from('parking_availability_exceptions').delete().eq('id', id);
  if (error) throw error;
}

/** Inserta la misma franja horaria en varios días de una sola vez. */
export async function addRecurringAvailabilityBulk(
  parkingLotId: string,
  entries: { dayOfWeek: number; startTime: string; endTime: string }[]
): Promise<RecurringAvailability[]> {
  const { data, error } = await supabase
    .from('parking_availability_recurring')
    .insert(
      entries.map((entry) => ({
        parking_lot_id: parkingLotId,
        day_of_week: entry.dayOfWeek,
        start_time: entry.startTime,
        end_time: entry.endTime,
      }))
    )
    .select('*');
  if (error) throw error;
  return data.map((row) => ({ id: row.id, dayOfWeek: row.day_of_week, startTime: row.start_time, endTime: row.end_time }));
}

export function getParkingErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes('max_parking_images_reached')) return `Ya llegaste al máximo de ${MAX_PARKING_IMAGES} fotos.`;
    if (message.includes('duplicate key') || message.includes('parking_availability_recurring_no_dupes')) {
      return 'Ese horario ya está cargado para ese día.';
    }
    if (message.includes('lot_has_active_bookings')) {
      return 'Esta cochera tiene reservas vigentes. Cancelalas o esperá a que terminen para poder borrarla.';
    }
    // Red del bucket (migración 0058): la app ya valida esto antes de subir, pero puede llegar
    // acá si el picker no informó el tamaño del archivo.
    if (message.includes('exceeded the maximum allowed size')) return 'La foto pesa demasiado. El máximo es 5 MB.';
    if (message.includes('mime type') && message.includes('not supported')) {
      return 'Ese tipo de archivo no está permitido. Usá una foto JPG, PNG o WEBP.';
    }
    return sanitizeErrorMessage(message, 'Ocurrió un error inesperado. Intenta nuevamente.');
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
