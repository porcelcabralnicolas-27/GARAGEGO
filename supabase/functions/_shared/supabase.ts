import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { env } from './http.ts';

/**
 * Cliente con el rol de servicio: saltea la RLS y es el único que puede llamar a
 * apply_mp_payment / record_mp_refund y leer mp_checkout_attempts / mp_payments.
 */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente que actúa como el usuario que llamó (auth.uid() dentro de las RPC es él). */
export function userClient(authorization: string): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** El id del usuario dueño del JWT, o null si no hay sesión válida. */
export async function userIdFromRequest(req: Request): Promise<string | null> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const { data, error } = await adminClient().auth.getUser(authorization.slice('Bearer '.length));
  if (error || !data.user) return null;
  return data.user.id;
}
