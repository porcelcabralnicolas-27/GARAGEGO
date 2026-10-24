export type LotRevenue = {
  parkingLotId: string;
  name: string;
  revenue: number;
  bookingsCount: number;
};

export type OwnerStats = {
  totalEarnings: number;
  /** Reservas confirmadas que el conductor ya inició y todavía no finalizó. */
  activeSessionsCount: number;
  confirmedCount: number;
  completedCount: number;
  cancelledCount: number;
  activeListingsCount: number;
  totalListingsCount: number;
  averageRating: number | null;
  revenueByLot: LotRevenue[];
};
