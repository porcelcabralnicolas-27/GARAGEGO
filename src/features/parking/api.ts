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
  // vivo por definición, así que se les asume el valor bueno.
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

export async function searchParkingLots(filters: ParkingSearchFilters): Promise<ParkingLotWithDistance[]> {
  const { data, error } = await supabase.rpc('search_parking_lots', {
    p_lat: filters.latitude,
    p_lng: filters.longitude,
    p_radius_km: filters.radiusKm ?? 5,
    p_max_price: filters.maxPrice ?? null,
    p_min_rating: filters.minRating ?? null,
  });
  if (error) throw error;
  return data.map((row) => ({ ...mapParkingLotRow(row), distanceKm: row.distance_km }));
}

export async function listMyParkingLots(ownerId: string): Promise<ParkingLot[]> {
  const { data, error } = await supabase
    .from('parking_lots')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
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

export async function deleteParkingLot(id: string): Promise<void> {
  const { error } = await supabase.from('parking_lots').delete().eq('id', id);
  if (error) throw error;
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
  const extensionMatch = /\.(\w+)$/.exec(params.localUri);
  const extension = extensionMatch ? extensionMatch[1] : 'jpg';
  const path = `${params.ownerId}/${params.parkingLotId}/${Date.now()}.${extension}`;

  // fetch + arrayBuffer funciona igual en web y nativo (a diferencia de expo-file-system, que no puede
  // leer los blob: URIs que devuelve el selector de imágenes en web).
  const response = await fetch(params.localUri);
  const arrayBuffer = await response.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, arrayBuffer, { contentType: `image/${extension}` });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('parking_images')
    .insert({ parking_lot_id: params.parkingLotId, storage_path: path, position: params.position })
    .select('*')
    .single();
  if (error) throw error;

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
  await supabase.storage.from(STORAGE_BUCKET).remove([image.storagePath]);
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
    return message;
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
