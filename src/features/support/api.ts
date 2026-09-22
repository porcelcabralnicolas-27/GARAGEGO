import { sanitizeErrorMessage } from '@/lib/errorMessages';
import { supabase } from '@/lib/supabase/client';

import type {
  ReporterRole,
  SupportMessage,
  SupportTicket,
  SupportTicketListItem,
  TicketCategory,
  TicketTargetOption,
} from './types';

// Tope defensivo para listas y mensajes: sin esto, una cuenta con mucho historial trae todo en
// cada carga. No hay paginación real (sin "cargar más" en la UI), pero corta el peor caso.
const LIST_LIMIT = 200;
const MESSAGES_LIMIT = 300;

type TicketRow = {
  id: string;
  code: string;
  reporter_id: string;
  reporter_role: ReporterRole;
  subject: string;
  category: TicketCategory;
  status: 'open' | 'resolved';
  related_booking_id: string | null;
  related_parking_lot_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

function mapTicketRow(row: TicketRow): SupportTicket {
  return {
    id: row.id,
    code: row.code,
    reporterId: row.reporter_id,
    reporterRole: row.reporter_role,
    subject: row.subject,
    category: row.category,
    status: row.status,
    relatedBookingId: row.related_booking_id,
    relatedParkingLotId: row.related_parking_lot_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

function mapMessageRow(row: {
  id: string;
  ticket_id: string;
  author_id: string;
  author_role: 'user' | 'admin';
  body: string;
  created_at: string;
}): SupportMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    authorRole: row.author_role,
    body: row.body,
    createdAt: row.created_at,
  };
}

/** Tickets del usuario, con el nombre de la cochera relacionada y un preview del último mensaje. */
export async function listMyTickets(userId: string): Promise<SupportTicketListItem[]> {
  const { data: tickets, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('reporter_id', userId)
    .order('last_message_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  if (tickets.length === 0) return [];

  const ticketIds = tickets.map((t) => t.id);
  const bookingIds = [...new Set(tickets.map((t) => t.related_booking_id).filter((v): v is string => !!v))];

  const [bookingsRes, messagesRes] = await Promise.all([
    bookingIds.length
      ? supabase.from('bookings').select('id, parking_lot_id').in('id', bookingIds)
      : Promise.resolve({ data: [] as { id: string; parking_lot_id: string }[], error: null }),
    supabase
      .from('support_ticket_messages')
      .select('ticket_id, body, created_at')
      .in('ticket_id', ticketIds)
      .order('created_at', { ascending: false })
      // Solo se necesita el más nuevo por ticket; el tope es generoso a propósito (evita el
      // caso patológico de traer TODO el historial de mensajes de TODOS los tickets del
      // usuario) sin arriesgarse a cortar antes de llegar al mensaje de algún ticket.
      .limit(ticketIds.length * 20),
  ]);
  if (bookingsRes.error) throw bookingsRes.error;
  if (messagesRes.error) throw messagesRes.error;

  const lotIdByBooking = new Map((bookingsRes.data ?? []).map((b) => [b.id, b.parking_lot_id]));
  const lotIds = [
    ...new Set([
      ...tickets.map((t) => t.related_parking_lot_id).filter((v): v is string => !!v),
      ...lotIdByBooking.values(),
    ]),
  ];

  const lotNameById = new Map<string, string>();
  if (lotIds.length) {
    const { data: lots, error: lotsError } = await supabase
      .from('parking_lots')
      .select('id, name')
      .in('id', lotIds);
    if (lotsError) throw lotsError;
    for (const lot of lots) lotNameById.set(lot.id, lot.name);
  }

  const lastMessageByTicket = new Map<string, string>();
  for (const m of messagesRes.data ?? []) {
    if (!lastMessageByTicket.has(m.ticket_id)) lastMessageByTicket.set(m.ticket_id, m.body);
  }

  return tickets.map((row) => {
    const lotId = row.related_parking_lot_id ?? (row.related_booking_id ? lotIdByBooking.get(row.related_booking_id) : null);
    return {
      ...mapTicketRow(row),
      contextLabel: lotId ? lotNameById.get(lotId) ?? null : null,
      lastMessagePreview: lastMessageByTicket.get(row.id) ?? null,
    };
  });
}

export async function getTicket(ticketId: string): Promise<SupportTicket> {
  const { data, error } = await supabase.from('support_tickets').select('*').eq('id', ticketId).single();
  if (error) throw error;
  return mapTicketRow(data);
}

export async function getTicketMessages(ticketId: string): Promise<SupportMessage[]> {
  // Se pide en orden descendente con tope y se da vuelta: así, si el hilo es larguísimo, lo
  // que se corta es lo más viejo y no lo más reciente.
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: false })
    .limit(MESSAGES_LIMIT);
  if (error) throw error;
  return data.map(mapMessageRow).reverse();
}

export type CreateTicketInput = {
  reporterId: string;
  reporterRole: ReporterRole;
  subject: string;
  category: TicketCategory;
  body: string;
  relatedBookingId: string | null;
  relatedParkingLotId: string | null;
};

/** Crea el ticket y su primer mensaje (la descripción) en una sola operación atómica: la RPC
 *  `create_support_ticket` (0054) hace las dos escrituras en la misma transacción, así nunca
 *  queda un ticket sin su mensaje inicial si algo falla a mitad de camino. */
export async function createTicket(input: CreateTicketInput): Promise<SupportTicket> {
  const { data: ticket, error } = await supabase.rpc('create_support_ticket', {
    p_reporter_role: input.reporterRole,
    p_subject: input.subject.trim(),
    p_category: input.category,
    p_body: input.body.trim(),
    p_related_booking_id: input.relatedBookingId,
    p_related_parking_lot_id: input.relatedParkingLotId,
  });
  if (error) throw error;
  return mapTicketRow(ticket);
}

export async function sendTicketMessage(params: {
  ticketId: string;
  authorId: string;
  body: string;
}): Promise<SupportMessage> {
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .insert({
      ticket_id: params.ticketId,
      author_id: params.authorId,
      author_role: 'user',
      body: params.body.trim(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapMessageRow(data);
}

/**
 * Opciones para el selector de "¿sobre qué es?". El conductor elige una reserva; el
 * propietario, una cochera. Un ticket siempre queda vinculado a una de las dos.
 */
export async function listTicketTargets(
  role: ReporterRole,
  userId: string
): Promise<TicketTargetOption[]> {
  if (role === 'owner') {
    const { data, error } = await supabase
      .from('parking_lots')
      .select('id, name, address')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map((lot) => ({
      key: `lot:${lot.id}`,
      label: lot.name,
      sublabel: lot.address,
      bookingId: null,
      parkingLotId: lot.id,
    }));
  }

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, parking_lot_id, date, start_time')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });
  if (error) throw error;
  if (bookings.length === 0) return [];

  const lotIds = [...new Set(bookings.map((b) => b.parking_lot_id))];
  const { data: lots, error: lotsError } = await supabase
    .from('parking_lots')
    .select('id, name')
    .in('id', lotIds);
  if (lotsError) throw lotsError;
  const lotNameById = new Map(lots.map((l) => [l.id, l.name]));

  return bookings.map((b) => ({
    key: `booking:${b.id}`,
    label: lotNameById.get(b.parking_lot_id) ?? 'Estacionamiento',
    sublabel: `${b.date} · ${b.start_time.slice(0, 5)}`,
    bookingId: b.id,
    parkingLotId: null,
  }));
}

export function subscribeToTicketMessages(
  ticketId: string,
  onInsert: (message: SupportMessage) => void
): () => void {
  const channel = supabase
    .channel(`support-ticket:${ticketId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_ticket_messages', filter: `ticket_id=eq.${ticketId}` },
      (payload) => onInsert(mapMessageRow(payload.new as never))
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function getSupportErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    return sanitizeErrorMessage(message, 'Ocurrió un error inesperado. Intenta nuevamente.');
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
