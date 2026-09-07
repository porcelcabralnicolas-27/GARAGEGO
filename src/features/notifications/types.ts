export type NotificationType =
  | 'booking_created'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_started'
  | 'booking_completed'
  | 'overtime_charged'
  | 'new_message'
  | string;

/**
 * De qué lado de la reserva está el destinatario. Lo completa solo el trigger
 * `notifications_set_audience` (migración 0030) mirando la reserva relacionada.
 *
 * `null` = se muestra en las dos vistas. Es el caso de las notificaciones viejas sin reserva
 * asociada: preferimos mostrar de más antes que esconder algo.
 */
export type NotificationAudience = 'client' | 'owner';

export type AppNotification = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  type: NotificationType;
  audience: NotificationAudience | null;
  relatedBookingId: string | null;
  read: boolean;
  createdAt: string;
};
