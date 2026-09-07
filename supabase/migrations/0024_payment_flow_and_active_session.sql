-- GarageGo — flujo de pago y sesión activa (Fase 8.5).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE de funciones existentes (ninguna cambia de firma) más un
-- DROP/ADD del constraint de tipos de transacción. Seguro de re-correr.
--
-- Decisiones del equipo (2026-09-03) que implementa esta migración:
--   Q1·A  Se quita la aprobación del propietario: create_booking crea la reserva en
--         'confirmed'. El propietario conserva cancel_booking sin límite horario.
--   Q7·B  start_booking valida ventana horaria: desde 15 min antes del inicio y hasta el fin.
--   Q9·A  complete_booking la puede llamar el conductor además del propietario, más una
--         función de auto-cierre para las reservas que nadie finaliza.
--   Q10   Se arregla el bug del payout: desde la 0015 el propietario NUNCA cobraba. Se le
--         vuelve a acreditar al finalizar, y se devuelve el tipo 'earning' al constraint.
--         Se acredita SOLO total_price, no el cargo por tiempo excedido.


-- 0. Constraint de tipos de transacción ------------------------------------------------
-- La 0015 sacó 'earning' de la lista al reescribir complete_booking. Sin esto, el insert
-- de la acreditación al propietario hace fallar toda la transacción de finalización.

alter table public.wallet_transactions drop constraint if exists wallet_transactions_type_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_type_check
  check (type in ('topup', 'booking_payment', 'refund', 'adjustment', 'overtime_charge', 'earning'));


-- 1. create_booking --------------------------------------------------------------------
-- Igual que en la 0020 salvo dos cosas: la reserva nace 'confirmed' (ya no hay paso de
-- aprobación) y la notificación al propietario cambia de "pendiente de confirmar" a un aviso
-- de cobro, que es lo que realmente pasó.

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
    -- 'confirmed' y no 'pending': pagar ya deja la reserva en firme (Q1·A).
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


-- 2. start_booking ---------------------------------------------------------------------
-- Agrega la ventana horaria (Q7·B). Antes se podía "iniciar" hoy una reserva de mañana, lo
-- que dejaba sesiones activas sin sentido y rompía el cálculo de tiempo excedido.

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
  v_status text;
  v_actual_start_at timestamptz;
  v_starts_at timestamp;
  v_ends_at timestamp;
begin
  select b.user_id, p.owner_id, b.status, b.actual_start_at, b.date + b.start_time, b.date + b.end_time
  into v_client_id, v_owner_id, v_status, v_actual_start_at, v_starts_at, v_ends_at
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
  if v_now_local < v_starts_at - v_early_window then
    raise exception 'start_too_early';
  end if;
  if v_now_local > v_ends_at then
    raise exception 'start_window_over';
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


-- 3. _finalize_booking (interna) -------------------------------------------------------
-- Todo lo que pasa al cerrar una reserva, sin control de permisos: la usan complete_booking
-- (que sí valida quién llama) y el auto-cierre (que corre sin usuario). Separarlas evita
-- duplicar el cálculo de excedente y la acreditación en dos lugares.
--
-- p_closed_at_local es la hora de cierre en hora argentina. El auto-cierre pasa una hora
-- TOPEADA, no `now()`: una reserva olvidada tres días no puede cobrar tres días de excedente.
--
-- NO se otorga execute a authenticated: llamarla directo saltearía el control de permisos.

create or replace function public._finalize_booking(p_booking_id uuid, p_closed_at_local timestamp)
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
  v_price_per_hour numeric;
  v_total_price numeric;
  v_scheduled_end timestamp;
  v_overtime_minutes integer := 0;
  v_overtime_charge numeric := 0;
  v_client_wallet_id uuid;
  v_owner_wallet_id uuid;
begin
  select p.owner_id, p.price_per_hour, b.user_id, b.total_price, b.date + b.end_time
  into v_owner_id, v_price_per_hour, v_client_id, v_total_price, v_scheduled_end
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id;

  if p_closed_at_local > v_scheduled_end + v_grace then
    v_overtime_minutes := ceil(extract(epoch from (p_closed_at_local - v_scheduled_end)) / 60.0);
    v_overtime_charge := round((v_overtime_minutes * (v_price_per_hour * v_overtime_rate_multiplier / 60.0))::numeric, 2);
  end if;

  update public.bookings
  set status = 'completed',
      actual_end_at = p_closed_at_local at time zone 'America/Argentina/Buenos_Aires',
      overtime_minutes = v_overtime_minutes,
      overtime_charge = v_overtime_charge
  where id = p_booking_id;

  -- Cargo del excedente al conductor.
  if v_overtime_charge > 0 then
    select id into v_client_wallet_id from public.wallets where user_id = v_client_id for update;
    if v_client_wallet_id is not null then
      update public.wallets set balance = balance - v_overtime_charge, updated_at = now()
      where id = v_client_wallet_id;

      insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
      values (v_client_wallet_id, 'overtime_charge', -v_overtime_charge, p_booking_id, 'completed');
    end if;

    insert into public.notifications (user_id, title, description, type, related_booking_id)
    values (
      v_client_id,
      'Cargo por tiempo excedido',
      format('Te quedaste %s minutos más de lo reservado. Se debitaron $%s de tu billetera.',
             v_overtime_minutes, v_overtime_charge),
      'overtime_charged',
      p_booking_id
    );
  end if;

  -- Acreditación al propietario (Q10). Solo total_price: el excedente no se le acredita,
  -- por decisión del equipo.
  select id into v_owner_wallet_id from public.wallets where user_id = v_owner_id for update;
  if v_owner_wallet_id is not null then
    update public.wallets set balance = balance + v_total_price, updated_at = now()
    where id = v_owner_wallet_id;

    insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
    values (v_owner_wallet_id, 'earning', v_total_price, p_booking_id, 'completed');
  end if;

  insert into public.notifications (user_id, title, description, type, related_booking_id)
  values (
    v_owner_id,
    'Cobro acreditado',
    format('Se acreditaron $%s a tu billetera por una reserva finalizada.', v_total_price),
    'booking_completed',
    p_booking_id
  );

  return query select v_overtime_minutes, v_overtime_charge;
end;
$$;

revoke all on function public._finalize_booking(uuid, timestamp) from public;


-- 4. complete_booking ------------------------------------------------------------------
-- Ahora la puede llamar el conductor además del propietario (Q9·A): la pantalla de sesión
-- activa le da al conductor el botón "Finalizar estacionamiento".
--
-- Se borra primero: la versión que hay en la base puede devolver otro tipo (la 0010 devolvía
-- `void`, la 0015 en adelante devuelve `table(...)`), y CREATE OR REPLACE no puede cambiar el
-- tipo de retorno de una función existente. Es seguro: nada depende de ella (no hay triggers,
-- vistas ni otras funciones que la llamen). El grant se vuelve a otorgar más abajo.

drop function if exists public.complete_booking(uuid);

create or replace function public.complete_booking(p_booking_id uuid)
returns table (overtime_minutes integer, overtime_charge numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_client_id uuid;
  v_status text;
begin
  select p.owner_id, b.user_id, b.status
  into v_owner_id, v_client_id, v_status
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id;

  if v_owner_id is null then
    raise exception 'Reserva no encontrada';
  end if;
  if auth.uid() <> v_owner_id and auth.uid() <> v_client_id then
    raise exception 'No autorizado';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'Solo se pueden finalizar reservas confirmadas';
  end if;

  return query
    select * from public._finalize_booking(
      p_booking_id,
      now() at time zone 'America/Argentina/Buenos_Aires'
    );
end;
$$;

grant execute on function public.complete_booking(uuid) to authenticated;


-- 5. auto_close_stale_bookings ---------------------------------------------------------
-- Red de seguridad (Q9): si nadie finaliza, la reserva quedaría 'confirmed' para siempre y
-- el propietario nunca cobraría. Cierra las que ya pasaron su fin por más del margen,
-- cobrando el excedente SOLO hasta ese margen.

create or replace function public.auto_close_stale_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_margin interval := interval '2 hours';
  v_now_local timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_booking record;
  v_closed integer := 0;
begin
  for v_booking in
    select b.id, b.date + b.end_time as scheduled_end
    from public.bookings b
    where b.status = 'confirmed'
      and (b.date + b.end_time) + v_margin < v_now_local
  loop
    -- Se cierra como si el conductor se hubiera ido al vencer el margen, no ahora: si la
    -- reserva quedó abierta una semana, cobrarle una semana de excedente sería absurdo.
    perform public._finalize_booking(v_booking.id, v_booking.scheduled_end + v_margin);
    v_closed := v_closed + 1;
  end loop;

  return v_closed;
end;
$$;

revoke all on function public.auto_close_stale_bookings() from public;

-- Programación automática. Requiere la extensión pg_cron, que se habilita en
-- Supabase Dashboard > Database > Extensions > pg_cron. Descomentar una vez habilitada:
--
-- select cron.schedule(
--   'garagego-auto-close-bookings',
--   '*/15 * * * *',
--   $$select public.auto_close_stale_bookings()$$
-- );
--
-- Mientras no esté programada, la función queda disponible para correrla a mano:
--   select public.auto_close_stale_bookings();
