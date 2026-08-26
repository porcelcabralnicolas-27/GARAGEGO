import { supabase } from '@/lib/supabase/client';

import type { OwnerStats } from './types';

const EMPTY_STATS: OwnerStats = {
  totalEarnings: 0,
  pendingCount: 0,
  confirmedCount: 0,
  completedCount: 0,
  cancelledCount: 0,
  activeListingsCount: 0,
  totalListingsCount: 0,
  averageRating: null,
  revenueByLot: [],
};

export async function getOwnerStats(ownerId: string): Promise<OwnerStats> {
  const { data: lots, error: lotsError } = await supabase
    .from('parking_lots')
    .select('id, name, is_active, rating_avg')
    .eq('owner_id', ownerId);
  if (lotsError) throw lotsError;
  if (lots.length === 0) return EMPTY_STATS;

  const lotIds = lots.map((l) => l.id);
  const lotsById = new Map(lots.map((l) => [l.id, l]));

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('parking_lot_id, status, total_price')
    .in('parking_lot_id', lotIds);
  if (bookingsError) throw bookingsError;

  let totalEarnings = 0;
  let pendingCount = 0;
  let confirmedCount = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  const revenueByLotMap = new Map<string, { revenue: number; bookingsCount: number }>();

  for (const booking of bookings) {
    if (booking.status === 'pending') pendingCount += 1;
    else if (booking.status === 'confirmed') confirmedCount += 1;
    else if (booking.status === 'cancelled') cancelledCount += 1;
    else if (booking.status === 'completed') {
      completedCount += 1;
      totalEarnings += booking.total_price;
      const current = revenueByLotMap.get(booking.parking_lot_id) ?? { revenue: 0, bookingsCount: 0 };
      current.revenue += booking.total_price;
      current.bookingsCount += 1;
      revenueByLotMap.set(booking.parking_lot_id, current);
    }
  }

  const ratedLots = lots.filter((l) => l.rating_avg > 0);
  const averageRating =
    ratedLots.length > 0 ? ratedLots.reduce((sum, l) => sum + l.rating_avg, 0) / ratedLots.length : null;

  const revenueByLot = [...revenueByLotMap.entries()]
    .map(([parkingLotId, value]) => ({
      parkingLotId,
      name: lotsById.get(parkingLotId)?.name ?? 'Estacionamiento',
      revenue: value.revenue,
      bookingsCount: value.bookingsCount,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    totalEarnings,
    pendingCount,
    confirmedCount,
    completedCount,
    cancelledCount,
    activeListingsCount: lots.filter((l) => l.is_active).length,
    totalListingsCount: lots.length,
    averageRating,
    revenueByLot,
  };
}
