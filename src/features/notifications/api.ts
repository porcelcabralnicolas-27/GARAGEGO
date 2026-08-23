import { supabase } from '@/lib/supabase/client';

import type { AppNotification } from './types';

function mapNotificationRow(row: {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  type: string;
  read: boolean;
  created_at: string;
}): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    type: row.type,
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
