-- GarageGo — cada usuario lee solo su propio perfil (los admins, todos).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- ⚠️ ORDEN: correr SOLO DESPUÉS de publicar la versión de la app que lee los nombres ajenos
-- desde la vista `public_profiles` (0050). Las builds anteriores leen `profiles` directo y,
-- con esta migración, dejarían de ver el nombre del otro en reservas, calificaciones y chat.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY. Re-correr OK.
--
-- Auditoría técnica 2026-09-13, hallazgo 2.4. Reemplaza `profiles_select_all using (true)`.
-- Quién sigue leyendo `profiles` completo:
--   * el propio usuario (su perfil, en la app);
--   * los admins (panel: moderación de cocheras muestra teléfono del dueño, etc.);
--   * las funciones security definer (`is_admin`, `admin_*`), que no pasan por RLS.

drop policy if exists profiles_select_all on public.profiles;
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));
