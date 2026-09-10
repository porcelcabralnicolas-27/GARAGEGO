/**
 * Datos REALES del Dashboard (migración 0042). El admin no tiene RLS sobre `bookings`,
 * `vehicles` ni `wallet_transactions`: todo viene por RPCs `security definer`.
 * `parking_lots` sí lo lee por policy, así que el total de cocheras publicables va directo.
 */

import { supabase } from '../../lib/supabase';

function guard(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase no está configurado (falta el .env del panel).');
  return supabase;
}

export type DashActiveSession = {
  bookingId: string;
  lotName: string;
  lotAddress: string;
  ownerName: string;
  driverName: string;
  plate: string | null;
  totalPrice: number;
  endTime: string;
  /** ms desde que el conductor entró. */
  elapsedMs: number;
  /** ms pasados del fin reservado. Negativo = todavía le queda tiempo. */
  overMs: number;
};

export type TransactionSummary = {
  volume: number;
  topups: number;
  payments: number;
  refunds: number;
  overtime: number;
  earnings: number;
};

export type DashboardData = {
  activeSessions: DashActiveSession[];
  publishableLots: number;
  busyLots: number;
  txSummary: TransactionSummary;
};

type ActiveSessionRow = {
  booking_id: string;
  lot_id: string;
  lot_name: string;
  lot_address: string;
  owner_name: string;
  driver_name: string;
  plate: string | null;
  actual_start_at: string;
  scheduled_end: string;
  end_time: string;
  total_price: number;
};

export async function fetchDashboard(): Promise<DashboardData> {
  const db = guard();

  const [sessionsRes, lotsRes, txRes] = await Promise.all([
    db.rpc('admin_active_sessions'),
    db
      .from('parking_lots')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('approval_status', 'approved')
      .eq('moderation_state', 'live'),
    db.rpc('admin_transaction_summary', { p_days: 30 }),
  ]);
  if (sessionsRes.error) throw sessionsRes.error;
  if (lotsRes.error) throw lotsRes.error;
  if (txRes.error) throw txRes.error;

  const now = Date.now();
  const activeSessions: DashActiveSession[] = ((sessionsRes.data ?? []) as ActiveSessionRow[]).map(
    (r) => ({
      bookingId: r.booking_id,
      lotName: r.lot_name,
      lotAddress: r.lot_address,
      ownerName: r.owner_name,
      driverName: r.driver_name,
      plate: r.plate,
      totalPrice: r.total_price,
      endTime: r.end_time.slice(0, 5),
      elapsedMs: now - new Date(r.actual_start_at).getTime(),
      overMs: now - new Date(r.scheduled_end).getTime(),
    })
  );

  const busyLots = new Set(
    ((sessionsRes.data ?? []) as ActiveSessionRow[]).map((r) => r.lot_id)
  ).size;

  const tx = ((txRes.data ?? []) as TransactionSummary[])[0] ?? {
    volume: 0,
    topups: 0,
    payments: 0,
    refunds: 0,
    overtime: 0,
    earnings: 0,
  };

  return {
    activeSessions,
    publishableLots: lotsRes.count ?? 0,
    busyLots,
    txSummary: {
      volume: Number(tx.volume),
      topups: Number(tx.topups),
      payments: Number(tx.payments),
      refunds: Number(tx.refunds),
      overtime: Number(tx.overtime),
      earnings: Number(tx.earnings),
    },
  };
}

export type GrowthRange = '30d' | '6m' | '12m';

const RANGE_CONFIG: Record<GrowthRange, { days: number; buckets: number }> = {
  '30d': { days: 30, buckets: 30 },
  '6m': { days: 182, buckets: 26 },
  '12m': { days: 365, buckets: 12 },
};

export type GrowthPoint = {
  label: string;
  /** Altas de usuarios en el bucket. */
  newUsers: number;
  /** De esas, cuántas publicaron su primera cochera (subconjunto). */
  newHosts: number;
  cumUsers: number;
  cumHosts: number;
};

type GrowthRow = {
  bucket_end: string;
  new_users: number;
  new_hosts: number;
  cum_users: number;
  cum_hosts: number;
};

function bucketLabel(iso: string, range: GrowthRange): string {
  const date = new Date(iso);
  if (range === '12m') return date.toLocaleDateString('es-AR', { month: 'short' });
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export async function fetchGrowth(range: GrowthRange): Promise<GrowthPoint[]> {
  const { days, buckets } = RANGE_CONFIG[range];
  const { data, error } = await guard().rpc('admin_growth', { p_days: days, p_buckets: buckets });
  if (error) throw error;

  return ((data ?? []) as GrowthRow[]).map((r) => ({
    label: bucketLabel(r.bucket_end, range),
    newUsers: r.new_users,
    newHosts: r.new_hosts,
    cumUsers: r.cum_users,
    cumHosts: r.cum_hosts,
  }));
}
