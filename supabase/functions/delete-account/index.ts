// delete-account — la llama la app (usuario logueado) desde Ajustes > Eliminar cuenta.
//
// 1. `delete_account_data` (migraciones 0088 y 0100): si tiene reservas activas o próximas, recargas
//    de Mercado Pago esperando el pago o devoluciones pendientes, falla y no se toca nada. Si no,
//    archiva sus cocheras, borra sus vehículos, notificaciones y documentos pendientes, y anonimiza
//    el perfil. Si la cuenta ya estaba dada de baja, devuelve 'already_deleted' sin tocar nada.
// 2. Borra los archivos que la base no puede borrar: fotos de sus vehículos y documentos de
//    titularidad (buckets privados).
// 3. Da de baja al usuario de Auth con el borrado "suave" de Supabase: se le quitan el correo y
//    el inicio con Google y no puede volver a entrar. No se borra la fila de auth.users porque
//    arrastraría en cascada las reservas y la billetera, que la otra parte necesita.
//
// El id sale del JWT: nadie puede dar de baja la cuenta de otro. Repetir la llamada es seguro.

import { json, preflight } from '../_shared/http.ts';
import { adminClient, userIdFromRequest } from '../_shared/supabase.ts';

const VEHICLE_BUCKET = 'vehicle-images';
const DOCS_BUCKET = 'ownership-docs';

/** Motivos por los que todavía no se puede dar de baja (409: el usuario tiene que esperar). */
const BLOCKING_ERRORS = ['account_has_active_bookings', 'account_has_pending_topups', 'account_has_pending_refunds'];

type Admin = ReturnType<typeof adminClient>;

/** Borra todo lo de {usuario}/{carpeta}/archivo en un bucket. No frena la baja si falla. */
async function removeUserFolder(admin: Admin, bucket: string, userId: string): Promise<void> {
  try {
    const { data: folders } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
    const paths: string[] = [];
    for (const folder of folders ?? []) {
      const { data: files } = await admin.storage.from(bucket).list(`${userId}/${folder.name}`, { limit: 1000 });
      for (const file of files ?? []) paths.push(`${userId}/${folder.name}/${file.name}`);
    }
    if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
  } catch (error) {
    console.warn(`delete-account: no se pudieron borrar los archivos de ${bucket}`, error);
  }
}

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const userId = await userIdFromRequest(req);
  if (!userId) return json({ error: 'No autenticado' }, 401);

  const admin = adminClient();

  const { data: outcome, error: dataError } = await admin.rpc('delete_account_data', { p_user_id: userId });
  if (dataError) {
    const blocking = BLOCKING_ERRORS.find((code) => dataError.message.includes(code));
    return json({ error: blocking ?? dataError.message }, blocking ? 409 : 400);
  }

  // Archivos privados del usuario. Se repite también si ya estaba dada de baja: si una corrida
  // anterior se cortó en el medio, esta termina la limpieza.
  await removeUserFolder(admin, VEHICLE_BUCKET, userId);
  await removeUserFolder(admin, DOCS_BUCKET, userId);

  const { error: authError } = await admin.auth.admin.deleteUser(userId, true);
  // Repetir la baja: el usuario de Auth ya no existe y no es un error.
  if (authError && !(outcome === 'already_deleted' && /not.?found/i.test(authError.message))) {
    return json({ error: authError.message }, 500);
  }

  return json({ ok: true, outcome });
});
