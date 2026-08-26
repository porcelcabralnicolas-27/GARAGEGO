import { z } from 'zod';

// Patentes argentinas: formato viejo (3 letras + 3 números, ej. ABC123) o
// formato Mercosur desde 2016 (2 letras + 3 números + 2 letras, ej. AB123CD).
const OLD_FORMAT_REGEX = /^[A-Z]{3}\d{3}$/;
const MERCOSUR_FORMAT_REGEX = /^[A-Z]{2}\d{3}[A-Z]{2}$/;

export function normalizePlate(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidArgentinePlate(value: string): boolean {
  const normalized = normalizePlate(value);
  return OLD_FORMAT_REGEX.test(normalized) || MERCOSUR_FORMAT_REGEX.test(normalized);
}

export const vehicleSchema = z.object({
  plate: z
    .string()
    .trim()
    .min(1, 'La patente es obligatoria')
    .refine(isValidArgentinePlate, 'Patente inválida. Formato viejo: ABC123, formato Mercosur: AB123CD'),
  brand: z.string().trim().max(40, 'Máximo 40 caracteres').optional(),
  model: z.string().trim().max(40, 'Máximo 40 caracteres').optional(),
  color: z.string().trim().max(30, 'Máximo 30 caracteres').optional(),
});

export type VehicleFormValues = z.infer<typeof vehicleSchema>;
