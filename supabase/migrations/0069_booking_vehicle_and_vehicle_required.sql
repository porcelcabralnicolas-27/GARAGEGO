-- GarageGo — el detalle de reserva muestra el vehículo, y marca y modelo son obligatorios.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP FUNCTION IF EXISTS + CREATE y DROP CONSTRAINT IF EXISTS. Re-correr OK.
--
-- 1. get_client_booking (0059) devuelve además la patente, la marca y el modelo del vehículo con el
--    que se hizo la reserva, para mostrarlo en el detalle. Cambia la lista de columnas que
--    devuelve, así que hay que borrar la función y crearla de nuevo. Sigue siendo SECURITY
--    INVOKER: el vehículo es del propio conductor, así que la RLS de `vehicles` lo deja leer.
--
-- 2. `vehicles.brand` y `vehicles.model` pasan a ser obligatorios (el color sigue siendo
--    opcional). La restricción es NOT VALID a propósito: no revisa los vehículos que ya estaban
--    cargados sin marca o modelo (no se quiere que la migración falle ni romperlos), pero sí se
--    aplica a todo vehículo nuevo y a cada edición. Quien tenga un vehículo viejo incompleto
--    tiene que completarlo la próxima vez que lo edite.

drop function if exists public.get_client_booking(uuid);

create function public.get_client_booking(p_booking_id uuid)
returns table (
  id uuid,
  user_id uuid,
  parking_lot_id uuid,
  vehicle_id uuid,
  date date,
  start_time time,
  end_time time,
  status text,
  total_price numeric,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  overtime_minutes integer,
  overtime_charge numeric,
  created_at timestamptz,
  parking_lot_name text,
  parking_lot_address text,
  is_rated boolean,
  vehicle_plate text,
  vehicle_brand text,
  vehicle_model text
)
language sql
stable
set search_path = public
as $$
  select
    b.id, b.user_id, b.parking_lot_id, b.vehicle_id, b.date, b.start_time, b.end_time, b.status,
    b.total_price, b.actual_start_at, b.actual_end_at, b.overtime_minutes, b.overtime_charge, b.created_at,
    p.name, p.address,
    exists (select 1 from public.ratings r where r.booking_id = b.id and r.user_id = auth.uid()),
    v.plate, v.brand, v.model
  from public.bookings b
  left join public.parking_lots p on p.id = b.parking_lot_id
  left join public.vehicles v on v.id = b.vehicle_id
  where b.id = p_booking_id and b.user_id = auth.uid();
$$;

revoke all on function public.get_client_booking(uuid) from public, anon;
grant execute on function public.get_client_booking(uuid) to authenticated;


alter table public.vehicles drop constraint if exists vehicles_brand_model_required;
alter table public.vehicles add constraint vehicles_brand_model_required check (
  nullif(btrim(brand), '') is not null and nullif(btrim(model), '') is not null
) not valid;
