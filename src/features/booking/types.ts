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
  /** Si el conductor ya la calificó. */
  isRated: boolean;
};

/** El detalle de una reserva del conductor, con el vehículo con el que se hizo (0069). */
export type ClientBookingDetail = ClientBookingItem & {
  vehicle: BookingVehicleInfo | null;
};

/** Qué reservas trae un listado: las vigentes (pending / confirmed) o el historial. */
export type BookingScope = 'active' | 'history';

/** Cursor de los listados de reservas: el orden es (date, start_time, id) descendente. */
export type BookingCursor = { date: string; startTime: string; id: string };

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

export type OwnerBookingDetail = OwnerBookingItem & {
  parkingLotAddress: string;
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Finalizada',
};
