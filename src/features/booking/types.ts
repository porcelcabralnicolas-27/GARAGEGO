export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export type Booking = {
  id: string;
  userId: string;
  parkingLotId: string;
  vehicleId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  totalPrice: number;
  actualStartAt: string | null;
  actualEndAt: string | null;
  overtimeMinutes: number;
  overtimeCharge: number;
  createdAt: string;
};

export type ClientBookingItem = Booking & {
  parkingLotName: string;
  parkingLotAddress: string;
};

export type BookingVehicleInfo = {
  plate: string;
  brand: string | null;
  model: string | null;
};

export type OwnerBookingItem = Booking & {
  parkingLotName: string;
  clientName: string;
  vehicle: BookingVehicleInfo | null;
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Finalizada',
};
