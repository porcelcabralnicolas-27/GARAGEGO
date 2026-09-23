import { sanitizeErrorMessage } from '@/lib/errorMessages';
import { guessImageContentType } from '@/lib/imageMime';
import { supabase } from '@/lib/supabase/client';

import type { Vehicle, VehicleImage } from './types';

const STORAGE_BUCKET = 'vehicle-images';

function mapVehicleRow(row: {
  id: string;
  user_id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  created_at: string;
}): Vehicle {
  return {
    id: row.id,
    userId: row.user_id,
    plate: row.plate,
    brand: row.brand,
    model: row.model,
    color: row.color,
    createdAt: row.created_at,
  };
}

function toPublicUrl(storagePath: string): string {
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export async function listMyVehicles(userId: string): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(mapVehicleRow);
}

export async function getVehicle(id: string): Promise<Vehicle> {
  const { data, error } = await supabase.from('vehicles').select('*').eq('id', id).single();
  if (error) throw error;
  return mapVehicleRow(data);
}

export type VehicleInput = {
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
};

export async function createVehicle(userId: string, input: VehicleInput): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      user_id: userId,
      plate: input.plate,
      brand: input.brand,
      model: input.model,
      color: input.color,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapVehicleRow(data);
}

export async function updateVehicle(id: string, input: VehicleInput): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicles')
    .update({
      plate: input.plate,
      brand: input.brand,
      model: input.model,
      color: input.color,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return mapVehicleRow(data);
}

export async function deleteVehicle(vehicleId: string): Promise<void> {
  const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId);
  if (error) throw error;
}

export async function getVehicleCoverImageUrls(vehicleIds: string[]): Promise<Record<string, string>> {
  if (vehicleIds.length === 0) return {};
  const { data, error } = await supabase
    .from('vehicle_images')
    .select('vehicle_id, storage_path, position')
    .in('vehicle_id', vehicleIds)
    .order('position', { ascending: true });
  if (error) throw error;

  const result: Record<string, string> = {};
  for (const row of data) {
    if (!result[row.vehicle_id]) result[row.vehicle_id] = toPublicUrl(row.storage_path);
  }
  return result;
}

export async function listVehicleImages(vehicleId: string): Promise<VehicleImage[]> {
  const { data, error } = await supabase
    .from('vehicle_images')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    vehicleId: row.vehicle_id,
    storagePath: row.storage_path,
    publicUrl: toPublicUrl(row.storage_path),
    position: row.position,
  }));
}

export async function uploadVehicleImage(params: {
  ownerId: string;
  vehicleId: string;
  localUri: string;
  position: number;
}): Promise<VehicleImage> {
  const { extension, contentType } = guessImageContentType(params.localUri);
  const path = `${params.ownerId}/${params.vehicleId}/${Date.now()}.${extension}`;

  // fetch + arrayBuffer funciona igual en web y nativo (a diferencia de expo-file-system, que no puede
  // leer los blob: URIs que devuelve el selector de imágenes en web).
  const response = await fetch(params.localUri);
  if (!response.ok) throw new Error(`No se pudo leer la imagen (${response.status}).`);
  const arrayBuffer = await response.arrayBuffer();
  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, arrayBuffer, { contentType });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('vehicle_images')
    .insert({ vehicle_id: params.vehicleId, storage_path: path, position: params.position })
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
    vehicleId: data.vehicle_id,
    storagePath: data.storage_path,
    publicUrl: toPublicUrl(data.storage_path),
    position: data.position,
  };
}

export async function deleteVehicleImage(image: { id: string; storagePath: string }): Promise<void> {
  const { error: dbError } = await supabase.from('vehicle_images').delete().eq('id', image.id);
  if (dbError) throw dbError;
  const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove([image.storagePath]);
  // El registro ya se borró (es lo que ve el usuario); si falla la limpieza del archivo, se
  // registra pero no se revierte el borrado — deshacerlo sería más confuso que un archivo
  // huérfano en el bucket.
  if (storageError) console.error('No se pudo borrar el archivo de la imagen del vehículo:', storageError);
}

export function getVehicleErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes('max_vehicles_reached')) return 'Ya cargaste el máximo de 3 vehículos.';
    if (message.includes('duplicate key') || message.includes('vehicles_user_id_plate_key')) {
      return 'Ya tenés un vehículo cargado con esa patente.';
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
