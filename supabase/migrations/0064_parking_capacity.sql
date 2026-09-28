-- GarageGo — capacidad de la cochera: varios autos en el mismo horario.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS y CREATE OR REPLACE. Re-correr OK.
--
-- Hasta acá cada cochera tenía capacidad 1 (decisión de la 0001): una reserva ocupaba la
-- cochera entera en su horario, más 15 minutos de margen antes y después. Ahora el propietario
-- indica cuántos autos entran, y se aceptan reservas superpuestas mientras la ocupación
-- simultánea no llegue a ese número.
--
--   * `parking_lots.capacity` (1 a 50, default 1). Las cocheras existentes quedan en 1, así que
--     su comportamiento no cambia.
--   * Se elimina `bookings_no_overlap` (0001): un exclusion constraint solo puede decir "ninguna
--     otra fila se superpone", no "menos de N". La garantía contra carreras la sigue dando el
--     advisory lock por cochera de `_assert_slot_bookable` (0048), que serializa todas las
--     reservas de una misma cochera; `create_booking` es la única vía de inserción (0046).
--   * `_assert_slot_bookable`: el paso 5 pasa de "existe alguna reserva que choque" a "la
--     ocupación máxima dentro del nuevo horario llega a la capacidad". Se mide el máximo y no
--     el total: con capacidad 2, reservas de 10 a 11 y de 12 a 13 no impiden una de 10 a 13,
--     porque nunca hay dos autos a la vez. El error sigue siendo 'buffer_conflict'.
--
-- La app replica la misma cuenta en src/features/booking/availability.ts para no ofrecer
-- horarios que el servidor rechazaría.

alter table public.parking_lots add column if not exists capacity smallint not null default 1;

alter table public.parking_lots drop constraint if exists parking_lots_capacity_range;
alter table public.parking_lots add constraint parking_lots_capacity_range check (capacity between 1 and 50);

alter table public.bookings drop constraint if exists bookings_no_overlap;


create or replace function public._assert_slot_bookable(
  p_parking_lot_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buffer interval := interval '15 minutes';
  v_step_minutes integer := 30;
  v_duration_minutes integer;
  v_lot record;
  v_new_start timestamp := p_date + p_start_time;
  v_new_end timestamp := p_date + p_end_time;
  v_peak integer;
begin
  -- 1. Serializa las reservas de esta cochera hasta el fin de la transacción.
  perform pg_advisory_xact_lock(hashtextextended('garagego.booking:' || p_parking_lot_id::text, 0));

  -- 2. Estado de la publicación.
  select is_active, approval_status, moderation_state, archived_at, capacity
  into v_lot
  from public.parking_lots
  where id = p_parking_lot_id;

  if not found then
    raise exception 'Estacionamiento no encontrado';
  end if;
  if not v_lot.is_active
     or v_lot.approval_status <> 'approved'
     or v_lot.moderation_state <> 'live'
     or v_lot.archived_at is not null then
    raise exception 'lot_not_bookable';
  end if;

  -- 4. Duración (antes que la disponibilidad: es el error más barato de detectar).
  if p_end_time <= p_start_time then
    raise exception 'El horario de fin debe ser posterior al de inicio';
  end if;
  v_duration_minutes := extract(epoch from (p_end_time - p_start_time))::integer / 60;
  if extract(epoch from (p_end_time - p_start_time))::integer % 60 <> 0
     or v_duration_minutes < v_step_minutes
     or v_duration_minutes % v_step_minutes <> 0 then
    raise exception 'invalid_duration';
  end if;

  -- 3. Disponibilidad configurada.
  if exists (
    select 1 from public.parking_availability_exceptions e
    where e.parking_lot_id = p_parking_lot_id and e.date = p_date
  ) then
    -- Hay excepción para ese día: manda la excepción.
    if exists (
      select 1 from public.parking_availability_exceptions e
      where e.parking_lot_id = p_parking_lot_id and e.date = p_date and not e.is_available
    ) or not exists (
      select 1 from public.parking_availability_exceptions e
      where e.parking_lot_id = p_parking_lot_id
        and e.date = p_date
        and e.is_available
        and e.start_time is not null
        and e.end_time is not null
        and e.start_time <= p_start_time
        and e.end_time >= p_end_time
    ) then
      raise exception 'outside_availability';
    end if;
  elsif not exists (
    select 1 from public.parking_availability_recurring r
    where r.parking_lot_id = p_parking_lot_id
      and r.day_of_week = extract(dow from p_date)::smallint
      and r.start_time <= p_start_time
      and r.end_time >= p_end_time
  ) then
    raise exception 'outside_availability';
  end if;

  -- 5. Capacidad, contando el margen de 15 minutos de cada reserva.
  -- Los rangos son semiabiertos [inicio, fin): una reserva que termina (con margen) justo cuando
  -- empieza la nueva no la ocupa. La ocupación solo sube en el inicio de la nueva o en el inicio
  -- de alguna existente, así que alcanza con medirla en esos puntos.
  with overlapping as (
    select tsrange(b.date + b.start_time - v_buffer, b.date + b.end_time + v_buffer) as r
    from public.bookings b
    where b.parking_lot_id = p_parking_lot_id
      and b.status in ('pending', 'confirmed')
      and tsrange(b.date + b.start_time - v_buffer, b.date + b.end_time + v_buffer)
        && tsrange(v_new_start, v_new_end)
  ),
  points as (
    select v_new_start as t
    union
    select lower(o.r) from overlapping o where lower(o.r) > v_new_start
  )
  select coalesce(max((select count(*) from overlapping o where o.r @> pt.t)), 0)
  into v_peak
  from points pt;

  if v_peak >= v_lot.capacity then
    raise exception 'buffer_conflict';
  end if;
end;
$$;

revoke all on function public._assert_slot_bookable(uuid, date, time, time) from public, anon, authenticated;
