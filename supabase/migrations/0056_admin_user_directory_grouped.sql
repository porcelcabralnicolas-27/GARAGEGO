-- GarageGo — admin_user_directory con agregados agrupados en vez de subconsultas por usuario.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE (misma firma y mismo tipo de retorno que la 0043). Re-correr OK.
--
-- ── El problema (auditoría técnica 2026-09-13, hallazgo 3.3) ─────────────────────────────
-- La versión de la 0043 corre 10 subconsultas correlacionadas POR CADA fila de `profiles`
-- (contando vehículos, reservas hechas, 3 conteos de `parking_lots`, reservas recibidas,
-- promedio de rating y suma de ganancias). Con N usuarios son ~10×N subconsultas — `parking_lots`
-- sola se recorre 5 veces por usuario. Funciona con pocas cuentas, pero degrada linealmente.
--
-- ── Arreglo ────────────────────────────────────────────────────────────────────────────
-- Cada fuente se agrupa UNA sola vez (`group by`) en un CTE, y el resultado final es un único
-- LEFT JOIN de esos CTEs contra `profiles` — cada tabla se recorre una vez en total, no una vez
-- por usuario. Misma salida exacta que antes (mismas columnas, mismo orden).

create or replace function public.admin_user_directory()
returns table (
  id uuid,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  active_role text,
  is_owner_enabled boolean,
  created_at timestamptz,
  email text,
  -- conductor
  vehicles_count integer,
  bookings_made integer,
  -- propietario
  lots_total integer,
  lots_live integer,
  lots_pending integer,
  bookings_received integer,
  rating_avg numeric,
  earnings numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  with vehicle_counts as (
    select v.user_id, count(*)::integer as n
    from public.vehicles v
    group by v.user_id
  ),
  bookings_made as (
    select b.user_id, count(*)::integer as n
    from public.bookings b
    group by b.user_id
  ),
  lot_stats as (
    select
      pl.owner_id,
      count(*)::integer as total,
      count(*) filter (
        where pl.is_active and pl.approval_status = 'approved' and pl.moderation_state = 'live'
      )::integer as live,
      count(*) filter (where pl.approval_status = 'pending')::integer as pending,
      round(avg(pl.rating_avg) filter (where pl.rating_avg > 0)::numeric, 2) as rating_avg
    from public.parking_lots pl
    group by pl.owner_id
  ),
  bookings_received as (
    select pl.owner_id, count(*)::integer as n
    from public.bookings b
    join public.parking_lots pl on pl.id = b.parking_lot_id
    group by pl.owner_id
  ),
  earnings as (
    select w.user_id, sum(t.amount) as total
    from public.wallet_transactions t
    join public.wallets w on w.id = t.wallet_id
    where t.type = 'earning' and t.status = 'completed'
    group by w.user_id
  )
  select
    p.id,
    p.first_name,
    p.last_name,
    p.phone,
    p.avatar_url,
    p.active_role,
    p.is_owner_enabled,
    p.created_at,
    u.email::text,
    coalesce(vc.n, 0),
    coalesce(bm.n, 0),
    coalesce(ls.total, 0),
    coalesce(ls.live, 0),
    coalesce(ls.pending, 0),
    coalesce(br.n, 0),
    ls.rating_avg,
    coalesce(e.total, 0)
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join vehicle_counts vc on vc.user_id = p.id
  left join bookings_made bm on bm.user_id = p.id
  left join lot_stats ls on ls.owner_id = p.id
  left join bookings_received br on br.owner_id = p.id
  left join earnings e on e.user_id = p.id
  order by p.created_at desc;
end;
$$;

grant execute on function public.admin_user_directory() to authenticated;
