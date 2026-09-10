/**
 * Datos REALES de las reseñas para el panel (migración 0044).
 *
 * El admin lee `ratings` por policy (`... or is_admin()`), `profiles` y `parking_lots` también.
 * Solo la acción de ocultar/restaurar va por RPC (`ratings` no tiene policy de UPDATE).
 */

import { supabase } from '../../lib/supabase';

function guard(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase no está configurado (falta el .env del panel).');
  return supabase;
}

export type PanelRating = {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  isHidden: boolean;
  hiddenReason: string | null;
  authorName: string;
  lotName: string | null;
  ownerName: string | null;
};

type RatingRow = {
  id: string;
  user_id: string;
  parking_lot_id: string;
  score: number;
  comment: string | null;
  created_at: string;
  is_hidden: boolean;
  hidden_reason: string | null;
};

const nameOf = (p?: { first_name: string | null; last_name: string | null }) =>
  p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Usuario' : 'Usuario';

export async function fetchRatings(): Promise<PanelRating[]> {
  const db = guard();

  const { data: ratings, error } = await db
    .from('ratings')
    .select('id, user_id, parking_lot_id, score, comment, created_at, is_hidden, hidden_reason')
    .order('created_at', { ascending: false })
    .returns<RatingRow[]>();
  if (error) throw error;
  if (!ratings || ratings.length === 0) return [];

  const lotIds = [...new Set(ratings.map((r) => r.parking_lot_id))];
  const { data: lots, error: lotsError } = await db
    .from('parking_lots')
    .select('id, name, owner_id')
    .in('id', lotIds)
    .returns<{ id: string; name: string; owner_id: string }[]>();
  if (lotsError) throw lotsError;
  const lotById = new Map((lots ?? []).map((l) => [l.id, l]));

  const personIds = [
    ...new Set([
      ...ratings.map((r) => r.user_id),
      ...(lots ?? []).map((l) => l.owner_id),
    ]),
  ];
  const { data: people, error: peopleError } = await db
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', personIds)
    .returns<{ id: string; first_name: string | null; last_name: string | null }[]>();
  if (peopleError) throw peopleError;
  const personById = new Map((people ?? []).map((p) => [p.id, p]));

  return ratings.map((r) => {
    const lot = lotById.get(r.parking_lot_id);
    return {
      id: r.id,
      score: r.score,
      comment: r.comment,
      createdAt: r.created_at,
      isHidden: r.is_hidden,
      hiddenReason: r.hidden_reason,
      authorName: nameOf(personById.get(r.user_id)),
      lotName: lot?.name ?? null,
      ownerName: lot ? nameOf(personById.get(lot.owner_id)) : null,
    };
  });
}

export async function setRatingHidden(
  ratingId: string,
  hidden: boolean,
  reason: string | null
): Promise<void> {
  const { error } = await guard().rpc('admin_set_rating_hidden', {
    p_rating_id: ratingId,
    p_hidden: hidden,
    p_reason: reason,
  });
  if (error) throw error;
}

export type RatingStats = {
  average: number;
  total: number;
  lowRatePct: number;
  hidden: number;
};

export function computeRatingStats(rows: PanelRating[], now: number): RatingStats {
  const visible = rows.filter((r) => !r.isHidden);
  const last30 = visible.filter((r) => new Date(r.createdAt).getTime() > now - 30 * 86_400_000);
  const low = last30.filter((r) => r.score <= 2).length;
  return {
    average: visible.length ? visible.reduce((s, r) => s + r.score, 0) / visible.length : 0,
    total: rows.length,
    lowRatePct: last30.length ? Math.round((low / last30.length) * 100) : 0,
    hidden: rows.filter((r) => r.isHidden).length,
  };
}
