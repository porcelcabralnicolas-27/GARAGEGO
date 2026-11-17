import { FunctionsHttpError } from '@supabase/supabase-js';

import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/client';

import type { RegionCode } from '@/lib/region';

import type { Profile, UserRole } from './types';

function mapProfileRow(row: {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  avatar_url: string | null;
  active_role: 'client' | 'owner';
  is_owner_enabled: boolean;
  region: RegionCode;
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
    region: row.region === 'US' ? 'US' : 'AR',
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

/** Cambia la región del perfil (demo de presentación regional, 0086). */
export async function updateRegion(userId: string, region: RegionCode): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').update({ region }).eq('id', userId).select('*').single();
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

export type WalletTransaction = {
  id: string;
  type: 'topup' | 'booking_payment' | 'refund' | 'adjustment' | 'overtime_charge' | 'earning';
  amount: number;
  createdAt: string;
  /** 'mp:<pago>' en lo que entró por Mercado Pago, 'mp-refund:<pago>' en lo que se le devolvió (0084). */
  gatewayRef: string | null;
  relatedBookingId: string | null;
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
    .select('id, type, amount, created_at, payment_gateway_ref, related_booking_id')
    .eq('wallet_id', wallet.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return data.map((row) => ({
    id: row.id,
    type: row.type as WalletTransaction['type'],
    amount: row.amount,
    createdAt: row.created_at,
    gatewayRef: row.payment_gateway_ref,
    relatedBookingId: row.related_booking_id,
  }));
}

// ── Eliminar la cuenta (migración 0088 + Edge Function delete-account) ──────────────────────────

export type AccountDeletionCheck = {
  /** Reservas propias activas o próximas (incluidas las que esperan el pago). */
  driverBookings: number;
  /** Reservas activas o próximas que otros hicieron en sus cocheras. */
  ownerBookings: number;
  /** Saldo de la billetera, que se pierde al eliminar la cuenta. */
  walletBalance: number;
  /** Recargas de Mercado Pago que todavía esperan el pago (0100). */
  pendingTopups: number;
  /** Devoluciones de Mercado Pago pendientes (0100). */
  pendingRefunds: number;
  /** Documentos de titularidad sin revisar, que se borran con la cuenta (0100). */
  pendingDocuments: number;
};

/** Lo que hay que saber antes de pedir la confirmación. El control de verdad lo hace el servidor. */
export async function getAccountDeletionCheck(): Promise<AccountDeletionCheck> {
  const { data, error } = await supabase.rpc('account_deletion_check').single();
  if (error) throw error;
  return {
    driverBookings: data.driver_bookings,
    ownerBookings: data.owner_bookings,
    walletBalance: Number(data.wallet_balance),
    // Sin la 0100 no vienen: se toman como cero (el servidor igual controla al eliminar).
    pendingTopups: Number(data.pending_topups ?? 0),
    pendingRefunds: Number(data.pending_refunds ?? 0),
    pendingDocuments: Number(data.pending_documents ?? 0),
  };
}

/**
 * Da de baja la cuenta y cierra la sesión en este dispositivo. Si tiene reservas activas o
 * próximas, el servidor no toca nada y responde `account_has_active_bookings`.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) {
    const payload =
      error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(typeof payload?.error === 'string' ? payload.error : error.message);
  }
  // La sesión ya no vale en el servidor: se cierra solo acá (la global fallaría).
  await supabase.auth.signOut({ scope: 'local' });
}

export function getAccountDeletionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('account_has_active_bookings')) {
    return t('Tenés reservas activas o próximas. Cuando terminen o las canceles, vas a poder eliminar tu cuenta.');
  }
  if (message.includes('account_has_pending_topups')) {
    return t('Tenés recargas de Mercado Pago esperando el pago. Cuando se acrediten o venzan, vas a poder eliminar tu cuenta.');
  }
  if (message.includes('account_has_pending_refunds')) {
    return t('Tenés devoluciones de Mercado Pago pendientes. Cuando se completen, vas a poder eliminar tu cuenta.');
  }
  return t('No se pudo eliminar la cuenta. Revisá tu conexión y volvé a intentar.');
}
