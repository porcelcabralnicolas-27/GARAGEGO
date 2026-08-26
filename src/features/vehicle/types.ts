export const MAX_VEHICLES = 3;

export type Vehicle = {
  id: string;
  userId: string;
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  createdAt: string;
};

export type VehicleImage = {
  id: string;
  vehicleId: string;
  storagePath: string;
  publicUrl: string;
  position: number;
};
