import { sanitizeErrorMessage } from '@/lib/errorMessages';
import { olderThanFilter, toPage, type MessageCursor, type Page } from '@/lib/pagination';
import { supabase } from '@/lib/supabase/client';

import type { ConversationThread, Message, ResolvedThread, ThreadRef, ThreadRole } from './types';

const ACTIVE_STATUSES = new Set(['pending', 'confirmed']);
const CONVERSATIONS_PAGE_SIZE = 20;
const MESSAGES_PAGE_SIZE = 50;

type BookingRow = { id: string; status: string; date: string; start_time: string };

function mapMessageRow(row: { id: string; booking_id: string; sender_id: string; content: string; created_at: string }): Message {
  return {
    id: row.id,
    bookingId: row.booking_id,
    senderId: row.sender_id,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function threadKeyOf(parkingLotId: string, peerId: string): string {
  return `${parkingLotId}:${peerId}`;
}

function rankBooking(status: string): number {
  if (ACTIVE_STATUSES.has(status)) return 0;
  if (status === 'completed') return 1;
  return 2;
}

/**
 * Reserva "ancla" del hilo: contra ella se insertan los mensajes nuevos, porque
 * messages.booking_id es NOT NULL. Se prefiere una reserva viva y, dentro de cada grupo,
 * la más reciente. Las canceladas y finalizadas nunca se borran (solo cambian de status),
 * así que sirven de ancla cuando no hay ninguna activa.
 */
function pickAnchorBooking(rows: BookingRow[]): BookingRow | null {
  if (rows.length === 0) return null;
  return [...rows].sort(
    (a, b) =>
      rankBooking(a.status) - rankBooking(b.status) ||
      `${b.date}T${b.start_time}`.localeCompare(`${a.date}T${a.start_time}`)
  )[0];
}

export type ConversationCursor = { sortAt: string; parkingLotId: string; peerId: string };

/**
 * Una página de conversaciones (list_conversations, 0059). Un hilo es un par (cochera,
 * contraparte) que junta todas sus reservas: para el conductor, la contraparte es el dueño; para
 * el propietario, cada cliente de cada cochera es un hilo aparte. Se ocultan los hilos de
 * reservas viejas donde nunca se escribió nada, pero no los que tienen una reserva activa: la
 * lista es la única entrada al chat. Orden: último mensaje más nuevo primero.
 */
export async function listConversationsPage(
  role: ThreadRole,
  cursor: ConversationCursor | null = null
): Promise<Page<ConversationThread & { sortAt: string }, ConversationCursor>> {
  const { data, error } = await supabase.rpc('list_conversations', {
    p_role: role,
    p_limit: CONVERSATIONS_PAGE_SIZE,
    p_cursor_sort_at: cursor?.sortAt ?? null,
    p_cursor_lot: cursor?.parkingLotId ?? null,
    p_cursor_peer: cursor?.peerId ?? null,
  });
  if (error) throw error;

  const items = data.map((row) => ({
    threadKey: threadKeyOf(row.parking_lot_id, row.peer_id),
    parkingLotId: row.parking_lot_id,
    peerId: row.peer_id,
    parkingLotName: row.parking_lot_name ?? 'Estacionamiento',
    otherPartyName: row.other_party_name ?? (role === 'client' ? 'Propietario' : 'Cliente'),
    bookingIds: row.booking_ids,
    hasActiveBooking: row.has_active_booking,
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    sortAt: row.sort_at,
  }));
  return toPage(items, CONVERSATIONS_PAGE_SIZE, (last) => ({
    sortAt: last.sortAt,
    parkingLotId: last.parkingLotId,
    peerId: last.peerId,
  }));
}

/** Todas las reservas que componen un hilo, más la reserva contra la que se escribe. */
export async function resolveThread(thread: ThreadRef, userId: string): Promise<ResolvedThread> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, status, date, start_time')
    .eq('parking_lot_id', thread.parkingLotId)
    .eq('user_id', thread.role === 'client' ? userId : thread.peerId);
  if (error) throw error;

  const anchor = pickAnchorBooking(data);
  return { bookingIds: data.map((b) => b.id), anchorBookingId: anchor?.id ?? null };
}

/**
 * Traduce una reserva suelta al hilo al que pertenece. Lo usan las notificaciones de mensaje,
 * que guardan related_booking_id y necesitan abrir la conversación correspondiente.
 */
export async function getThreadRefForBooking(
  bookingId: string,
  role: ThreadRole
): Promise<{ parkingLotId: string; peerId: string; title: string } | null> {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('parking_lot_id, user_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!booking) return null;

  const { data: lot, error: lotError } = await supabase
    .from('parking_lots')
    .select('id, name, owner_id')
    .eq('id', booking.parking_lot_id)
    .maybeSingle();
  if (lotError) throw lotError;
  if (!lot) return null;

  const peerId = role === 'client' ? lot.owner_id : booking.user_id;

  const { data: peer } = await supabase.from('public_profiles').select('first_name, last_name').eq('id', peerId).maybeSingle();
  const peerName = peer ? `${peer.first_name} ${peer.last_name}`.trim() : null;

  return {
    parkingLotId: lot.id,
    peerId,
    title: peerName || (role === 'client' ? 'Propietario' : 'Cliente'),
  };
}

/**
 * Una página de mensajes del hilo, hacia atrás: sin cursor, los más recientes; con cursor, los
 * anteriores al mensaje más viejo ya cargado. Cada página viene en orden cronológico.
 */
export async function getThreadMessagesPage(
  bookingIds: string[],
  before: MessageCursor | null = null
): Promise<Page<Message, MessageCursor>> {
  if (bookingIds.length === 0) return { items: [], nextCursor: null };
  let query = supabase
    .from('messages')
    .select('*')
    .in('booking_id', bookingIds)
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

export async function sendThreadMessage(params: {
  thread: ThreadRef;
  userId: string;
  content: string;
  anchorBookingId?: string | null;
}): Promise<Message> {
  let anchor = params.anchorBookingId ?? undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!anchor) {
      const resolved = await resolveThread(params.thread, params.userId);
      if (!resolved.anchorBookingId) throw new Error('thread_empty');
      anchor = resolved.anchorBookingId;
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({ booking_id: anchor, sender_id: params.userId, content: params.content })
      .select('*')
      .single();
    if (!error) return mapMessageRow(data);

    // 23503 = foreign key violation: la reserva ancla ya no existe. Se re-resuelve y se reintenta.
    if (error.code !== '23503' || attempt === 1) throw error;
    anchor = undefined;
  }

  throw new Error('thread_empty');
}

/**
 * Suscripción a los mensajes de un hilo. No usa `filter` de booking_id porque el hilo abarca
 * varias reservas y puede sumar una nueva mientras el chat está abierto. La RLS de `messages`
 * se aplica por suscriptor, así que solo llegan mensajes que este usuario puede leer; el resto
 * se descarta acá con la lista de reservas conocidas.
 */
export function subscribeToThreadMessages(
  threadKey: string,
  bookingIds: string[],
  onInsert: (message: Message) => void,
  onUnknownBooking?: (bookingId: string) => void
): () => void {
  const allowed = new Set(bookingIds);

  const channel = supabase
    .channel(`messages-thread:${threadKey}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const message = mapMessageRow(payload.new as never);
      if (allowed.has(message.bookingId)) {
        onInsert(message);
        return;
      }
      onUnknownBooking?.(message.bookingId);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function getMessagingErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes('thread_empty')) return 'Esta conversación ya no tiene reservas asociadas.';
    return sanitizeErrorMessage(message, 'Ocurrió un error inesperado. Intenta nuevamente.');
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
