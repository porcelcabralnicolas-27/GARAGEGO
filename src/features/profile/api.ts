import { supabase } from '@/lib/supabase/client';

import type { Profile, UserRole } from './types';

function mapProfileRow(row: {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  avatar_url: string | null;
  active_role: 'client' | 'owner';
  is_owner_enabled: boolean;
  created_at: string;
}): Profile {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    activeRole: row.active_role,
    isOwnerEnabled: row.is_owner_enabled,
    createdAt: row.created_at,
  };
}

export async function ensureProfile(): Promise<void> {
  const { error } = await supabase.rpc('ensure_profile');
  if (error) throw error;
}

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return mapProfileRow(data);
}

export async function updateProfile(
  userId: string,
  updates: { firstName: string; lastName: string; phone: string | null }
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ first_name: updates.firstName, last_name: updates.lastName, phone: updates.phone })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return mapProfileRow(data);
}

export async function switchActiveRole(userId: string, role: UserRole): Promise<Profile> {
  const updates: { active_role: UserRole; is_owner_enabled?: boolean } = { active_role: role };
  if (role === 'owner') updates.is_owner_enabled = true;

  const { data, error } = await supabase.from('profiles').update(updates).eq('id', userId).select('*').single();
  if (error) throw error;
  return mapProfileRow(data);
}

export async function getWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase.from('wallets').select('balance').eq('user_id', userId).single();
  if (error) throw error;
  return data.balance;
}

// Recarga manual de saldo — placeholder de desarrollo hasta integrar una pasarela de pago real.
export async function topupWallet(amount: number): Promise<void> {
  const { error } = await supabase.rpc('topup_wallet', { p_amount: amount });
  if (error) throw error;
}
