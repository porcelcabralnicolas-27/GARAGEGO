// delete-account — la llama la app (usuario logueado) desde Ajustes > Eliminar cuenta.
//
// 1. `delete_account_data` (migración 0088): si tiene reservas activas o próximas, como conductor
//    o como propietario, falla con `account_has_active_bookings` y no se toca nada. Si no,
//    archiva sus cocheras, borra sus vehículos y notificaciones y anonimiza el perfil.
// 2. Borra las fotos de sus vehículos del bucket privado (la base no puede borrar archivos).
// 3. Da de baja al usuario de Auth con el borrado "suave" de Supabase: se le quitan el correo y
//    el inicio con Google y no puede volver a entrar. No se borra la fila de auth.users porque
//    arrastraría en cascada las reservas y la billetera, que la otra parte necesita.
//
// El id sale del JWT: nadie puede dar de baja la cuenta de otro. Repetir la llamada es seguro.

import { json, preflight } from '../_shared/http.ts';
import { adminClient, userIdFromRequest } from '../_shared/supabase.ts';

const VEHICLE_BUCKET = 'vehicle-images';

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const userId = await userIdFromRequest(req);
  if (!userId) return json({ error: 'No autenticado' }, 401);

  const admin = adminClient();

  const { error: dataError } = await admin.rpc('delete_account_data', { p_user_id: userId });
  if (dataError) {
    const blocked = dataError.message.includes('account_has_active_bookings');
    return json({ error: blocked ? 'account_has_active_bookings' : dataError.message }, blocked ? 409 : 400);
  }

  // Ruta de las fotos: {usuario}/{vehículo}/archivo. Si falla, no frena la baja: los vehículos ya
  // no existen y el bucket es privado.
  try {
    const { data: folders } = await admin.storage.from(VEHICLE_BUCKET).list(userId, { limit: 1000 });
    const paths: string[] = [];
    for (const folder of folders ?? []) {
      const { data: files } = await admin.storage.from(VEHICLE_BUCKET).list(`${userId}/${folder.name}`, { limit: 1000 });
      for (const file of files ?? []) paths.push(`${userId}/${folder.name}/${file.name}`);
    }
    if (paths.length > 0) await admin.storage.from(VEHICLE_BUCKET).remove(paths);
  } catch (error) {
    console.warn('delete-account: no se pudieron borrar las fotos de vehículos', error);
  }

  const { error: authError } = await admin.auth.admin.deleteUser(userId, true);
  if (authError) return json({ error: authError.message }, 500);

  return json({ ok: true });
});
