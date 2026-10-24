import { z } from 'zod';

/**
 * Valida un teléfono celular argentino, aceptando cómo lo escribe la gente de verdad:
 * separadores libres (espacios, guiones, paréntesis, puntos) y los prefijos opcionales
 * +54 / 54, el 9 de celular internacional, el 0 de larga distancia y el 15 nacional.
 *
 * Ojo: en Argentina NO se puede distinguir un celular de un fijo mirando el número —
 * los dos son código de área + abonado, 10 dígitos en total. Lo único que marca celular
 * es el 15 o el +54 9, que la mayoría de la gente omite al escribirlo. Así que esto valida
 * "teléfono argentino bien formado", que es lo máximo exigible sin rechazar celulares
 * escritos de la forma más común.
 */
function isValidArgentinePhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');

  // +54 / 54 al principio (código de país).
  let rest = digits.startsWith('54') ? digits.slice(2) : digits;
  // 9 de celular internacional, o 0 de larga distancia nacional. Son mutuamente excluyentes.
  if (rest.startsWith('9') && rest.length === 11) rest = rest.slice(1);
  else if (rest.startsWith('0')) rest = rest.slice(1);
  // 15 de celular en discado nacional, después del código de área (2 a 4 dígitos).
  const with15 = rest.match(/^(\d{2,4})15(\d+)$/);
  if (with15) rest = `${with15[1]}${with15[2]}`;

  // Código de área (2 a 4 dígitos) + abonado, siempre 10 dígitos en total.
  return /^\d{10}$/.test(rest);
}

export const editProfileSchema = z.object({
  firstName: z.string().min(1, 'El nombre es obligatorio'),
  lastName: z.string().min(1, 'El apellido es obligatorio'),
  // Sigue siendo opcional: se puede dejar vacío, pero si se escribe algo tiene que ser válido.
  phone: z
    .string()
    .optional()
    .refine((value) => !value || value.trim() === '' || isValidArgentinePhone(value), {
      message: 'Ingresá un celular válido, por ejemplo 11 1234-5678.',
    }),
});

export type EditProfileFormValues = z.infer<typeof editProfileSchema>;
