-- GarageGo — datos para la sección Usuarios del panel de administración.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP + CREATE de las funciones (por si cambia el tipo de retorno). Re-correr OK.
--
-- El admin lee `profiles` y `ratings` por policy `using (true)`, pero el email vive en
-- `auth.users` (ilegible con la anon key) y el resto de las columnas (vehículos, reservas,
-- plata) sale de tablas sin acceso de admin. Todo por RPCs `security definer`.

drop function if exists public.admin_user_directory();
drop function if exists public.admin_user_detail(uuid);

-- ── 1. Directorio: una fila por usuario, con todo lo que muestran las dos tablas ──────
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
  select
    p.id,
    p.first_name,
    p.last_name,
    p.phone,
    p.avatar_url,
    p.active_role,
    p.is_owner_enabled,
    p.created_at,
    (select u.email::text from auth.users u where u.id = p.id),
    (select count(*)::integer from public.vehicles v where v.user_id = p.id),
    (select count(*)::integer from public.bookings b where b.user_id = p.id),
    (select count(*)::integer from public.parking_lots pl where pl.owner_id = p.id),
    (select count(*)::integer from public.parking_lots pl
       where pl.owner_id = p.id
         and pl.is_active and pl.approval_status = 'approved' and pl.moderation_state = 'live'),
    (select count(*)::integer from public.parking_lots pl
       where pl.owner_id = p.id and pl.approval_status = 'pending'),
    (select count(*)::integer from public.bookings b
       join public.parking_lots pl on pl.id = b.parking_lot_id
       where pl.owner_id = p.id),
    (select round(avg(pl.rating_avg)::numeric, 2) from public.parking_lots pl
       where pl.owner_id = p.id and pl.rating_avg > 0),
    coalesce((
      select sum(t.amount)
      from public.wallet_transactions t
      join public.wallets w on w.id = t.wallet_id
      where w.user_id = p.id and t.type = 'earning' and t.status = 'completed'
    ), 0)
  from public.profiles p
  order by p.created_at desc;
end;
$$;

grant execute on function public.admin_user_directory() to authenticated;

-- ── 2. Ficha: todo lo del drawer de un usuario, en un solo JSON ──────────────────────
create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'email', (select u.email::text from auth.users u where u.id = p_user_id),
    'balance', coalesce((select w.balance from public.wallets w where w.user_id = p_user_id), 0),
    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plate', v.plate, 'brand', v.brand, 'model', v.model, 'color', v.color
      ) order by v.created_at)
      from public.vehicles v where v.user_id = p_user_id
    ), '[]'::jsonb),
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', pl.name, 'approvalStatus', pl.approval_status, 'moderationState', pl.moderation_state
      ) order by pl.created_at desc)
      from public.parking_lots pl where pl.owner_id = p_user_id
    ), '[]'::jsonb),
    'recentBookings', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb)
      from (
        select pl.name as lot_name, b.date, b.total_price
        from public.bookings b
        join public.parking_lots pl on pl.id = b.parking_lot_id
        where b.user_id = p_user_id
        order by b.created_at desc
        limit 5
      ) x
    ), '[]'::jsonb),
    'recentTransactions', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb)
      from (
        select t.type, t.amount, t.status, t.created_at
        from public.wallet_transactions t
        join public.wallets w on w.id = t.wallet_id
        where w.user_id = p_user_id
        order by t.created_at desc
        limit 5
      ) x
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

grant execute on function public.admin_user_detail(uuid) to authenticated;
