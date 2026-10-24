-- GarageGo — buffer entre reservas y cobro automático de tiempo excedido (overstay).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run

alter table public.bookings
  add column actual_end_at timestamptz,
  add column overtime_minutes integer not null default 0,
  add column overtime_charge numeric(10, 2) not null default 0;

alter table public.wallet_transactions drop constraint wallet_transactions_type_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_type_check
  check (type in ('topup', 'booking_payment', 'refund', 'adjustment', 'overtime_charge'));

-- create_booking: se agrega un buffer de 15 minutos antes/después de cada reserva existente
-- para darle margen al conductor anterior sin que se pise con el siguiente.
create or replace function public.create_booking(
  p_parking_lot_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time
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
    insert into public.bookings (user_id, parking_lot_id, date, start_time, end_time, status, total_price)
    values (v_user_id, p_parking_lot_id, p_date, p_start_time, p_end_time, 'pending', v_total_price)
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

grant execute on function public.create_booking(uuid, date, time, time) to authenticated;

-- complete_booking: registra la hora real de salida y cobra el excedente (con 5 minutos de
-- gracia) a 1.5x el precio por hora, debitado automáticamente de la billetera del cliente.
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
  v_now timestamp := now();
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
  set status = 'completed', actual_end_at = v_now, overtime_minutes = v_overtime_minutes, overtime_charge = v_overtime_charge
  where id = p_booking_id;

  if v_overtime_charge > 0 then
    select id into v_wallet_id from public.wallets where user_id = v_client_id for update;
    if v_wallet_id is not null then
      update public.wallets set balance = balance - v_overtime_charge, updated_at = now() where id = v_wallet_id;
      insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
      values (v_wallet_id, 'overtime_charge', -v_overtime_charge, p_booking_id, 'completed');
    end if;

    insert into public.notifications (user_id, title, description, type)
    values (
      v_client_id,
      'Cargo por tiempo excedido',
      format('Te quedaste %s minutos más de lo reservado. Se debitaron $%s de tu billetera.', v_overtime_minutes, v_overtime_charge),
      'overtime_charged'
    );
  end if;

  return query select v_overtime_minutes, v_overtime_charge;
end;
$$;

grant execute on function public.complete_booking(uuid) to authenticated;
