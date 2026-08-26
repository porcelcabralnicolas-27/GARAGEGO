-- GarageGo — expone los horarios ya ocupados de un estacionamiento (sin exponer quién los reservó)
-- para que cualquier cliente pueda calcular la disponibilidad real al momento de reservar.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run

create or replace function public.get_booked_intervals(p_parking_lot_id uuid, p_from_date date default current_date)
returns table (date date, start_time time, end_time time)
language sql
stable
security definer
set search_path = public
as $$
  select b.date, b.start_time, b.end_time
  from public.bookings b
  where b.parking_lot_id = p_parking_lot_id
    and b.status in ('pending', 'confirmed')
    and b.date >= p_from_date;
$$;

grant execute on function public.get_booked_intervals(uuid, date) to authenticated;
