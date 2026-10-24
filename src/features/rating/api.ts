import { sanitizeErrorMessage } from '@/lib/errorMessages';
import { toPage, type Page } from '@/lib/pagination';
import { supabase } from '@/lib/supabase/client';

import type { Rating, RatingWithAuthor } from './types';

function mapRatingRow(row: {
  id: string;
  booking_id: string;
  user_id: string;
  parking_lot_id: string;
  score: number;
  comment: string | null;
  created_at: string;
}): Rating {
  return {
    id: row.id,
    bookingId: row.booking_id,
    userId: row.user_id,
    parkingLotId: row.parking_lot_id,
    score: row.score,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

export async function createRating(params: {
  bookingId: string;
  parkingLotId: string;
  userId: string;
  score: number;
  comment: string | null;
}): Promise<void> {
  const { error } = await supabase.from('ratings').insert({
    booking_id: params.bookingId,
    parking_lot_id: params.parkingLotId,
    user_id: params.userId,
    score: params.score,
    comment: params.comment,
  });
  if (error) throw error;
}

export const RATINGS_PAGE_SIZE = 10;

export type RatingCursor = { createdAt: string; id: string };

/**
 * Una página de las reseñas públicas de una cochera, con el nombre del autor
 * (list_parking_lot_ratings, 0059). Las que el equipo ocultó (0044) no vienen.
 */
export async function listRatingsPage(
  parkingLotId: string,
  cursor: RatingCursor | null = null
): Promise<Page<RatingWithAuthor, RatingCursor>> {
  const { data, error } = await supabase.rpc('list_parking_lot_ratings', {
    p_parking_lot_id: parkingLotId,
    p_limit: RATINGS_PAGE_SIZE,
    p_cursor_created: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  if (error) throw error;

  const items = data.map((row) => ({ ...mapRatingRow(row), authorName: row.author_name ?? 'Usuario' }));
  return toPage(items, RATINGS_PAGE_SIZE, (last) => ({ createdAt: last.createdAt, id: last.id }));
}

export function getRatingErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes('duplicate key') || message.includes('ratings_booking_id_key')) {
      return 'Ya calificaste esta reserva.';
    }
    return sanitizeErrorMessage(message, 'No se pudo enviar tu calificación. Intenta nuevamente.');
  }
  return 'No se pudo enviar tu calificación. Intenta nuevamente.';
}
