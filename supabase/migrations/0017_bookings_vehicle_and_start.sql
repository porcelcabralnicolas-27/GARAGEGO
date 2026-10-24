-- GarageGo — vehículo elegido al reservar + botón "Iniciar reserva" (llegada real).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: usa ADD COLUMN IF NOT EXISTS y CREATE OR REPLACE, seguro de re-correr.

alter table public.bookings add column if not exists vehicle_id uuid references public.vehicles (id) on delete set null;
alter table public.bookings add column if not exists actual_start_at timestamptz;

-- create_booking cambia de firma (se agrega p_vehicle_id): hay que borrar la versión vieja de
-- 4 parámetros, porque Postgres trata funciones con distinta cantidad de parámetros como
-- funciones distintas (create or replace no la reemplaza, la duplicaría).
drop function if exists public.create_booking(uuid, date, time, time);

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
  if p_date < current_date then
    raise exception 'No se puede reservar en el pasado';
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

  insert into public.notifications (user_id, title, description, type)
  values (v_owner_id, 'Nueva reserva', 'Tenés una nueva reserva pendiente de confirmar.', 'booking_created');

  return v_booking_id;
end;
$$;

grant execute on function public.create_booking(uuid, date, time, time, uuid) to authenticated;

-- start_booking: el cliente la toca al llegar al estacionamiento. Solo marca la llegada real
-- (actual_start_at); no cambia el status ni mueve saldo. Avisa al propietario.
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

  insert into public.notifications (user_id, title, description, type)
  values (
    v_owner_id,
    'El cliente llegó',
    'El cliente inició su reserva y ya está usando el estacionamiento.',
    'booking_started'
  );
end;
$$;

grant execute on function public.start_booking(uuid) to authenticated;
