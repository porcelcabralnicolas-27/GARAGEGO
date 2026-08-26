import { supabase } from '@/lib/supabase/client';

import type { AppNotification } from './types';

function mapNotificationRow(row: {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  type: string;
  related_booking_id: string | null;
  read: boolean;
  created_at: string;
}): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    type: row.type,
    relatedBookingId: row.related_booking_id,
    read: row.read,
    createdAt: row.created_at,
  };
}

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(mapNotificationRow);
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  if (error) throw error;
}

export async function countUnreadMessageNotifications(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'new_message')
    .eq('read', false);
  if (error) throw error;
  return count ?? 0;
}

export async function listUnreadMessageNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'new_message')
    .eq('read', false);
  if (error) throw error;
  return data.map(mapNotificationRow);
}

/**
 * Marca como leídas las notificaciones de mensaje de una conversación completa.
 * Recibe varias reservas porque un chat agrupa todas las reservas del mismo estacionamiento.
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

export async function deleteNotification(notificationId: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
  if (error) throw error;
}

export async function deleteAllNotifications(userId: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('user_id', userId);
  if (error) throw error;
}

export function subscribeToNotifications(userId: string, onInsert: (notification: AppNotification) => void): () => void {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onInsert(mapNotificationRow(payload.new as never))
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToMessageNotificationChanges(
  userId: string,
  handlers: {
    onInsert?: (notification: AppNotification) => void;
    onRead?: (notification: AppNotification) => void;
    onDelete?: () => void;
  }
): () => void {
  const channel = supabase
    .channel(`message-notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        const notification = mapNotificationRow(payload.new as never);
        if (notification.type === 'new_message') handlers.onInsert?.(notification);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        const notification = mapNotificationRow(payload.new as never);
        if (notification.type === 'new_message' && notification.read) handlers.onRead?.(notification);
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
