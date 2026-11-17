export type NotificationType =
  | 'booking_created'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_started'
  | 'booking_completed'
  | 'overtime_charged'
  // 15 minutos antes del final de una reserva en curso (send_booking_end_reminders, 0066).
  | 'booking_ending'
  // 24 horas antes de una reserva futura (send_booking_day_before_reminders, 0068).
  | 'booking_reminder'
  | 'new_message'
  // Revisión de una publicación por el equipo (panel de admin, RPC admin_review_parking_lot).
  // Sin `related_booking_id`; llegan con `audience = 'owner'`.
  | 'listing_approved'
  | 'listing_rejected'
  | 'listing_changes_requested'
  // Soporte (migración 0041). Llegan con `related_ticket_id` y `audience` del rol que abrió.
  | 'support_reply'
  | 'support_resolved'
  // Mercado Pago (migración 0084). Las de reserva llegan con `related_booking_id`;
  // `topup_approved` no tiene reserva y llega con `audience = 'client'`.
  | 'payment_approved'
  | 'payment_expired'
  | 'payment_refunded'
  | 'topup_approved'
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
  subtitle: string | null;
  description: string | null;
  type: NotificationType;
  audience: NotificationAudience | null;
  relatedBookingId: string | null;
  relatedTicketId: string | null;
  /** País de la reserva relacionada (0087): solo se muestran las de la región del perfil. */
  region: 'AR' | 'US';
  read: boolean;
  createdAt: string;
};
