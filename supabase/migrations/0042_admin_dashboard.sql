-- GarageGo — datos para el Dashboard del panel de administración.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: solo CREATE OR REPLACE FUNCTION. Re-correr es seguro.
--
-- El Dashboard necesita cruzar `bookings`, `vehicles` y `wallet_transactions`, tablas sobre
-- las que el admin NO tiene RLS (ver admin-panel/README.md, "Además: RLS"). Se resuelve con
-- RPCs `security definer` que validan admin adentro y devuelven agregados o listas acotadas,
-- nunca acceso libre a las tablas.
--
-- Fechas/horas de reserva: naive en hora de Buenos Aires (convención del proyecto, ver 0024).
--
-- Se dropean primero: `create or replace` no puede cambiar el tipo de retorno de una función
-- que ya existe (p. ej. si se re-corre esta migración tras haberle cambiado las columnas).
drop function if exists public.admin_active_sessions();
drop function if exists public.admin_growth(integer, integer);
drop function if exists public.admin_transaction_summary(integer);

-- ── 1. Sesiones en curso ──────────────────────────────────────────────────────────────
-- Una reserva 'confirmed' que ya entró (`actual_start_at`) y no salió (`actual_end_at`).
create or replace function public.admin_active_sessions()
returns table (
  booking_id uuid,
  lot_id uuid,
  lot_name text,
  lot_address text,
  owner_name text,
  driver_name text,
  plate text,
  actual_start_at timestamptz,
  scheduled_end timestamptz,
  end_time time,
  total_price numeric
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
  select
    b.id,
    p.id,
    p.name,
    p.address,
    coalesce(nullif(btrim(coalesce(po.first_name, '') || ' ' || coalesce(po.last_name, '')), ''), 'Propietario'),
    coalesce(nullif(btrim(coalesce(pd.first_name, '') || ' ' || coalesce(pd.last_name, '')), ''), 'Conductor'),
    v.plate,
    b.actual_start_at,
    (b.date + b.end_time) at time zone 'America/Argentina/Buenos_Aires',
    b.end_time,
    b.total_price
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  left join public.profiles po on po.id = p.owner_id
  left join public.profiles pd on pd.id = b.user_id
  left join public.vehicles v on v.id = b.vehicle_id
  where b.status = 'confirmed'
    and b.actual_start_at is not null
    and b.actual_end_at is null
  order by b.actual_start_at asc;
end;
$$;

grant execute on function public.admin_active_sessions() to authenticated;

-- ── 2. Crecimiento de usuarios ───────────────────────────────────────────────────────
-- En la app todo el que se registra es conductor; ser propietario es prender un flag (sin
-- fecha). Por eso el gráfico es un funnel, no dos tipos disjuntos:
--   users : altas de perfil (profiles.created_at)
--   hosts : cuándo publicaron su PRIMERA cochera (min(parking_lots.created_at) por owner) —
--           subconjunto de `users`, es la señal de activación como propietario.
-- Devuelve, por bucket, altas nuevas y acumulado (arrastrando lo previo al inicio de la ventana).
create or replace function public.admin_growth(p_days integer, p_buckets integer)
returns table (
  bucket_end timestamptz,
  new_users integer,
  new_hosts integer,
  cum_users integer,
  cum_hosts integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz := now() - make_interval(days => p_days);
  v_size  interval := make_interval(days => p_days) / p_buckets;
  v_base_drivers integer;
  v_base_owners integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select count(*) into v_base_drivers from public.profiles where created_at < v_start;
  select count(*) into v_base_owners from (
    select min(created_at) as c from public.parking_lots group by owner_id
  ) o where o.c < v_start;

  return query
  with owner_dates as (
    select min(created_at) as c from public.parking_lots group by owner_id
  ),
  b as (select generate_series(0, p_buckets - 1) as i)
  select
    (v_start + (b.i + 1) * v_size) as bucket_end,
    (select count(*) from public.profiles pr
       where pr.created_at >= v_start + b.i * v_size
         and pr.created_at <  v_start + (b.i + 1) * v_size)::integer,
    (select count(*) from owner_dates od
       where od.c >= v_start + b.i * v_size
         and od.c <  v_start + (b.i + 1) * v_size)::integer,
    (v_base_drivers + (select count(*) from public.profiles pr
       where pr.created_at >= v_start and pr.created_at < v_start + (b.i + 1) * v_size))::integer,
    (v_base_owners + (select count(*) from owner_dates od
       where od.c >= v_start and od.c < v_start + (b.i + 1) * v_size))::integer
  from b
  order by b.i;
end;
$$;

grant execute on function public.admin_growth(integer, integer) to authenticated;

-- ── 3. Resumen de movimientos de dinero ──────────────────────────────────────────────
-- Solo movimientos 'completed' de los últimos p_days. Mismos grupos que la pestaña
-- Transacciones del panel.
create or replace function public.admin_transaction_summary(p_days integer default 30)
returns table (
  volume numeric,
  topups numeric,
  payments numeric,
  refunds numeric,
  overtime numeric,
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
  select
    coalesce(sum(abs(t.amount)), 0),
    coalesce(sum(abs(t.amount)) filter (where t.type = 'topup'), 0),
    coalesce(sum(abs(t.amount)) filter (where t.type = 'booking_payment'), 0),
    coalesce(sum(abs(t.amount)) filter (where t.type = 'refund'), 0),
    coalesce(sum(abs(t.amount)) filter (where t.type = 'overtime_charge'), 0),
    coalesce(sum(abs(t.amount)) filter (where t.type = 'earning'), 0)
  from public.wallet_transactions t
  where t.status = 'completed'
    and t.created_at > now() - make_interval(days => p_days);
end;
$$;

grant execute on function public.admin_transaction_summary(integer) to authenticated;
