/**
 * Filtra los mensajes de error de Supabase/Postgres antes de mostrarlos en la app.
 *
 * Los mensajes que ESCRIBIMOS nosotros a mano (`raise exception 'código_o_frase'` en las
 * migraciones, o los que arma Supabase Auth) son legibles y no mencionan nada del esquema. Los
 * que arma Postgres solo — violación de constraint, columna inexistente, permiso denegado — sí
 * mencionan nombres de tabla, columna o constraint, que no le sirven a un usuario y no deberían
 * llegar a pantalla tal cual (auditoría técnica 2026-09-13, hallazgo 4.6).
 *
 * Cada `get*ErrorMessage` de `src/features/<feature>/api.ts` ya intercepta los códigos conocidos con
 * `.includes(...)`; esto es la red que atrapa lo que ninguno de esos `if` reconoció, antes de
 * mostrarlo. Antes, lo que no calzaba con ningún `if` se devolvía tal cual (`return message`).
 */
const POSTGRES_INTERNALS = [
  /violates?\s/i,
  /constraint/i,
  /relation\s+"/i,
  /column\s+"/i,
  /permission denied/i,
  /invalid input syntax/i,
  /duplicate key value/i,
  /\bPGRST\d+\b/, // códigos de error de PostgREST (p. ej. PGRST116)
];

export function sanitizeErrorMessage(message: string, fallback: string): string {
  return POSTGRES_INTERNALS.some((pattern) => pattern.test(message)) ? fallback : message;
}
