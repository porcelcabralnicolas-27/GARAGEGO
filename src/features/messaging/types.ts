export type Message = {
  id: string;
  bookingId: string;
  senderId: string;
  content: string;
  createdAt: string;
};

export type ThreadRole = 'client' | 'owner';

/**
 * Identidad de una conversación: un estacionamiento y la otra persona.
 * Los mensajes siguen guardándose contra una reserva (messages.booking_id), pero la
 * conversación agrupa todas las reservas de ese mismo par, así no aparecen chats
 * duplicados cuando el cliente reserva más de una vez en el mismo lugar.
 */
export type ThreadRef = {
  parkingLotId: string;
  peerId: string;
  role: ThreadRole;
};

export type ResolvedThread = {
  bookingIds: string[];
  /** Reserva contra la que se escriben los mensajes nuevos. null = el hilo se quedó sin reservas. */
  anchorBookingId: string | null;
};

export type ConversationThread = {
  /** `${parkingLotId}:${peerId}` */
  threadKey: string;
  parkingLotId: string;
  peerId: string;
  parkingLotName: string;
  otherPartyName: string;
  bookingIds: string[];
  hasActiveBooking: boolean;
  lastMessage: string | null;
  lastMessageAt: string | null;
};
