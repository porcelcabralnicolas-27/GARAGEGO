export type NotificationType =
  | 'booking_created'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_started'
  | 'overtime_charged'
  | 'new_message'
  | string;

export type AppNotification = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  type: NotificationType;
  relatedBookingId: string | null;
  read: boolean;
  createdAt: string;
};
