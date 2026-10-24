-- GarageGo — transiciones de estado de las reservas: idempotentes y seguras ante concurrencia.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: solo CREATE OR REPLACE (mismas firmas y tipos de retorno). Re-correr OK.
-- Requiere la 0046 (índice único de movimientos por reserva y tipo).
--
-- ── Los problemas (auditoría técnica 2026-09-13, hallazgos 1.1 y 1.2) ────────────────────
-- cancel_booking, start_booking, complete_booking y _finalize_booking leían el estado de la
-- reserva con un SELECT común y después actualizaban con `where id = ...`, sin volver a mirar
-- el estado. Dos llamadas simultáneas (conductor y propietario, dos dispositivos, un reintento
-- HTTP, o un usuario y el cron de auto-cierre) podían leer las dos 'confirmed' y ejecutar la
-- liquidación dos veces: doble reembolso, doble acreditación al propietario, doble excedente.
-- Además complete_booking permitía finalizar una reserva que nunca se inició.
--
-- ── El patrón que se aplica en todas ─────────────────────────────────────────────────────
--   1. `select ... for update of b`: bloquea la fila de la reserva. Una segunda llamada
--      concurrente espera acá hasta que la primera termine, y entonces ve el estado nuevo.
--   2. Se valida el estado leído bajo el lock.
--   3. `update ... where id = ... and status = <esperado>` + `get diagnostics row_count`: si no
--      se actualizó exactamente una fila, se aborta ANTES de mover plata.
--   4. Red final: el índice único de la 0046 impide un segundo movimiento del mismo tipo.
--
-- ── Decisiones del equipo (2026-09-21) ───────────────────────────────────────────────────
--   * Se mantiene Q1·A: el propietario puede cancelar siempre, incluso con la sesión ya
--     iniciada, con reembolso del 100%. Solo se cierra la carrera.
--   * Finalizar A MANO exige que la reserva se haya iniciado (actual_start_at no nulo).
--   * El auto-cierre de una reserva nunca iniciada (no-show) le paga igual el total al
--     propietario (el horario quedó bloqueado para él), pero NO cobra excedente.


-- 1. cancel_booking --------------------------------------------------------------------
-- Mismas reglas que la 0020: el conductor hasta 1 h antes del inicio; el propietario sin límite.

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
  v_rows integer;
begin
  select p.owner_id, b.user_id, b.status, b.total_price, b.date + b.start_time
  into v_owner_id, v_client_id, v_status, v_total_price, v_starts_at
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id
  for update of b;

  if v_owner_id is null then
    raise exception 'Reserva no encontrada';
  end if;
  if auth.uid() is null or (auth.uid() <> v_owner_id and auth.uid() <> v_client_id) then
    raise exception 'No autorizado';
  end if;
  if v_status not in ('pending', 'confirmed') then
    raise exception 'Esta reserva ya no se puede cancelar';
  end if;

  if v_status = 'confirmed'
     and auth.uid() = v_client_id
     and (v_starts_at - v_now_local) < v_cancel_window then
    raise exception 'cancel_too_late';
  end if;

  update public.bookings set status = 'cancelled'
  where id = p_booking_id and status in ('pending', 'confirmed');
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'booking_state_changed';
  end if;

  select id into v_wallet_id from public.wallets where user_id = v_client_id for update;
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


-- 2. start_booking ---------------------------------------------------------------------
-- Misma ventana que la 0024 (desde 15 min antes del inicio hasta el fin).

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
  v_rows integer;
begin
  select b.user_id, p.owner_id, b.status, b.actual_start_at, b.date + b.start_time, b.date + b.end_time
  into v_client_id, v_owner_id, v_status, v_actual_start_at, v_starts_at, v_ends_at
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


-- 3. _finalize_booking (interna) -------------------------------------------------------
-- Misma liquidación que la 0029 (excedente topeado a 2 h y al saldo disponible; al
-- propietario se le acredita solo total_price). Cambios:
--   * bloquea la reserva y exige que siga 'confirmed' (si no, aborta sin mover plata);
--   * si nunca se inició (no-show que cierra el cron), no hay excedente.

create or replace function public._finalize_booking(p_booking_id uuid, p_closed_at_local timestamp)
returns table (overtime_minutes integer, overtime_charge numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grace interval := interval '5 minutes';
  v_max_overtime interval := interval '2 hours';
  v_overtime_rate_multiplier numeric := 1.5;
  v_owner_id uuid;
  v_client_id uuid;
  v_status text;
  v_actual_start_at timestamptz;
  v_price_per_hour numeric;
  v_total_price numeric;
  v_scheduled_end timestamp;
  v_charge_until timestamp;
  v_overtime_minutes integer := 0;
  v_overtime_charge numeric := 0;
  v_overtime_collected numeric := 0;
  v_client_wallet_id uuid;
  v_client_balance numeric;
  v_owner_wallet_id uuid;
  v_rows integer;
begin
  select p.owner_id, p.price_per_hour, b.user_id, b.total_price, b.date + b.end_time, b.status, b.actual_start_at
  into v_owner_id, v_price_per_hour, v_client_id, v_total_price, v_scheduled_end, v_status, v_actual_start_at
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id
  for update of b;

  if v_owner_id is null then
    raise exception 'Reserva no encontrada';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'booking_state_changed';
  end if;

  -- Excedente: solo si el conductor efectivamente usó el lugar.
  if v_actual_start_at is not null then
    v_charge_until := least(p_closed_at_local, v_scheduled_end + v_max_overtime);
    if v_charge_until > v_scheduled_end + v_grace then
      v_overtime_minutes := ceil(extract(epoch from (v_charge_until - v_scheduled_end)) / 60.0);
      v_overtime_charge := round((v_overtime_minutes * (v_price_per_hour * v_overtime_rate_multiplier / 60.0))::numeric, 2);
    end if;
  end if;

  -- El cambio de estado va primero y condicionado: si otra transacción la cerró en el medio,
  -- no se toca ninguna billetera.
  update public.bookings
  set status = 'completed',
      actual_end_at = p_closed_at_local at time zone 'America/Argentina/Buenos_Aires',
      overtime_minutes = v_overtime_minutes,
      overtime_charge = 0
  where id = p_booking_id and status = 'confirmed';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'booking_state_changed';
  end if;

  -- Cargo del excedente al conductor, topeado a lo que tenga en la billetera.
  if v_overtime_charge > 0 then
    select id, balance into v_client_wallet_id, v_client_balance
    from public.wallets where user_id = v_client_id for update;

    if v_client_wallet_id is not null then
      v_overtime_collected := least(v_overtime_charge, v_client_balance);
      if v_overtime_collected > 0 then
        update public.wallets set balance = balance - v_overtime_collected, updated_at = now()
        where id = v_client_wallet_id;

        insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
        values (v_client_wallet_id, 'overtime_charge', -v_overtime_collected, p_booking_id, 'completed');
      end if;
    end if;

    update public.bookings set overtime_charge = v_overtime_collected where id = p_booking_id;

    insert into public.notifications (user_id, title, description, type, related_booking_id)
    values (
      v_client_id,
      'Cargo por tiempo excedido',
      format('Te quedaste %s minutos más de lo reservado. Se debitaron $%s de tu billetera.',
             v_overtime_minutes, v_overtime_collected),
      'overtime_charged',
      p_booking_id
    );
  end if;

  -- Acreditación al propietario (Q10). Solo total_price: el excedente no se le acredita.
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

  return query select v_overtime_minutes, v_overtime_collected;
end;
$$;

revoke all on function public._finalize_booking(uuid, timestamp) from public, anon, authenticated;


-- 4. complete_booking ------------------------------------------------------------------
-- Finalizar a mano (conductor o propietario) exige que la reserva se haya iniciado.

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
  v_actual_start_at timestamptz;
begin
  select p.owner_id, b.user_id, b.status, b.actual_start_at
  into v_owner_id, v_client_id, v_status, v_actual_start_at
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id
  for update of b;

  if v_owner_id is null then
    raise exception 'Reserva no encontrada';
  end if;
  if auth.uid() is null or (auth.uid() <> v_owner_id and auth.uid() <> v_client_id) then
    raise exception 'No autorizado';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'Solo se pueden finalizar reservas confirmadas';
  end if;
  if v_actual_start_at is null then
    raise exception 'booking_not_started';
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
-- `skip locked`: si una reserva está siendo finalizada a mano en ese mismo momento, el cron la
-- saltea (la toma la próxima corrida si todavía hiciera falta). Cada cierre va en su propio
-- bloque con manejo de errores: una reserva problemática no aborta a todas las demás (es lo que
-- pasó con el bug de la 0029).

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
    for update skip locked
  loop
    begin
      perform public._finalize_booking(v_booking.id, v_booking.scheduled_end + v_margin);
      v_closed := v_closed + 1;
    exception when others then
      raise warning 'auto_close_stale_bookings: no se pudo cerrar la reserva %: %', v_booking.id, sqlerrm;
    end;
  end loop;

  return v_closed;
end;
$$;

revoke all on function public.auto_close_stale_bookings() from public, anon, authenticated;
