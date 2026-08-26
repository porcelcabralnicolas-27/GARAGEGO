-- GarageGo — funciones de reservas (Fase 6): crear, confirmar, cancelar, finalizar.
-- Todas corren como SECURITY DEFINER porque mueven saldo de wallets, algo que el cliente
-- nunca debe poder hacer directamente (no hay policy de update en wallets para authenticated).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run

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

  insert into public.notifications (user_id, title, description, type)
  values (v_client_id, 'Reserva confirmada', 'El propietario confirmó tu reserva.', 'booking_confirmed');
end;
$$;

grant execute on function public.confirm_booking(uuid) to authenticated;

create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_status text;
begin
  select p.owner_id, b.status into v_owner_id, v_status
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

  update public.bookings set status = 'completed' where id = p_booking_id;
end;
$$;

grant execute on function public.complete_booking(uuid) to authenticated;

create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_client_id uuid;
  v_status text;
  v_total_price numeric;
  v_wallet_id uuid;
  v_notify_user_id uuid;
begin
  select p.owner_id, b.user_id, b.status, b.total_price into v_owner_id, v_client_id, v_status, v_total_price
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

  update public.bookings set status = 'cancelled' where id = p_booking_id;

  select id into v_wallet_id from public.wallets where user_id = v_client_id;
  if v_wallet_id is not null then
    update public.wallets set balance = balance + v_total_price, updated_at = now() where id = v_wallet_id;
    insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
    values (v_wallet_id, 'refund', v_total_price, p_booking_id, 'completed');
  end if;

  v_notify_user_id := case when auth.uid() = v_client_id then v_owner_id else v_client_id end;
  insert into public.notifications (user_id, title, description, type)
  values (v_notify_user_id, 'Reserva cancelada', 'Una reserva fue cancelada.', 'booking_cancelled');
end;
$$;

grant execute on function public.cancel_booking(uuid) to authenticated;
