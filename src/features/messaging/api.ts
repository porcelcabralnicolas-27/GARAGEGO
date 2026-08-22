import { supabase } from '@/lib/supabase/client';

import type { ConversationThread, Message } from './types';

function mapMessageRow(row: { id: string; booking_id: string; sender_id: string; content: string; created_at: string }): Message {
  return {
    id: row.id,
    bookingId: row.booking_id,
    senderId: row.sender_id,
    content: row.content,
    createdAt: row.created_at,
  };
}

async function attachLastMessages(
  threads: { bookingId: string; parkingLotName: string; otherPartyName: string }[]
): Promise<ConversationThread[]> {
  if (threads.length === 0) return [];
  const bookingIds = threads.map((t) => t.bookingId);
  const { data, error } = await supabase
    .from('messages')
    .select('booking_id, content, created_at')
    .in('booking_id', bookingIds)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const lastByBooking = new Map<string, { content: string; created_at: string }>();
  for (const row of data) {
    if (!lastByBooking.has(row.booking_id)) lastByBooking.set(row.booking_id, row);
  }

  return threads
    .map((thread) => {
      const last = lastByBooking.get(thread.bookingId);
      return {
        ...thread,
        lastMessage: last?.content ?? null,
        lastMessageAt: last?.created_at ?? null,
      };
    })
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
}

export async function listClientConversations(userId: string): Promise<ConversationThread[]> {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, parking_lot_id')
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

  const threads = bookings.map((b) => {
    const lot = lotsById.get(b.parking_lot_id);
    const owner = lot ? ownersById.get(lot.owner_id) : undefined;
    return {
      bookingId: b.id,
      parkingLotName: lot?.name ?? 'Estacionamiento',
      otherPartyName: owner ? `${owner.first_name} ${owner.last_name}`.trim() : 'Propietario',
    };
  });

  return attachLastMessages(threads);
}

export async function listOwnerConversations(ownerId: string): Promise<ConversationThread[]> {
  const { data: myLots, error: lotsError } = await supabase.from('parking_lots').select('id, name').eq('owner_id', ownerId);
  if (lotsError) throw lotsError;
  if (myLots.length === 0) return [];

  const lotIds = myLots.map((l) => l.id);
  const lotsById = new Map(myLots.map((l) => [l.id, l]));

  const { data: bookings, error } = await supabase.from('bookings').select('id, parking_lot_id, user_id').in('parking_lot_id', lotIds);
  if (error) throw error;
  if (bookings.length === 0) return [];

  const clientIds = [...new Set(bookings.map((b) => b.user_id))];
  const { data: clients, error: clientsError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', clientIds);
  if (clientsError) throw clientsError;
  const clientsById = new Map(clients.map((c) => [c.id, c]));

  const threads = bookings.map((b) => {
    const client = clientsById.get(b.user_id);
    return {
      bookingId: b.id,
      parkingLotName: lotsById.get(b.parking_lot_id)?.name ?? 'Estacionamiento',
      otherPartyName: client ? `${client.first_name} ${client.last_name}`.trim() : 'Cliente',
    };
  });

  return attachLastMessages(threads);
}

export async function getMessages(bookingId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(mapMessageRow);
}

export async function sendMessage(params: { bookingId: string; senderId: string; content: string }): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ booking_id: params.bookingId, sender_id: params.senderId, content: params.content })
    .select('*')
    .single();
  if (error) throw error;
  return mapMessageRow(data);
}

export function subscribeToMessages(bookingId: string, onInsert: (message: Message) => void): () => void {
  const channel = supabase
    .channel(`messages:${bookingId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `booking_id=eq.${bookingId}` },
      (payload) => onInsert(mapMessageRow(payload.new as never))
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
