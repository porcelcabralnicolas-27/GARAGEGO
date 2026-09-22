import { sanitizeErrorMessage } from '@/lib/errorMessages';
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
// La migración 0057 le pone un techo al saldo resultante (`topup_limit_reached`).
export async function topupWallet(amount: number): Promise<void> {
  const { error } = await supabase.rpc('topup_wallet', { p_amount: amount });
  if (error) throw error;
}

export function getTopupErrorMessage(error: unknown): string {
  const fallback = 'No se pudo recargar el saldo.';
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes('topup_limit_reached')) {
      return 'Llegaste al tope de saldo de prueba. Usá el que tenés antes de recargar de nuevo.';
    }
    return sanitizeErrorMessage(message, fallback);
  }
  return fallback;
}

export type WalletTransaction = {
  id: string;
  type: 'topup' | 'booking_payment' | 'refund' | 'adjustment' | 'overtime_charge' | 'earning';
  amount: number;
  createdAt: string;
};

/** Movimientos de la billetera del usuario, del más nuevo al más viejo. Alimenta el feed
 *  "Pagos recientes" del panel del propietario. RLS: la policy `wallet_transactions_select_own`
 *  ya restringe a las filas de la billetera propia. */
export async function listRecentTransactions(userId: string, limit = 5): Promise<WalletTransaction[]> {
  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('id')
    .eq('user_id', userId)
    .single();
  if (walletError) throw walletError;

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, type, amount, created_at')
    .eq('wallet_id', wallet.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return data.map((row) => ({
    id: row.id,
    type: row.type as WalletTransaction['type'],
    amount: row.amount,
    createdAt: row.created_at,
  }));
}
