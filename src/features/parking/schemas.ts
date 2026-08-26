import { z } from 'zod';

export const parkingLotSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  description: z.string().optional(),
  address: z.string().min(1, 'La dirección es obligatoria'),
  latitude: z
    .string()
    .min(1, 'La latitud es obligatoria')
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= -90 && Number(v) <= 90, 'Latitud inválida'),
  longitude: z
    .string()
    .min(1, 'La longitud es obligatoria')
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= -180 && Number(v) <= 180, 'Longitud inválida'),
  pricePerHour: z
    .string()
    .min(1, 'El precio es obligatorio')
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'El precio debe ser mayor a 0'),
});

export type ParkingLotFormValues = z.infer<typeof parkingLotSchema>;
