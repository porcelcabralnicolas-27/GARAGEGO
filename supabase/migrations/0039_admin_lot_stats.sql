-- GarageGo — estadísticas de reservas por cochera para el panel de administración.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: solo CREATE OR REPLACE FUNCTION. Re-correr es seguro.
--
-- La pestaña "Cocheras publicadas" del panel muestra, por cochera: reservas de los últimos 30
-- días, si tiene una sesión en curso, y cuántas reservas confirmadas tiene en los próximos 7
-- días (para avisar antes de pausarla). El admin NO tiene RLS sobre `bookings` (ver
-- admin-panel/README.md, "Además: RLS"), así que esos números se calculan acá, en una RPC
-- `security definer` que valida admin adentro y devuelve solo los agregados — nunca filas de
-- reservas.
--
-- Definiciones (mismas que `admin-panel/src/state/selectors.ts` y `src/features/stats`):
--   - sesión en curso : status 'confirmed', ya entró (`actual_start_at`) y no salió
--                       (`actual_end_at`).
--   - próximas        : 'confirmed', todavía no entró, y su inicio cae en los próximos 7 días.
--   - fechas/horas de la reserva son naive en hora de Buenos Aires (convención del proyecto,
--     ver 0024): se comparan contra `now()` convertido a esa zona.

create or replace function public.admin_lot_stats()
returns table (
  lot_id uuid,
  bookings_30d integer,
  upcoming_bookings integer,
  has_active_session boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now_local timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  select
    b.parking_lot_id as lot_id,
    count(*) filter (where b.created_at > now() - interval '30 days')::integer as bookings_30d,
    count(*) filter (
      where b.status = 'confirmed'
        and b.actual_start_at is null
        and (b.date + b.start_time) >= v_now_local
        and (b.date + b.start_time) < v_now_local + interval '7 days'
    )::integer as upcoming_bookings,
    coalesce(
      bool_or(b.status = 'confirmed' and b.actual_start_at is not null and b.actual_end_at is null),
      false
    ) as has_active_session
  from public.bookings b
  group by b.parking_lot_id;
end;
$$;

grant execute on function public.admin_lot_stats() to authenticated;
