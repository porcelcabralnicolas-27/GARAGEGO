/**
 * Datos REALES de la sección Usuarios (migración 0043). `profiles` y `ratings` los lee el
 * admin por policy; el email (`auth.users`) y todo lo derivado (vehículos, reservas, plata)
 * viene por RPCs `security definer`.
 */

import { supabase } from '../../lib/supabase';

function guard(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase no está configurado (falta el .env del panel).');
  return supabase;
}

export type UserDirectoryEntry = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  activeRole: 'client' | 'owner';
  isOwnerEnabled: boolean;
  createdAt: string;
  email: string | null;
  vehiclesCount: number;
  bookingsMade: number;
  lotsTotal: number;
  lotsLive: number;
  lotsPending: number;
  bookingsReceived: number;
  ratingAvg: number | null;
  earnings: number;
};

type DirectoryRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  active_role: 'client' | 'owner';
  is_owner_enabled: boolean;
  created_at: string;
  email: string | null;
  vehicles_count: number;
  bookings_made: number;
  lots_total: number;
  lots_live: number;
  lots_pending: number;
  bookings_received: number;
  rating_avg: number | null;
  earnings: number;
};

export async function fetchUserDirectory(): Promise<UserDirectoryEntry[]> {
  const { data, error } = await guard().rpc('admin_user_directory');
  if (error) throw error;

  return ((data ?? []) as DirectoryRow[]).map((r) => ({
    id: r.id,
    firstName: r.first_name ?? '',
    lastName: r.last_name ?? '',
    phone: r.phone,
    avatarUrl: r.avatar_url,
    activeRole: r.active_role,
    isOwnerEnabled: r.is_owner_enabled,
    createdAt: r.created_at,
    email: r.email,
    vehiclesCount: r.vehicles_count,
    bookingsMade: r.bookings_made,
    lotsTotal: r.lots_total,
    lotsLive: r.lots_live,
    lotsPending: r.lots_pending,
    bookingsReceived: r.bookings_received,
    ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg),
    earnings: Number(r.earnings),
  }));
}

export type UserDetail = {
  email: string | null;
  balance: number;
  vehicles: { plate: string; brand: string | null; model: string | null; color: string | null }[];
  lots: { name: string; approvalStatus: string; moderationState: string }[];
  recentBookings: { lot_name: string; date: string; total_price: number }[];
  recentTransactions: { type: string; amount: number; status: string; created_at: string }[];
};

export async function fetchUserDetail(userId: string): Promise<UserDetail> {
  const { data, error } = await guard().rpc('admin_user_detail', { p_user_id: userId });
  if (error) throw error;
  return data as UserDetail;
}
