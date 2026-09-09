import { supabase } from '@/lib/supabase/client';

import type { AppNotification, NotificationAudience } from './types';

function mapNotificationRow(row: {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  type: string;
  audience: string | null;
  related_booking_id: string | null;
  related_ticket_id: string | null;
  read: boolean;
  created_at: string;
}): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    type: row.type,
    audience: (row.audience as NotificationAudience | null) ?? null,
    relatedBookingId: row.related_booking_id,
    relatedTicketId: row.related_ticket_id,
    read: row.read,
    createdAt: row.created_at,
  };
}

/**
 * Filtro de rol para las consultas: las del rol activo más las que no tienen rol definido.
 *
 * Las `audience is null` son notificaciones viejas (previas a la 0030) que no se pudieron
 * clasificar. Se muestran en las dos vistas a propósito: esconderlas sería perder avisos que
 * el usuario nunca vio.
 */
const audienceFilter = (audience: NotificationAudience) => `audience.is.null,audience.eq.${audience}`;

/** ¿Esta notificación corresponde al rol activo? Misma regla que `audienceFilter`, para los
 *  eventos de realtime, que llegan sin pasar por el filtro de la consulta. */
export function matchesAudience(notification: AppNotification, audience: NotificationAudience): boolean {
  return notification.audience === null || notification.audience === audience;
}

export async function listNotifications(
  userId: string,
  audience: NotificationAudience
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .or(audienceFilter(audience))
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(mapNotificationRow);
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsAsRead(
  userId: string,
  audience: NotificationAudience
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .or(audienceFilter(audience))
    .eq('read', false);
  if (error) throw error;
}

export async function countUnreadMessageNotifications(
  userId: string,
  audience: NotificationAudience
): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'new_message')
    .or(audienceFilter(audience))
    .eq('read', false);
  if (error) throw error;
  return count ?? 0;
}

export async function listUnreadMessageNotifications(
  userId: string,
  audience: NotificationAudience
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'new_message')
    .or(audienceFilter(audience))
    .eq('read', false);
  if (error) throw error;
  return data.map(mapNotificationRow);
}

/**
 * Marca como leídas las notificaciones de mensaje de una conversación completa.
 * Recibe varias reservas porque un chat agrupa todas las reservas del mismo estacionamiento.
 *
 * No hace falta filtrar por rol: nadie puede reservar su propia cochera, así que para una
 * reserva dada el usuario está de un solo lado.
 */
export async function markMessageNotificationsAsRead(userId: string, bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('type', 'new_message')
    .in('related_booking_id', bookingIds)
    .eq('read', false);
  if (error) throw error;
}

/** Marca como leídas las notificaciones de un ticket de soporte (respuesta / resuelto). */
export async function markTicketNotificationsAsRead(userId: string, ticketId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('related_ticket_id', ticketId)
    .eq('read', false);
  if (error) throw error;
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
  if (error) throw error;
}

/** Borra solo las del rol activo: estando como propietario no se borran las del conductor. */
export async function deleteAllNotifications(
  userId: string,
  audience: NotificationAudience
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .or(audienceFilter(audience));
  if (error) throw error;
}

export function subscribeToNotifications(
  userId: string,
  audience: NotificationAudience,
  onInsert: (notification: AppNotification) => void
): () => void {
  const channel = supabase
    .channel(`notifications:${userId}:${audience}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        const notification = mapNotificationRow(payload.new as never);
        if (matchesAudience(notification, audience)) onInsert(notification);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToMessageNotificationChanges(
  userId: string,
  audience: NotificationAudience,
  handlers: {
    onInsert?: (notification: AppNotification) => void;
    onRead?: (notification: AppNotification) => void;
    onDelete?: () => void;
  }
): () => void {
  const channel = supabase
    .channel(`message-notifications:${userId}:${audience}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        const notification = mapNotificationRow(payload.new as never);
        if (notification.type === 'new_message' && matchesAudience(notification, audience)) {
          handlers.onInsert?.(notification);
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        const notification = mapNotificationRow(payload.new as never);
        if (notification.type === 'new_message' && notification.read && matchesAudience(notification, audience)) {
          handlers.onRead?.(notification);
        }
      }
    )
    // En un DELETE, Postgres solo publica la clave primaria (salvo REPLICA IDENTITY FULL),
    // así que no podemos saber si era de tipo new_message: avisamos y que el consumidor recuente.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications' }, () => {
      handlers.onDelete?.();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
