export type Message = {
  id: string;
  bookingId: string;
  senderId: string;
  content: string;
  createdAt: string;
};

export type ConversationThread = {
  bookingId: string;
  parkingLotName: string;
  otherPartyName: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
};
