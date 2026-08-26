-- GarageGo — reglas de tiempo en las reservas.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: solo CREATE OR REPLACE de funciones existentes. Ninguna cambia de firma,
-- así que no hace falta DROP FUNCTION previo. Seguro de re-correr.
--
-- Qué cambia:
--   1. create_booking: no se puede reservar un horario que ya pasó (antes solo miraba el DÍA,
--      así que a las 18:00 se podía reservar hoy a las 09:00). La comparación se hace en hora
--      argentina: el servidor corre en UTC y las reservas se guardan en hora local, así que
--      comparar contra current_date/now() a secas rechazaba reservas válidas de madrugada.
--   2. cancel_booking: el cliente ya no puede cancelar una reserva CONFIRMADA cuando falta
--      menos de 1 hora para el inicio. Las pendientes de aprobación se cancelan siempre, y el
--      propietario conserva la posibilidad de cancelar en cualquier momento.
--   3. complete_booking: corrige el cálculo de tiempo excedido, que comparaba now() en UTC
--      contra un horario en hora local y por lo tanto cobraba ~3 horas de más siempre.
--   4. Todas las notificaciones de reserva ahora guardan related_booking_id, para que al
--      tocarlas la app pueda llevar a la reserva correspondiente.

-- 1. create_booking --------------------------------------------------------------------

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
  v_buffer interval := interval '15 minutes';
  v_now_local timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_price_per_hour numeric;
  v_is_active boolean;
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
  -- Timestamp completo, no solo la fecha: el inicio tiene que ser posterior a este momento.
  if (p_date + p_start_time) < v_now_local then
    raise exception 'booking_in_past';
  end if;
  if p_vehicle_id is null then
    raise exception 'vehicle_required';
  end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and user_id = v_user_id) then
    raise exception 'vehicle_not_found';
  end if;

  select price_per_hour, is_active, owner_id into v_price_per_hour, v_is_active, v_owner_id
  from public.parking_lots where id = p_parking_lot_id;

  if v_price_per_hour is null then
    raise exception 'Estacionamiento no encontrado';
  end if;
  if not v_is_active then
    raise exception 'Este estacionamiento no está disponible';
  end if;
  if v_owner_id = v_user_id then
    raise exception 'No podés reservar tu propio estacionamiento';
  end if;

  if exists (
    select 1 from public.bookings b
    where b.parking_lot_id = p_parking_lot_id
      and b.status in ('pending', 'confirmed')
      and tsrange(b.date + b.start_time - v_buffer, b.date + b.end_time + v_buffer)
        && tsrange(p_date + p_start_time, p_date + p_end_time)
  ) then
    raise exception 'buffer_conflict';
  end if;

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
    values (v_user_id, p_parking_lot_id, p_date, p_start_time, p_end_time, 'pending', v_total_price, p_vehicle_id)
    returning id into v_booking_id;
  exception
    when exclusion_violation then
      raise exception 'overlap_conflict';
  end;

  update public.wallets set balance = balance - v_total_price, updated_at = now() where id = v_wallet_id;

  insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
  values (v_wallet_id, 'booking_payment', -v_total_price, v_booking_id, 'completed');

  insert into public.notifications (user_id, title, description, type, related_booking_id)
  values (v_owner_id, 'Nueva reserva', 'Tenés una nueva reserva pendiente de confirmar.', 'booking_created', v_booking_id);

  return v_booking_id;
end;
$$;

grant execute on function public.create_booking(uuid, date, time, time, uuid) to authenticated;

-- 2. cancel_booking --------------------------------------------------------------------

create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancel_window interval := interval '1 hour';
  v_now_local timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_owner_id uuid;
  v_client_id uuid;
  v_status text;
  v_starts_at timestamp;
  v_total_price numeric;
  v_wallet_id uuid;
  v_notify_user_id uuid;
begin
  select p.owner_id, b.user_id, b.status, b.total_price, b.date + b.start_time
  into v_owner_id, v_client_id, v_status, v_total_price, v_starts_at
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id;

  if v_owner_id is null then
    raise exception 'Reserva no encontrada';
  end if;
  if auth.uid() <> v_owner_id and auth.uid() <> v_client_id then
    raise exception 'No autorizado';
  end if;
  if v_status not in ('pending', 'confirmed') then
    raise exception 'Esta reserva ya no se puede cancelar';
  end if;

  -- El cliente no puede cancelar una reserva ya aprobada dentro de la hora previa al inicio.
  -- Las pendientes de aprobación no tienen esta restricción, y el propietario tampoco: puede
  -- tener una urgencia real que le impida recibir al cliente.
  if v_status = 'confirmed'
     and auth.uid() = v_client_id
     and (v_starts_at - v_now_local) < v_cancel_window then
    raise exception 'cancel_too_late';
  end if;

  update public.bookings set status = 'cancelled' where id = p_booking_id;

  select id into v_wallet_id from public.wallets where user_id = v_client_id;
  if v_wallet_id is not null then
    update public.wallets set balance = balance + v_total_price, updated_at = now() where id = v_wallet_id;
    insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
    values (v_wallet_id, 'refund', v_total_price, p_booking_id, 'completed');
  end if;

  v_notify_user_id := case when auth.uid() = v_client_id then v_owner_id else v_client_id end;
  insert into public.notifications (user_id, title, description, type, related_booking_id)
  values (v_notify_user_id, 'Reserva cancelada', 'Una reserva fue cancelada.', 'booking_cancelled', p_booking_id);
end;
$$;

grant execute on function public.cancel_booking(uuid) to authenticated;

-- 3. confirm_booking -------------------------------------------------------------------

create or replace function public.confirm_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_status text;
  v_client_id uuid;
begin
  select p.owner_id, b.status, b.user_id into v_owner_id, v_status, v_client_id
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id;

  if v_owner_id is null then
    raise exception 'Reserva no encontrada';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'No autorizado';
  end if;
  if v_status <> 'pending' then
    raise exception 'Solo se pueden confirmar reservas pendientes';
  end if;

  update public.bookings set status = 'confirmed' where id = p_booking_id;

  insert into public.notifications (user_id, title, description, type, related_booking_id)
  values (v_client_id, 'Reserva confirmada', 'El propietario confirmó tu reserva.', 'booking_confirmed', p_booking_id);
end;
$$;

grant execute on function public.confirm_booking(uuid) to authenticated;

-- 4. start_booking ---------------------------------------------------------------------

create or replace function public.start_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_owner_id uuid;
  v_status text;
  v_actual_start_at timestamptz;
begin
  select b.user_id, p.owner_id, b.status, b.actual_start_at
  into v_client_id, v_owner_id, v_status, v_actual_start_at
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id;

  if v_client_id is null then
    raise exception 'Reserva no encontrada';
  end if;
  if auth.uid() <> v_client_id then
    raise exception 'No autorizado';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'Solo podés iniciar una reserva confirmada';
  end if;
  if v_actual_start_at is not null then
    raise exception 'already_started';
  end if;

  update public.bookings set actual_start_at = now() where id = p_booking_id;

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

-- 5. complete_booking ------------------------------------------------------------------

create or replace function public.complete_booking(p_booking_id uuid)
returns table (overtime_minutes integer, overtime_charge numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grace interval := interval '5 minutes';
  v_overtime_rate_multiplier numeric := 1.5;
  v_owner_id uuid;
  v_client_id uuid;
  v_status text;
  v_price_per_hour numeric;
  v_scheduled_end timestamp;
  -- Hora local argentina. Antes era `now()` casteado a timestamp, que en Supabase (servidor en
  -- UTC) daba 3 horas de más contra un horario guardado en hora local: cobraba tiempo excedido
  -- aunque el cliente saliera puntual.
  v_now timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_overtime_minutes integer := 0;
  v_overtime_charge numeric := 0;
  v_wallet_id uuid;
begin
  select p.owner_id, p.price_per_hour, b.user_id, b.status, b.date + b.end_time
  into v_owner_id, v_price_per_hour, v_client_id, v_status, v_scheduled_end
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id;

  if v_owner_id is null then
    raise exception 'Reserva no encontrada';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'No autorizado';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'Solo se pueden finalizar reservas confirmadas';
  end if;

  if v_now > v_scheduled_end + v_grace then
    v_overtime_minutes := ceil(extract(epoch from (v_now - v_scheduled_end)) / 60.0);
    v_overtime_charge := round((v_overtime_minutes * (v_price_per_hour * v_overtime_rate_multiplier / 60.0))::numeric, 2);
  end if;

  update public.bookings
  set status = 'completed', actual_end_at = now(), overtime_minutes = v_overtime_minutes, overtime_charge = v_overtime_charge
  where id = p_booking_id;

  if v_overtime_charge > 0 then
    select id into v_wallet_id from public.wallets where user_id = v_client_id for update;
    if v_wallet_id is not null then
      update public.wallets set balance = balance - v_overtime_charge, updated_at = now() where id = v_wallet_id;
      insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
      values (v_wallet_id, 'overtime_charge', -v_overtime_charge, p_booking_id, 'completed');
    end if;

    insert into public.notifications (user_id, title, description, type, related_booking_id)
    values (
      v_client_id,
      'Cargo por tiempo excedido',
      format('Te quedaste %s minutos más de lo reservado. Se debitaron $%s de tu billetera.', v_overtime_minutes, v_overtime_charge),
      'overtime_charged',
      p_booking_id
    );
  end if;

  return query select v_overtime_minutes, v_overtime_charge;
end;
$$;

grant execute on function public.complete_booking(uuid) to authenticated;
