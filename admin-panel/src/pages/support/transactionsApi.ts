/**
 * Datos REALES de la pestaña Transacciones (migraciones 0042 + 0045). El admin no lee
 * `wallet_transactions` ni `wallets`: la lista viene de `admin_transactions()` y el resumen
 * de `admin_transaction_summary()`.
 */

import { supabase } from '../../lib/supabase';
import type { TransactionStatus, TransactionType } from '../../domain';

function guard(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase no está configurado (falta el .env del panel).');
  return supabase;
}

/** Desde qué vista del sistema se generó el movimiento. Se deduce del tipo, no del perfil:
 *  `is_owner_enabled` es un flag permanente y no dice desde qué lado se hizo la acción. */
export type TransactionSide = 'conductor' | 'propietario' | 'sistema';

export const TRANSACTION_SIDE: Record<TransactionType, TransactionSide> = {
  topup: 'conductor',
  booking_payment: 'conductor',
  refund: 'conductor',
  overtime_charge: 'conductor',
  earning: 'propietario',
  adjustment: 'sistema',
};

export const TRANSACTION_SIDE_LABEL: Record<TransactionSide, string> = {
  conductor: 'Como conductor',
  propietario: 'Como propietario',
  sistema: 'Ajuste del sistema',
};

export type PanelTransaction = {
  id: string;
  createdAt: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  paymentGatewayRef: string | null;
  relatedBookingId: string | null;
  userName: string;
  side: TransactionSide;
  lotName: string | null;
  /** Saldo ficticio de la recarga de prueba (0061): no tiene valor monetario. */
  isDemo: boolean;
};

export type TransactionSummary = {
  volume: number;
  topups: number;
  payments: number;
  refunds: number;
  overtime: number;
  earnings: number;
};

type TxRow = {
  id: string;
  created_at: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  payment_gateway_ref: string | null;
  related_booking_id: string | null;
  user_name: string;
  lot_name: string | null;
  is_demo: boolean;
};

export const TRANSACTIONS_PAGE_SIZE = 50;

export type TransactionFilters = {
  type: TransactionType | null;
  status: TransactionStatus | null;
  search: string;
};

export type TransactionCursor = { createdAt: string; id: string };

/**
 * Una página de movimientos, del más nuevo al más viejo (admin_transactions, 0061). Los filtros
 * los aplica el servidor: así se encuentra cualquier movimiento, no solo los ya cargados.
 */
export async function fetchTransactionsPage(
  filters: TransactionFilters,
  cursor: TransactionCursor | null
): Promise<{ rows: PanelTransaction[]; nextCursor: TransactionCursor | null }> {
  const { data, error } = await guard().rpc('admin_transactions', {
    p_limit: TRANSACTIONS_PAGE_SIZE,
    p_type: filters.type,
    p_status: filters.status,
    p_search: filters.search.trim() || null,
    p_cursor_created: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  if (error) throw error;

  const rows = ((data ?? []) as TxRow[]).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    type: r.type,
    amount: Number(r.amount),
    status: r.status,
    paymentGatewayRef: r.payment_gateway_ref,
    relatedBookingId: r.related_booking_id,
    userName: r.user_name,
    side: TRANSACTION_SIDE[r.type] ?? 'sistema',
    lotName: r.lot_name,
    isDemo: r.is_demo,
  }));
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor: rows.length === TRANSACTIONS_PAGE_SIZE && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

export async function fetchTransactionSummary(): Promise<TransactionSummary> {
  const { data, error } = await guard().rpc('admin_transaction_summary', { p_days: 30 });
  if (error) throw error;
  const s = ((data ?? []) as TransactionSummary[])[0];
  return {
    volume: Number(s?.volume ?? 0),
    topups: Number(s?.topups ?? 0),
    payments: Number(s?.payments ?? 0),
    refunds: Number(s?.refunds ?? 0),
    overtime: Number(s?.overtime ?? 0),
    earnings: Number(s?.earnings ?? 0),
  };
}
