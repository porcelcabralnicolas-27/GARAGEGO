import { sanitizeErrorMessage } from '@/lib/errorMessages';
import { toPage, type Page } from '@/lib/pagination';
import { supabase } from '@/lib/supabase/client';

import type {
  Booking,
  BookingCursor,
  BookingScope,
  ClientBookingItem,
  OwnerBookingDetail,
  OwnerBookingItem,
} from './types';

/** Reservas por página del historial. */
export const HISTORY_PAGE_SIZE = 20;

/**
 * Las vigentes (pending / confirmed) se piden en una sola página grande y sin "cargar más": son
 * reservas futuras ya pagadas, así que en la práctica son pocas. 100 es el máximo del servidor.
 */
const ACTIVE_PAGE_SIZE = 100;

function cursorArgs(cursor: BookingCursor | null) {
  return {
    p_cursor_date: cursor?.date ?? null,
    p_cursor_start: cursor?.startTime ?? null,
    p_cursor_id: cursor?.id ?? null,
  };
}

const bookingCursorOf = (b: Booking): BookingCursor => ({ date: b.date, startTime: b.startTime, id: b.id });

function mapBookingRow(row: {
  id: string;
  user_id: string;
  parking_lot_id: string;
  vehicle_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  total_price: number;
  actual_start_at: string | null;
  actual_end_at: string | null;
  overtime_minutes: number;
  overtime_charge: number;
  created_at: string;
}): Booking {
  return {
    id: row.id,
    userId: row.user_id,
    parkingLotId: row.parking_lot_id,
    vehicleId: row.vehicle_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    totalPrice: row.total_price,
    actualStartAt: row.actual_start_at,
    actualEndAt: row.actual_end_at,
    overtimeMinutes: row.overtime_minutes,
    overtimeCharge: row.overtime_charge,
    createdAt: row.created_at,
  };
}

export async function createBooking(params: {
  parkingLotId: string;
  date: string;
  startTime: string;
  endTime: string;
  vehicleId: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_booking', {
    p_parking_lot_id: params.parkingLotId,
    p_date: params.date,
    p_start_time: params.startTime,
    p_end_time: params.endTime,
    p_vehicle_id: params.vehicleId,
  });
  if (error) throw error;
  return data;
}

export async function startBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('start_booking', { p_booking_id: bookingId });
  if (error) throw error;
}

export type BookedInterval = { date: string; startTime: string; endTime: string };

export async function getBookedIntervals(parkingLotId: string, fromDate: string): Promise<BookedInterval[]> {
  const { data, error } = await supabase.rpc('get_booked_intervals', {
    p_parking_lot_id: parkingLotId,
    p_from_date: fromDate,
  });
  if (error) throw error;
  return data.map((row) => ({ date: row.date, startTime: row.start_time, endTime: row.end_time }));
}

// `confirmBooking` se eliminó en la Fase 8.6: desde la migración 0024 el pago deja la reserva
// confirmada y el propietario ya no aprueba nada. La RPC `confirm_booking` sigue existiendo en
// la base (no se dropeó), pero desde la 0046 no se puede invocar desde el cliente.

export async function completeBooking(bookingId: string): Promise<{ overtimeMinutes: number; overtimeCharge: number }> {
  const { data, error } = await supabase.rpc('complete_booking', { p_booking_id: bookingId });
  if (error) throw error;
  const result = data[0];
  return { overtimeMinutes: result.overtime_minutes, overtimeCharge: result.overtime_charge };
}

export async function cancelBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
  if (error) throw error;
}

/**
 * Una página de las reservas del conductor, ya con el nombre y la dirección de la cochera
 * (list_client_bookings, 0059). El historial no incluye las que el conductor borró de su
 * historial: eso lo filtra el servidor, así las páginas vienen completas.
 */
export async function listClientBookingsPage(
  scope: BookingScope,
  cursor: BookingCursor | null = null
): Promise<Page<ClientBookingItem, BookingCursor>> {
  const pageSize = scope === 'active' ? ACTIVE_PAGE_SIZE : HISTORY_PAGE_SIZE;
  const { data, error } = await supabase.rpc('list_client_bookings', {
    p_scope: scope,
    p_limit: pageSize,
    ...cursorArgs(cursor),
  });
  if (error) throw error;

  const items = data.map((row) => ({
    ...mapBookingRow(row),
    // Si el admin pausó la cochera, la policy deja de mostrarla y el nombre viene null.
    parkingLotName: row.parking_lot_name ?? 'Estacionamiento',
    parkingLotAddress: row.parking_lot_address ?? '',
    isRated: row.is_rated,
  }));
  return toPage(items, pageSize, bookingCursorOf);
}

/** Una sola reserva del conductor, con los datos del estacionamiento. La usa la pantalla de
 *  sesión activa, que se abre por id y no puede depender de que la lista esté cargada. */
export async function getClientBooking(bookingId: string): Promise<ClientBookingItem> {
  const { data, error } = await supabase.rpc('get_client_booking', { p_booking_id: bookingId });
  if (error) throw error;
  const row = data[0];
  if (!row) throw new Error('Reserva no encontrada');

  return {
    ...mapBookingRow(row),
    // Si el admin pausó la cochera, la policy deja de mostrarla: se degrada en vez de romper la
    // pantalla de un conductor que ya está adentro.
    parkingLotName: row.parking_lot_name ?? 'Estacionamiento',
    parkingLotAddress: row.parking_lot_address ?? '',
    isRated: row.is_rated,
  };
}

/**
 * Una página de las reservas recibidas por el propietario, con cochera, cliente y vehículo
 * (list_owner_bookings, 0059). Antes eran cuatro consultas encadenadas.
 */
export async function listOwnerBookingsPage(
  scope: BookingScope,
  cursor: BookingCursor | null = null
): Promise<Page<OwnerBookingItem, BookingCursor>> {
  const pageSize = scope === 'active' ? ACTIVE_PAGE_SIZE : HISTORY_PAGE_SIZE;
  const { data, error } = await supabase.rpc('list_owner_bookings', {
    p_scope: scope,
    p_limit: pageSize,
    ...cursorArgs(cursor),
  });
  if (error) throw error;

  const items = data.map((row) => ({
    ...mapBookingRow(row),
    parkingLotName: row.parking_lot_name ?? 'Estacionamiento',
    clientName: row.client_name ?? 'Cliente',
    vehicle: row.vehicle_plate ? { plate: row.vehicle_plate, brand: row.vehicle_brand, model: row.vehicle_model } : null,
  }));
  return toPage(items, pageSize, bookingCursorOf);
}

/** Una sola reserva recibida por el propietario (get_owner_booking, 0062), para su detalle. */
export async function getOwnerBooking(bookingId: string): Promise<OwnerBookingDetail> {
  const { data, error } = await supabase.rpc('get_owner_booking', { p_booking_id: bookingId });
  if (error) throw error;
  const row = data[0];
  if (!row) throw new Error('Reserva no encontrada');

  return {
    ...mapBookingRow(row),
    parkingLotName: row.parking_lot_name ?? 'Estacionamiento',
    parkingLotAddress: row.parking_lot_address ?? '',
    clientName: row.client_name ?? 'Cliente',
    vehicle: row.vehicle_plate ? { plate: row.vehicle_plate, brand: row.vehicle_brand, model: row.vehicle_model } : null,
  };
}

/**
 * Oculta una reserva del historial de ESTE usuario.
 *
 * Es un ocultamiento por usuario, no un borrado: la reserva es compartida con la otra parte y
 * de ella cuelgan la calificación, el chat y los movimientos de billetera. Ver la migración
 * 0031 para el detalle.
 */
export async function hideBooking(bookingId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('hidden_bookings').insert({ booking_id: bookingId, user_id: userId });
  if (error) throw error;
}

export function getBookingErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes('insufficient_balance')) return 'No tenés saldo suficiente para esta reserva.';
    if (message.includes('overlap_conflict')) return 'Ese horario ya no está disponible. Elegí otro.';
    if (message.includes('buffer_conflict')) {
      return 'Ese horario ya no tiene lugar disponible (cada reserva deja 15 minutos de margen). Elegí otro.';
    }
    if (message.includes('booking_in_past') || message.includes('No se puede reservar en el pasado')) {
      return 'Ese horario ya pasó. Elegí uno posterior.';
    }
    if (message.includes('cancel_too_late')) {
      return 'Falta menos de 1 hora para el inicio: esta reserva ya no se puede cancelar.';
    }
    if (message.includes('No podés reservar tu propio estacionamiento')) {
      return 'No podés reservar tu propio estacionamiento.';
    }
    if (message.includes('vehicle_required')) return 'Elegí un vehículo para esta reserva.';
    if (message.includes('vehicle_not_found')) return 'Ese vehículo ya no está disponible. Elegí otro.';
    if (message.includes('already_started')) return 'Esta reserva ya fue iniciada.';
    if (message.includes('start_too_early')) {
      return 'Todavía es muy temprano. Podés iniciar desde 15 minutos antes del horario reservado.';
    }
    if (message.includes('start_window_over')) {
      return 'El horario de esta reserva ya terminó, así que no se puede iniciar.';
    }
    if (message.includes('no está disponible') || message.includes('lot_not_bookable')) {
      return 'Este estacionamiento ya no está disponible.';
    }
    if (message.includes('outside_availability')) {
      return 'Ese horario está fuera de la disponibilidad del estacionamiento. Elegí otro.';
    }
    if (message.includes('invalid_duration')) return 'La reserva tiene que durar al menos 30 minutos, en tramos de 30.';
    if (message.includes('booking_not_started')) {
      return 'Esta reserva todavía no se inició, así que no se puede finalizar.';
    }
    if (message.includes('booking_state_changed')) {
      return 'Esta reserva cambió de estado mientras tanto. Actualizá la pantalla.';
    }
    return sanitizeErrorMessage(message, 'Ocurrió un error inesperado. Intenta nuevamente.');
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
