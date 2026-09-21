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

export async function listMyRatedBookingIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('ratings').select('booking_id').eq('user_id', userId);
  if (error) throw error;
  return new Set(data.map((row) => row.booking_id));
}

export async function listRatingsForParkingLot(parkingLotId: string): Promise<RatingWithAuthor[]> {
  const { data: ratingRows, error } = await supabase
    .from('ratings')
    .select('*')
    .eq('parking_lot_id', parkingLotId)
    // Las reseñas que el equipo ocultó (migración 0044) no van en la ficha pública. La RLS ya
    // no las devolvería a un tercero, pero el autor sí ve la suya: se filtra acá para que
    // nadie las vea en el listado del lote.
    .eq('is_hidden', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (ratingRows.length === 0) return [];

  const userIds = [...new Set(ratingRows.map((r) => r.user_id))];
  const { data: authors, error: authorsError } = await supabase
    .from('public_profiles')
    .select('id, first_name, last_name')
    .in('id', userIds);
  if (authorsError) throw authorsError;
  const authorsById = new Map(authors.map((a) => [a.id, a]));

  return ratingRows.map((row) => {
    const rating = mapRatingRow(row);
    const author = authorsById.get(row.user_id);
    return { ...rating, authorName: author ? `${author.first_name} ${author.last_name}`.trim() : 'Usuario' };
  });
}

export function getRatingErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes('duplicate key') || message.includes('ratings_booking_id_key')) {
      return 'Ya calificaste esta reserva.';
    }
    return message;
  }
  return 'No se pudo enviar tu calificación. Intenta nuevamente.';
}
