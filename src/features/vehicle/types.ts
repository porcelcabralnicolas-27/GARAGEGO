// El máximo de vehículos por país lo configura el equipo en el panel (0093): `useAppLimits()`.

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
  /** URL firmada y con vencimiento: el bucket es privado (0077). Se llama así porque es lo que
   *  espera `PhotoUploader`. */
  publicUrl: string;
  position: number;
};
