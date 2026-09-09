import { supabase } from '@/lib/supabase/client';

import type {
  ReporterRole,
  SupportMessage,
  SupportTicket,
  SupportTicketListItem,
  TicketCategory,
  TicketTargetOption,
} from './types';

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
    .order('last_message_at', { ascending: false });
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
      .order('created_at', { ascending: false }),
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
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(mapMessageRow);
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

/** Crea el ticket y su primer mensaje (la descripción). */
export async function createTicket(input: CreateTicketInput): Promise<SupportTicket> {
  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({
      reporter_id: input.reporterId,
      reporter_role: input.reporterRole,
      subject: input.subject.trim(),
      category: input.category,
      related_booking_id: input.relatedBookingId,
      related_parking_lot_id: input.relatedParkingLotId,
    })
    .select('*')
    .single();
  if (error) throw error;

  const { error: messageError } = await supabase.from('support_ticket_messages').insert({
    ticket_id: ticket.id,
    author_id: input.reporterId,
    author_role: 'user',
    body: input.body.trim(),
  });
  if (messageError) throw messageError;

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
    return String((error as { message: unknown }).message);
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
