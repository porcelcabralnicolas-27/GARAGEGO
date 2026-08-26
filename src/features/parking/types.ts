export type ParkingLot = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  address: string;
  latitude: number;
  longitude: number;
  pricePerHour: number;
  ratingAvg: number;
  isActive: boolean;
  createdAt: string;
};

export type ParkingLotWithDistance = ParkingLot & { distanceKm: number };

export const MAX_PARKING_IMAGES = 3;

export type ParkingImage = {
  id: string;
  parkingLotId: string;
  storagePath: string;
  publicUrl: string;
  position: number;
};

export type RecurringAvailability = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type AvailabilityException = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  isAvailable: boolean;
};

export const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
