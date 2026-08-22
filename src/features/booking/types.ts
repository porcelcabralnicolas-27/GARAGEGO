export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export type Booking = {
  id: string;
  userId: string;
  parkingLotId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  totalPrice: number;
  createdAt: string;
};

export type ClientBookingItem = Booking & {
  parkingLotName: string;
  parkingLotAddress: string;
};

export type OwnerBookingItem = Booking & {
  parkingLotName: string;
  clientName: string;
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Finalizada',
};
