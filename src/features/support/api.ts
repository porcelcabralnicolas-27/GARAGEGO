import { sanitizeErrorMessage } from '@/lib/errorMessages';
import { olderThanFilter, toPage, type MessageCursor, type Page } from '@/lib/pagination';
import { supabase } from '@/lib/supabase/client';

import type {
  ReporterRole,
  SupportMessage,
  SupportTicket,
  SupportTicketListItem,
  TicketCategory,
  TicketTargetOption,
} from './types';

const TICKETS_PAGE_SIZE = 20;
const MESSAGES_PAGE_SIZE = 50;
// Tope del selector "¿sobre qué es?" del ticket: las reservas o cocheras más recientes. Un reclamo
// casi siempre es sobre algo reciente, y sin tope un conductor con años de uso traía todas sus
// reservas de una vez (informe de recomendaciones 2026-10-15, escalabilidad 1).
const TICKET_TARGETS_LIMIT = 50;

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

export type TicketCursor = { lastMessageAt: string; id: string };

/**
 * Una página de los tickets que el usuario abrió desde el modo `role`, con el nombre de la
 * cochera relacionada y el último mensaje (list_my_tickets, 0063).
 */
export async function listMyTicketsPage(
  role: ReporterRole,
  cursor: TicketCursor | null = null
): Promise<Page<SupportTicketListItem, TicketCursor>> {
  const { data, error } = await supabase.rpc('list_my_tickets', {
    p_role: role,
    p_limit: TICKETS_PAGE_SIZE,
    p_cursor_last_message_at: cursor?.lastMessageAt ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  if (error) throw error;

  const items = data.map((row) => ({
    ...mapTicketRow(row),
    contextLabel: row.context_label,
    lastMessagePreview: row.last_message_preview,
  }));
  return toPage(items, TICKETS_PAGE_SIZE, (last) => ({ lastMessageAt: last.lastMessageAt, id: last.id }));
}

export async function getTicket(ticketId: string): Promise<SupportTicket> {
  const { data, error } = await supabase.from('support_tickets').select('*').eq('id', ticketId).single();
  if (error) throw error;
  return mapTicketRow(data);
}

/**
 * Una página de mensajes del ticket, hacia atrás: sin cursor, los más recientes; con cursor, los
 * anteriores al mensaje más viejo ya cargado. Cada página viene en orden cronológico.
 */
export async function getTicketMessagesPage(
  ticketId: string,
  before: MessageCursor | null = null
): Promise<Page<SupportMessage, MessageCursor>> {
  let query = supabase
    .from('support_ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MESSAGES_PAGE_SIZE);
  if (before) query = query.or(olderThanFilter(before));
  const { data, error } = await query;
  if (error) throw error;

  const newestFirst = data.map(mapMessageRow);
  const page = toPage(newestFirst, MESSAGES_PAGE_SIZE, (oldest) => ({ createdAt: oldest.createdAt, id: oldest.id }));
  return { ...page, items: newestFirst.reverse() };
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
 * propietario, una cochera. Un ticket siempre queda vinculado a una de las dos. Trae solo las
 * `TICKET_TARGETS_LIMIT` más recientes.
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
      // Una publicación eliminada (archivada) ya no admite reportes (migración 0080).
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(TICKET_TARGETS_LIMIT);
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
    .order('start_time', { ascending: false })
    .limit(TICKET_TARGETS_LIMIT);
  if (error) throw error;
  if (bookings.length === 0) return [];

  const lotIds = [...new Set(bookings.map((b) => b.parking_lot_id))];
  const { data: lots, error: lotsError } = await supabase
    .from('parking_lots')
    .select('id, name, archived_at')
    .in('id', lotIds);
  if (lotsError) throw lotsError;
  const lotNameById = new Map(lots.map((l) => [l.id, l.name]));
  // Las reservas de una publicación eliminada se conservan en el historial, pero no se pueden
  // reportar (migración 0080).
  const archivedLotIds = new Set(lots.filter((l) => l.archived_at !== null).map((l) => l.id));

  return bookings.filter((b) => !archivedLotIds.has(b.parking_lot_id)).map((b) => ({
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
