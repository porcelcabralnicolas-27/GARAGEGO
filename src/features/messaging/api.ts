import { supabase } from '@/lib/supabase/client';

import type { ConversationThread, Message, ResolvedThread, ThreadRef, ThreadRole } from './types';

const ACTIVE_STATUSES = new Set(['pending', 'confirmed']);

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

type ThreadDraft = Omit<ConversationThread, 'lastMessage' | 'lastMessageAt'>;

async function attachLastMessages(drafts: ThreadDraft[]): Promise<ConversationThread[]> {
  if (drafts.length === 0) return [];

  const keyByBooking = new Map<string, string>();
  for (const draft of drafts) {
    for (const bookingId of draft.bookingIds) keyByBooking.set(bookingId, draft.threadKey);
  }

  const { data, error } = await supabase
    .from('messages')
    .select('booking_id, content, created_at')
    .in('booking_id', [...keyByBooking.keys()])
    .order('created_at', { ascending: false });
  if (error) throw error;

  const lastByThread = new Map<string, { content: string; created_at: string }>();
  for (const row of data) {
    const key = keyByBooking.get(row.booking_id);
    if (key && !lastByThread.has(key)) lastByThread.set(key, row);
  }

  return drafts
    .map((draft) => {
      const last = lastByThread.get(draft.threadKey);
      return { ...draft, lastMessage: last?.content ?? null, lastMessageAt: last?.created_at ?? null };
    })
    // Se ocultan los hilos de reservas viejas donde nunca se escribió nada. Los que tienen una
    // reserva activa se dejan aunque estén vacíos: la lista es el único punto de entrada al chat,
    // así que si se ocultaran todos no habría forma de iniciar una conversación.
    .filter((thread) => thread.lastMessageAt !== null || thread.hasActiveBooking)
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
}

export async function listClientConversations(userId: string): Promise<ConversationThread[]> {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, parking_lot_id, status, date, start_time')
    .eq('user_id', userId);
  if (error) throw error;
  if (bookings.length === 0) return [];

  const lotIds = [...new Set(bookings.map((b) => b.parking_lot_id))];
  const { data: lots, error: lotsError } = await supabase
    .from('parking_lots')
    .select('id, name, owner_id')
    .in('id', lotIds);
  if (lotsError) throw lotsError;
  const lotsById = new Map(lots.map((l) => [l.id, l]));

  const ownerIds = [...new Set(lots.map((l) => l.owner_id))];
  const { data: owners, error: ownersError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', ownerIds);
  if (ownersError) throw ownersError;
  const ownersById = new Map(owners.map((o) => [o.id, o]));

  const byLot = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    const rows = byLot.get(booking.parking_lot_id) ?? [];
    rows.push(booking);
    byLot.set(booking.parking_lot_id, rows);
  }

  const drafts: ThreadDraft[] = [...byLot.entries()].flatMap(([lotId, rows]) => {
    const lot = lotsById.get(lotId);
    if (!lot) return [];
    const owner = ownersById.get(lot.owner_id);
    return [
      {
        threadKey: threadKeyOf(lotId, lot.owner_id),
        parkingLotId: lotId,
        peerId: lot.owner_id,
        parkingLotName: lot.name,
        otherPartyName: owner ? `${owner.first_name} ${owner.last_name}`.trim() : 'Propietario',
        bookingIds: rows.map((r) => r.id),
        hasActiveBooking: rows.some((r) => ACTIVE_STATUSES.has(r.status)),
      },
    ];
  });

  return attachLastMessages(drafts);
}

export async function listOwnerConversations(ownerId: string): Promise<ConversationThread[]> {
  const { data: myLots, error: lotsError } = await supabase.from('parking_lots').select('id, name').eq('owner_id', ownerId);
  if (lotsError) throw lotsError;
  if (myLots.length === 0) return [];

  const lotIds = myLots.map((l) => l.id);
  const lotsById = new Map(myLots.map((l) => [l.id, l]));

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, parking_lot_id, user_id, status, date, start_time')
    .in('parking_lot_id', lotIds);
  if (error) throw error;
  if (bookings.length === 0) return [];

  const clientIds = [...new Set(bookings.map((b) => b.user_id))];
  const { data: clients, error: clientsError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', clientIds);
  if (clientsError) throw clientsError;
  const clientsById = new Map(clients.map((c) => [c.id, c]));

  // Para el propietario el hilo es por (estacionamiento, cliente): si el mismo cliente reservó
  // en dos de sus estacionamientos, son dos conversaciones distintas.
  const byThread = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    const key = threadKeyOf(booking.parking_lot_id, booking.user_id);
    const rows = byThread.get(key) ?? [];
    rows.push(booking);
    byThread.set(key, rows);
  }

  const drafts: ThreadDraft[] = [...byThread.entries()].map(([threadKey, rows]) => {
    const client = clientsById.get(rows[0].user_id);
    return {
      threadKey,
      parkingLotId: rows[0].parking_lot_id,
      peerId: rows[0].user_id,
      parkingLotName: lotsById.get(rows[0].parking_lot_id)?.name ?? 'Estacionamiento',
      otherPartyName: client ? `${client.first_name} ${client.last_name}`.trim() : 'Cliente',
      bookingIds: rows.map((r) => r.id),
      hasActiveBooking: rows.some((r) => ACTIVE_STATUSES.has(r.status)),
    };
  });

  return attachLastMessages(drafts);
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

  const { data: peer } = await supabase.from('profiles').select('first_name, last_name').eq('id', peerId).maybeSingle();
  const peerName = peer ? `${peer.first_name} ${peer.last_name}`.trim() : null;

  return {
    parkingLotId: lot.id,
    peerId,
    title: peerName || (role === 'client' ? 'Propietario' : 'Cliente'),
  };
}

export async function getThreadMessages(bookingIds: string[]): Promise<Message[]> {
  if (bookingIds.length === 0) return [];
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .in('booking_id', bookingIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(mapMessageRow);
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
    return message;
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
