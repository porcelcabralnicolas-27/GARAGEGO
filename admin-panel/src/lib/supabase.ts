import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase. Es lo ÚNICO del panel que toca datos reales: se usa para el login y para
 * leer la bandera `is_admin` del propio perfil. Todo el resto de las pantallas trabaja con mocks.
 *
 * Si faltan las variables de entorno no se tira una excepción: se expone `configError` y la app
 * muestra una pantalla explicando qué falta. Un `throw` acá dejaría la pantalla en blanco, que es
 * la peor forma de enterarse de que no copiaste el `.env`.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const configError: string | null =
  !url || !anonKey
    ? 'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. Copiá .env.example a .env y completalos con los mismos valores del .env de la raíz del repo.'
    : null;

export const supabase: SupabaseClient | null =
  configError === null ? createClient(url as string, anonKey as string) : null;
