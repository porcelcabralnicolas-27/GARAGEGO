import { supabase } from '@/lib/supabase/client';

import type { Booking, ClientBookingItem, OwnerBookingItem } from './types';

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
// la base (no se dropeó), pero la app no la llama desde ninguna pantalla.

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

export async function listMyBookings(userId: string): Promise<ClientBookingItem[]> {
  const { data: bookingRows, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });
  if (error) throw error;
  if (bookingRows.length === 0) return [];

  const lotIds = [...new Set(bookingRows.map((b) => b.parking_lot_id))];
  const { data: lots, error: lotsError } = await supabase
    .from('parking_lots')
    .select('id, name, address')
    .in('id', lotIds);
  if (lotsError) throw lotsError;
  const lotsById = new Map(lots.map((l) => [l.id, l]));

  return bookingRows.map((row) => {
    const booking = mapBookingRow(row);
    const lot = lotsById.get(row.parking_lot_id);
    return { ...booking, parkingLotName: lot?.name ?? 'Estacionamiento', parkingLotAddress: lot?.address ?? '' };
  });
}

/** Una sola reserva del conductor, con los datos del estacionamiento. La usa la pantalla de
 *  sesión activa, que se abre por id y no puede depender de que la lista esté cargada. */
export async function getClientBooking(bookingId: string): Promise<ClientBookingItem> {
  const { data: row, error } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
  if (error) throw error;

  const { data: lot, error: lotError } = await supabase
    .from('parking_lots')
    .select('name, address')
    .eq('id', row.parking_lot_id)
    .single();
  if (lotError) throw lotError;

  return {
    ...mapBookingRow(row),
    parkingLotName: lot.name,
    parkingLotAddress: lot.address,
  };
}

export async function listReceivedBookings(ownerId: string): Promise<OwnerBookingItem[]> {
  const { data: myLots, error: lotsError } = await supabase
    .from('parking_lots')
    .select('id, name')
    .eq('owner_id', ownerId);
  if (lotsError) throw lotsError;
  if (myLots.length === 0) return [];

  const lotIds = myLots.map((l) => l.id);
  const lotsById = new Map(myLots.map((l) => [l.id, l]));

  const { data: bookingRows, error } = await supabase
    .from('bookings')
    .select('*')
    .in('parking_lot_id', lotIds)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });
  if (error) throw error;
  if (bookingRows.length === 0) return [];

  const clientIds = [...new Set(bookingRows.map((b) => b.user_id))];
  const { data: clients, error: clientsError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', clientIds);
  if (clientsError) throw clientsError;
  const clientsById = new Map(clients.map((c) => [c.id, c]));

  const vehicleIds = [...new Set(bookingRows.map((b) => b.vehicle_id).filter((id): id is string => id !== null))];
  const vehiclesById = new Map<string, { plate: string; brand: string | null; model: string | null }>();
  if (vehicleIds.length > 0) {
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('id, plate, brand, model')
      .in('id', vehicleIds);
    if (vehiclesError) throw vehiclesError;
    for (const v of vehicles) vehiclesById.set(v.id, { plate: v.plate, brand: v.brand, model: v.model });
  }

  return bookingRows.map((row) => {
    const booking = mapBookingRow(row);
    const lot = lotsById.get(row.parking_lot_id);
    const client = clientsById.get(row.user_id);
    return {
      ...booking,
      parkingLotName: lot?.name ?? 'Estacionamiento',
      clientName: client ? `${client.first_name} ${client.last_name}`.trim() : 'Cliente',
      vehicle: row.vehicle_id ? (vehiclesById.get(row.vehicle_id) ?? null) : null,
    };
  });
}

/**
 * Reservas que el usuario borró de SU historial.
 *
 * Es un ocultamiento por usuario, no un borrado: la reserva es compartida con la otra parte y
 * de ella cuelgan la calificación, el chat y los movimientos de billetera. Ver la migración
 * 0031 para el detalle.
 */
export async function listHiddenBookingIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('hidden_bookings').select('booking_id').eq('user_id', userId);
  if (error) throw error;
  return new Set(data.map((row) => row.booking_id));
}

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
      return 'Ese horario está muy cerca de otra reserva. Dejá al menos 15 minutos de margen.';
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
    if (message.includes('no está disponible')) return 'Este estacionamiento ya no está disponible.';
    return message;
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
