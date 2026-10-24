-- GarageGo — un vehículo no puede estar en dos reservas al mismo tiempo.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente (CREATE OR REPLACE). Re-correr OK.
--
-- Un auto no puede estar estacionado en dos cocheras a la vez, pero hasta ahora nada impedía
-- reservar (e iniciar) dos reservas con el mismo vehículo en el mismo horario. Dos reglas:
--
--   1. create_booking (0048): se rechaza con `vehicle_busy` si el vehículo ya tiene otra reserva
--      pendiente o confirmada cuyo horario se superpone. Reservas consecutivas con el mismo
--      vehículo (una termina a las 11:00 y la otra empieza a las 11:00) sí se permiten; no se
--      aplica el margen de 15 minutos de las cocheras, que es entre autos distintos.
--   2. start_booking (0047): se rechaza con `vehicle_in_use` si el vehículo ya está en otra
--      sesión en curso (iniciada y sin finalizar). Cubre el caso de una reserva que se pasó de
--      hora y todavía no se cerró cuando llega el horario de la siguiente.
--
-- Las dos toman un lock por vehículo (advisory, hasta el fin de la transacción): sin él, dos
-- reservas simultáneas del mismo vehículo en cocheras distintas (que no se serializan entre sí
-- por el lock de cada cochera) podían pasar la validación a la vez. Siempre se toma el lock del
-- vehículo antes que el de la cochera, para que no haya bloqueos cruzados.


-- 1. create_booking ---------------------------------------------------------------------
-- Igual que la 0048, más el chequeo del vehículo antes de validar la cochera.

create or replace function public.create_booking(
  p_parking_lot_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_vehicle_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now_local timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_price_per_hour numeric;
  v_hours numeric;
  v_total_price numeric;
  v_wallet_id uuid;
  v_balance numeric;
  v_booking_id uuid;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'El horario de fin debe ser posterior al de inicio';
  end if;
  if (p_date + p_start_time) < v_now_local then
    raise exception 'booking_in_past';
  end if;
  if p_vehicle_id is null then
    raise exception 'vehicle_required';
  end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and user_id = v_user_id) then
    raise exception 'vehicle_not_found';
  end if;

  select price_per_hour, owner_id into v_price_per_hour, v_owner_id
  from public.parking_lots where id = p_parking_lot_id;

  if v_price_per_hour is null then
    raise exception 'Estacionamiento no encontrado';
  end if;
  if v_owner_id = v_user_id then
    raise exception 'No podés reservar tu propio estacionamiento';
  end if;

  -- El vehículo no puede tener otra reserva en el mismo horario.
  perform pg_advisory_xact_lock(hashtextextended('garagego.vehicle:' || p_vehicle_id::text, 0));
  if exists (
    select 1 from public.bookings b
    where b.vehicle_id = p_vehicle_id
      and b.status in ('pending', 'confirmed')
      and tsrange(b.date + b.start_time, b.date + b.end_time)
        && tsrange(p_date + p_start_time, p_date + p_end_time)
  ) then
    raise exception 'vehicle_busy';
  end if;

  perform public._assert_slot_bookable(p_parking_lot_id, p_date, p_start_time, p_end_time);

  v_hours := extract(epoch from (p_end_time - p_start_time)) / 3600.0;
  v_total_price := round((v_price_per_hour * v_hours)::numeric, 2);

  select id, balance into v_wallet_id, v_balance from public.wallets where user_id = v_user_id for update;
  if v_wallet_id is null then
    raise exception 'No se encontró tu billetera';
  end if;
  if v_balance < v_total_price then
    raise exception 'insufficient_balance';
  end if;

  begin
    insert into public.bookings (user_id, parking_lot_id, date, start_time, end_time, status, total_price, vehicle_id)
    values (v_user_id, p_parking_lot_id, p_date, p_start_time, p_end_time, 'confirmed', v_total_price, p_vehicle_id)
    returning id into v_booking_id;
  exception
    when exclusion_violation then
      raise exception 'overlap_conflict';
  end;

  update public.wallets set balance = balance - v_total_price, updated_at = now() where id = v_wallet_id;

  insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
  values (v_wallet_id, 'booking_payment', -v_total_price, v_booking_id, 'completed');

  insert into public.notifications (user_id, title, description, type, related_booking_id)
  values (
    v_owner_id,
    'Nueva reserva',
    format('Recibiste una reserva confirmada por $%s. El importe se acredita cuando finalice.', v_total_price),
    'booking_created',
    v_booking_id
  );

  return v_booking_id;
end;
$$;

grant execute on function public.create_booking(uuid, date, time, time, uuid) to authenticated;


-- 2. start_booking ----------------------------------------------------------------------
-- Igual que la 0047, más el chequeo de que el vehículo no esté ya en una sesión en curso.

create or replace function public.start_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_early_window interval := interval '15 minutes';
  v_now_local timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_client_id uuid;
  v_owner_id uuid;
  v_vehicle_id uuid;
  v_status text;
  v_actual_start_at timestamptz;
  v_starts_at timestamp;
  v_ends_at timestamp;
  v_rows integer;
begin
  select b.user_id, p.owner_id, b.vehicle_id, b.status, b.actual_start_at, b.date + b.start_time, b.date + b.end_time
  into v_client_id, v_owner_id, v_vehicle_id, v_status, v_actual_start_at, v_starts_at, v_ends_at
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id
  for update of b;

  if v_client_id is null then
    raise exception 'Reserva no encontrada';
  end if;
  if auth.uid() is null or auth.uid() <> v_client_id then
    raise exception 'No autorizado';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'Solo podés iniciar una reserva confirmada';
  end if;
  if v_actual_start_at is not null then
    raise exception 'already_started';
  end if;
  if v_now_local < v_starts_at - v_early_window then
    raise exception 'start_too_early';
  end if;
  if v_now_local > v_ends_at then
    raise exception 'start_window_over';
  end if;

  -- Las reservas viejas sin vehículo no tienen nada que validar.
  if v_vehicle_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('garagego.vehicle:' || v_vehicle_id::text, 0));
    if exists (
      select 1 from public.bookings o
      where o.vehicle_id = v_vehicle_id
        and o.id <> p_booking_id
        and o.status = 'confirmed'
        and o.actual_start_at is not null
    ) then
      raise exception 'vehicle_in_use';
    end if;
  end if;

  update public.bookings set actual_start_at = now()
  where id = p_booking_id and status = 'confirmed' and actual_start_at is null;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'already_started';
  end if;

  insert into public.notifications (user_id, title, description, type, related_booking_id)
  values (
    v_owner_id,
    'El cliente llegó',
    'El cliente inició su reserva y ya está usando el estacionamiento.',
    'booking_started',
    p_booking_id
  );
end;
$$;

grant execute on function public.start_booking(uuid) to authenticated;
