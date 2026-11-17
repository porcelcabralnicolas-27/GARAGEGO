-- GarageGo — la separación por país la hace cumplir el servidor, no solo la app.
-- Requiere 0083 (search_parking_lots), 0087 (región de cocheras, reservas y current_user_region)
-- y 0090 (región de los vehículos).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP IF EXISTS y CREATE OR REPLACE (misma firma). Re-correr es seguro.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────
-- Hasta acá la app filtraba por la región activa, pero una llamada directa a la API podía ver o
-- usar cocheras del otro país. Ahora:
--   1. La región de una cochera no se puede cambiar desde la app (`region_immutable`). Se fija al
--      publicarla con la región del perfil del propietario (trigger de la 0087).
--   2. La búsqueda (`search_parking_lots`) devuelve solo cocheras del país del usuario.
--   3. La RLS de `parking_lots` muestra las cocheras publicadas solo del país del usuario. Siguen
--      visibles, como antes, las propias, las que el usuario reservó alguna vez (historial) y todas
--      para el equipo.
--   4. Una reserva nueva tiene que ser de una cochera del país del usuario, con un vehículo del
--      mismo país (`region_mismatch`, `vehicle_region_mismatch`). Lo controla un trigger en
--      `bookings`, así vale igual para `create_booking` (billetera) y
--      `create_booking_pending_payment` (Mercado Pago). La reserva conserva la región de la
--      cochera (trigger de la 0087).
-- Las reservas que ya existen no se tocan.


-- 1. La región de una cochera no se cambia desde la app -----------------------------------------
create or replace function public.protect_parking_lot_region()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and new.region is distinct from old.region then
    raise exception 'region_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists parking_lots_protect_region on public.parking_lots;
create trigger parking_lots_protect_region
  before update on public.parking_lots
  for each row execute function public.protect_parking_lot_region();


-- 2. Búsqueda: solo el país del usuario ---------------------------------------------------------
-- Igual a la de la 0083, más `p.region = current_user_region()`.
create or replace function public.search_parking_lots(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 5,
  p_max_price numeric default null,
  p_min_rating numeric default null,
  p_limit integer default 200,
  p_cursor_distance double precision default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  address text,
  latitude double precision,
  longitude double precision,
  price_per_hour numeric,
  rating_avg numeric,
  is_active boolean,
  created_at timestamptz,
  lot_type text,
  distance_km double precision
)
language sql
stable
-- Sin `set search_path`, igual que la 0055: PostGIS vive en el esquema `extensions` de Supabase.
as $$
  select *
  from (
    select
      p.id, p.owner_id, p.name, p.description, p.address, p.latitude, p.longitude,
      p.price_per_hour, p.rating_avg, p.is_active, p.created_at, p.lot_type,
      st_distance(p.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0 as distance_km
    from public.parking_lots p
    where p.is_active = true
      and p.approval_status = 'approved'
      and p.moderation_state = 'live'
      and p.archived_at is null
      and p.region = public.current_user_region()
      and p.owner_id is distinct from auth.uid()
      and st_dwithin(
        p.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        least(coalesce(p_radius_km, 5), 1000) * 1000
      )
      and (p_max_price is null or p.price_per_hour <= p_max_price)
      and (p_min_rating is null or p.rating_avg >= p_min_rating)
  ) found
  where p_cursor_id is null or (found.distance_km, found.id) > (p_cursor_distance, p_cursor_id)
  order by found.distance_km asc, found.id asc
  limit least(greatest(coalesce(p_limit, 200), 1), 200);
$$;

revoke all on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric, integer, double precision, uuid)
  from public, anon;
grant execute on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric, integer, double precision, uuid)
  to authenticated;


-- 3. RLS de parking_lots: las publicadas, solo del país del usuario -------------------------------
-- Igual a la de la 0053, con la región en la primera condición. `(select …)` hace que la región se
-- calcule una vez por consulta y no por fila.
drop policy if exists parking_lots_select_public on public.parking_lots;
create policy parking_lots_select_public on public.parking_lots for select to authenticated
  using (
    (is_active and approval_status = 'approved' and moderation_state = 'live'
      and region = (select public.current_user_region()))
    or owner_id = auth.uid()
    or public.is_admin(auth.uid())
    or public.user_has_booking_on_lot(id)
  );


-- 4. Reservas: cochera y vehículo del país del usuario ---------------------------------------------
-- Corre después de `bookings_set_region` (0087), que copia la región de la cochera. Solo controla
-- las reservas que hace el propio usuario (las funciones de reserva usan su sesión); los procesos
-- internos sin sesión no pasan por acá.
create or replace function public.enforce_booking_region()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_region text;
  v_vehicle_region text;
begin
  if auth.uid() is null or auth.uid() is distinct from new.user_id then
    return new;
  end if;

  select region into v_lot_region from public.parking_lots where id = new.parking_lot_id;
  if v_lot_region is distinct from public.current_user_region() then
    raise exception 'region_mismatch' using errcode = 'P0001';
  end if;

  if new.vehicle_id is not null then
    select region into v_vehicle_region from public.vehicles where id = new.vehicle_id;
    if v_vehicle_region is distinct from v_lot_region then
      raise exception 'vehicle_region_mismatch' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_booking_region() from public, anon, authenticated;

drop trigger if exists bookings_zz_region_check on public.bookings;
create trigger bookings_zz_region_check
  before insert on public.bookings
  for each row execute function public.enforce_booking_region();
