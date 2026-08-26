-- GarageGo — permitir que cada usuario borre sus propias notificaciones.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE. Seguro de re-correr.
--
-- La tabla notifications tenía policies de SELECT y UPDATE pero ninguna de DELETE, así que un
-- delete desde el cliente no fallaba: simplemente afectaba 0 filas, en silencio.

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (user_id = auth.uid());
