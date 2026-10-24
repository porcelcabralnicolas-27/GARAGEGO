-- GarageGo — detalle de una reserva recibida, para el propietario.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente (CREATE OR REPLACE). Re-correr OK.
--
-- El propietario solo tenía el listado (list_owner_bookings, 0059). La pantalla de detalle se
-- abre por id, así que necesita su propia consulta: la misma fila del listado para una sola
-- reserva, más la dirección de la cochera.
--
-- SECURITY INVOKER, igual que las funciones de la 0059: aplica la RLS de quien llama, y el join
-- con `owner_id = auth.uid()` garantiza que solo devuelve reservas de cocheras propias.

create or replace function public.get_owner_booking(p_booking_id uuid)
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
  client_name text,
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
    nullif(btrim(c.first_name || ' ' || c.last_name), ''),
    v.plate, v.brand, v.model
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id and p.owner_id = auth.uid()
  left join public.public_profiles c on c.id = b.user_id
  left join public.vehicles v on v.id = b.vehicle_id
  where b.id = p_booking_id;
$$;

revoke all on function public.get_owner_booking(uuid) from public, anon;
grant execute on function public.get_owner_booking(uuid) to authenticated;
