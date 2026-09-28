import { z } from 'zod';

/** Mismo rango que el check `parking_lots_capacity_range` (0064). */
export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 50;

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
  capacity: z
    .number()
    .int()
    .min(MIN_CAPACITY, `La capacidad mínima es ${MIN_CAPACITY}`)
    .max(MAX_CAPACITY, `La capacidad máxima es ${MAX_CAPACITY}`),
});

export type ParkingLotFormValues = z.infer<typeof parkingLotSchema>;
