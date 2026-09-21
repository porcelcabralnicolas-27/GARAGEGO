-- GarageGo — vista con los datos públicos de los perfiles (nombre y avatar).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE VIEW. Re-correr OK.
--
-- Primer paso de la privacidad de perfiles (auditoría técnica 2026-09-13, hallazgo 2.4). La
-- policy `profiles_select_all` (0001) deja a cualquier usuario logueado leer TODAS las columnas
-- de TODOS los perfiles: teléfono, rol activo, si es propietario y, desde la 0033, `is_admin`
-- (se puede listar a los administradores con `?is_admin=eq.true`).
--
-- Lo único que la app necesita de otra persona es el nombre (reservas recibidas, calificaciones
-- y chat). Esta vista expone solo eso. La app pasa a leer de acá, y recién DESPUÉS de publicar
-- esa versión de la app se corre la 0051, que cierra `profiles` al propio usuario y a los
-- admins. Si se corriera la 0051 antes, las builds viejas dejarían de ver los nombres.
--
-- La vista NO es `security_invoker`: corre con los permisos de su dueño (postgres), así lee
-- todas las filas aunque la policy de `profiles` ya no lo permita. Por eso solo expone
-- columnas que son públicas por diseño.

create or replace view public.public_profiles as
  select id, first_name, last_name, avatar_url
  from public.profiles;

revoke all on public.public_profiles from public, anon;
grant select on public.public_profiles to authenticated;
