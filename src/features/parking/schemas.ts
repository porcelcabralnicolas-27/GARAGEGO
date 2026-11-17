import { z } from 'zod';

import { LOT_TYPES } from '../../../shared/domain';

/** Rango de capacidad. Lo configura el equipo en el panel y lo controla el servidor (0093). */
export type CapacityRange = { min: number; max: number };

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

/**
 * Paso 2: tipo de publicación, tarifa por hora, capacidad y servicios.
 *
 * `keepCapacity` es la capacidad que ya tenía la cochera al editarla: se acepta aunque haya
 * quedado fuera del rango (el equipo puede haber bajado el máximo), igual que en el servidor, que
 * solo controla la capacidad cuando cambia.
 */
export function ratesSchemaFor(range: CapacityRange, keepCapacity?: number) {
  return z.object({
    lotType: z.enum(LOT_TYPES),
    pricePerHour: z
      .string()
      .min(1, 'El precio es obligatorio')
      .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'El precio debe ser mayor a 0'),
    capacity: z
      .number()
      .int()
      .superRefine((value, ctx) => {
        if (value === keepCapacity) return;
        if (value < range.min) ctx.addIssue({ code: 'custom', message: `La capacidad mínima es ${range.min}` });
        else if (value > range.max) ctx.addIssue({ code: 'custom', message: `La capacidad máxima es ${range.max}` });
      }),
    // Códigos del catálogo de servicios (0094): la base controla que existan y estén activos.
    amenities: z.array(z.string()),
  });
}

/** Con el rango de siempre (1 a 50): para tipar el formulario y en los tests. */
export const ratesSchema = ratesSchemaFor({ min: 1, max: 50 });

export type PlaceFormValues = z.infer<typeof placeSchema>;
export type RatesFormValues = z.infer<typeof ratesSchema>;
