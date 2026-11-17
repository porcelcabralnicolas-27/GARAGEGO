import { z } from 'zod';

import type { RegionCode } from '@/lib/region';

// Patentes argentinas: formato viejo (3 letras + 3 números, ej. ABC123) o
// formato Mercosur desde 2016 (2 letras + 3 números + 2 letras, ej. AB123CD).
const OLD_FORMAT_REGEX = /^[A-Z]{3}\d{3}$/;
const MERCOSUR_FORMAT_REGEX = /^[A-Z]{2}\d{3}[A-Z]{2}$/;

// Demo regional (Estados Unidos): patente estándar de auto particular de Nueva York, 3 letras y
// 4 números (ej. ABC-1234), la que se emite desde 2001. No se aceptan las personalizadas
// ("vanity plates").
const NEW_YORK_FORMAT_REGEX = /^[A-Z]{3}\d{4}$/;

export function normalizePlate(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidArgentinePlate(value: string): boolean {
  const normalized = normalizePlate(value);
  return OLD_FORMAT_REGEX.test(normalized) || MERCOSUR_FORMAT_REGEX.test(normalized);
}

export function isValidNewYorkPlate(value: string): boolean {
  return NEW_YORK_FORMAT_REGEX.test(normalizePlate(value));
}

/** Qué formato de patente se pide en cada región, con su ejemplo y su mensaje de error. */
export const PLATE_RULES: Record<RegionCode, { isValid: (value: string) => boolean; example: string; error: string }> = {
  AR: {
    isValid: isValidArgentinePlate,
    example: 'AB123CD',
    error: 'Patente inválida. Formato viejo: ABC123, formato Mercosur: AB123CD',
  },
  US: {
    isValid: isValidNewYorkPlate,
    example: 'ABC-1234',
    error: 'Patente inválida. Formato de Nueva York: 3 letras y 4 números (ABC-1234)',
  },
};

/** Validación del formulario de vehículo según la región activa (la patente cambia de formato). */
export function vehicleSchemaFor(region: RegionCode) {
  const rule = PLATE_RULES[region];
  return z.object({
    plate: z.string().trim().min(1, 'La patente es obligatoria').refine(rule.isValid, rule.error),
    brand: z.string().trim().min(1, 'La marca es obligatoria').max(40, 'Máximo 40 caracteres'),
    model: z.string().trim().min(1, 'El modelo es obligatorio').max(40, 'Máximo 40 caracteres'),
    color: z.string().trim().max(30, 'Máximo 30 caracteres').optional(),
  });
}

/** El formulario de Argentina (la región por defecto). */
export const vehicleSchema = vehicleSchemaFor('AR');

export type VehicleFormValues = z.infer<typeof vehicleSchema>;
