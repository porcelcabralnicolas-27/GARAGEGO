import { z } from 'zod';

import { AMENITIES } from '../../../shared/domain';

/** Mismo rango que el check `parking_lots_capacity_range` (0064). */
export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 50;

// La publicación se carga en dos pasos del asistente: los datos del lugar y la tarifa con los
// servicios. Cada uno tiene su propio esquema; el lote completo es la unión de los dos.

/** Paso 1: nombre, descripción, dirección y ubicación en el mapa. */
export const placeSchema = z.object({
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
});

/** Paso 2: tarifa por hora, capacidad y servicios. */
export const ratesSchema = z.object({
  pricePerHour: z
    .string()
    .min(1, 'El precio es obligatorio')
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'El precio debe ser mayor a 0'),
  capacity: z
    .number()
    .int()
    .min(MIN_CAPACITY, `La capacidad mínima es ${MIN_CAPACITY}`)
    .max(MAX_CAPACITY, `La capacidad máxima es ${MAX_CAPACITY}`),
  amenities: z.array(z.enum(AMENITIES)),
});

export type PlaceFormValues = z.infer<typeof placeSchema>;
export type RatesFormValues = z.infer<typeof ratesSchema>;
