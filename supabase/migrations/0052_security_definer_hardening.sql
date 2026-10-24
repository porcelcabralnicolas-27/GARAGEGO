-- GarageGo — privilegios de ejecución de las funciones (RPC).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP FUNCTION IF EXISTS / REVOKE / GRANT. Re-correr OK.
--
-- ── Los problemas (auditoría técnica 2026-09-13, hallazgo 2.5) ───────────────────────────
-- 1. Postgres le da EXECUTE a PUBLIC en toda función nueva, y Supabase además se lo otorga
--    explícitamente al rol `anon` por default privileges. Las migraciones hacían
--    `grant ... to authenticated` pero nunca `revoke ... from public, anon`, así que todas las
--    RPC se podían llamar sin sesión, solo con la anon key del bundle. La mayoría falla por el
--    chequeo de auth.uid(), pero no todas lo tienen.
-- 2. `has_booking_in_lot(p_lot_id, p_user_id)` (0022) acepta CUALQUIER user id y responde si
--    esa persona reservó alguna vez esa cochera: se puede reconstruir el historial de lugares de
--    cualquiera (los ids de perfil y de cochera son visibles). Ninguna policy la usa desde la
--    0040, que la reemplazó por `user_has_booking_on_lot(p_lot_id)` (que usa auth.uid()).

drop function if exists public.has_booking_in_lot(uuid, uuid);

-- RPC que usa la app o el panel: solo usuarios logueados.
revoke execute on function public.ensure_profile() from public, anon;
revoke execute on function public.topup_wallet(numeric) from public, anon;
revoke execute on function public.create_booking(uuid, date, time, time, uuid) from public, anon;
revoke execute on function public.start_booking(uuid) from public, anon;
revoke execute on function public.complete_booking(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric) from public, anon;
revoke execute on function public.user_has_booking_on_lot(uuid) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.admin_review_parking_lot(uuid, text, text) from public, anon;
revoke execute on function public.admin_set_parking_lot_moderation(uuid, text, text, timestamptz) from public, anon;
revoke execute on function public.admin_lot_stats() from public, anon;
revoke execute on function public.admin_ticket_context() from public, anon;
revoke execute on function public.admin_active_sessions() from public, anon;
revoke execute on function public.admin_growth(integer, integer) from public, anon;
revoke execute on function public.admin_transaction_summary(integer) from public, anon;
revoke execute on function public.admin_user_directory() from public, anon;
revoke execute on function public.admin_user_detail(uuid) from public, anon;
revoke execute on function public.admin_set_rating_hidden(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_transactions(integer) from public, anon;

grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.topup_wallet(numeric) to authenticated;
grant execute on function public.create_booking(uuid, date, time, time, uuid) to authenticated;
grant execute on function public.start_booking(uuid) to authenticated;
grant execute on function public.complete_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric) to authenticated;
grant execute on function public.user_has_booking_on_lot(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.admin_review_parking_lot(uuid, text, text) to authenticated;
grant execute on function public.admin_set_parking_lot_moderation(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.admin_lot_stats() to authenticated;
grant execute on function public.admin_ticket_context() to authenticated;
grant execute on function public.admin_active_sessions() to authenticated;
grant execute on function public.admin_growth(integer, integer) to authenticated;
grant execute on function public.admin_transaction_summary(integer) to authenticated;
grant execute on function public.admin_user_directory() to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_set_rating_hidden(uuid, boolean, text) to authenticated;
grant execute on function public.admin_transactions(integer) to authenticated;

-- Funciones nuevas de acá en adelante: sin EXECUTE para PUBLIC ni anon por defecto. Cada
-- migración tiene que otorgarle a `authenticated` explícitamente (ya es la costumbre del repo).
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
