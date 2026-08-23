export type NotificationType = 'booking_created' | 'booking_confirmed' | 'booking_cancelled' | string;

export type AppNotification = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  type: NotificationType;
  read: boolean;
  createdAt: string;
};
