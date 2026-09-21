-- GarageGo — las reglas de horario y de moderación de una reserva se validan en el servidor.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE (mismas firmas). Re-correr OK.
--
-- ── Los problemas (auditoría técnica 2026-09-13, hallazgos 1.4, 1.5 y 1.6) ───────────────
--   * create_booking chequeaba `is_active` pero NO la moderación (approval_status /
--     moderation_state de la 0034): una cochera pendiente, rechazada, pausada o suspendida se
--     podía reservar conociendo su id.
--   * Tampoco validaba que el horario estuviera dentro de la disponibilidad configurada por el
--     propietario: eso lo calculaba solo la app (src/features/booking/availability.ts). Un
--     cliente modificado podía reservar a las 3 AM de un día cerrado.
--   * El buffer de 15 min entre reservas se chequeaba con un EXISTS sin lock: dos reservas
--     simultáneas podían pasar las dos (la exclusion constraint de la 0001 solo cubre el
--     solapamiento directo, no el buffer).
--
-- ── Arreglo ──────────────────────────────────────────────────────────────────────────────
-- Helper `_assert_slot_bookable`, que replica en SQL las reglas de availability.ts y que va a
-- reutilizar la futura `create_booking_pending_payment` de Mercado Pago:
--   1. Lock transaccional por cochera (pg_advisory_xact_lock): dos reservas de la MISMA
--      cochera se serializan, así el chequeo de buffer ve siempre a la otra. Reservas de
--      cocheras distintas no se bloquean entre sí. El lock se libera solo al terminar la
--      transacción.
--   2. La cochera tiene que estar activa, aprobada, 'live' y no archivada.
--   3. El rango tiene que caber entero en una ventana configurada. Igual que la app: si hay
--      excepción para esa fecha, reemplaza el día (cerrado, o su propia franja); si no, se usa
--      la franja recurrente de ese día de la semana (0 = domingo en los dos lados).
--   4. Duración mínima de 30 min y en pasos de 30 min desde el inicio (la app ofrece como fin
--      inicio + 30, + 60, ...).
--   5. Buffer de 15 min contra las reservas pending/confirmed de la cochera.

-- `archived_at` lo usa la 0053 (borrado lógico de cocheras). Se agrega acá porque este helper
-- ya tiene que excluir las cocheras archivadas.
alter table public.parking_lots add column if not exists archived_at timestamptz;


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
begin
  -- 1. Serializa las reservas de esta cochera hasta el fin de la transacción.
  perform pg_advisory_xact_lock(hashtextextended('garagego.booking:' || p_parking_lot_id::text, 0));

  -- 2. Estado de la publicación.
  select is_active, approval_status, moderation_state, archived_at
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

  -- 5. Buffer entre reservas (misma consulta que la 0024, ahora bajo el lock).
  if exists (
    select 1 from public.bookings b
    where b.parking_lot_id = p_parking_lot_id
      and b.status in ('pending', 'confirmed')
      and tsrange(b.date + b.start_time - v_buffer, b.date + b.end_time + v_buffer)
        && tsrange(p_date + p_start_time, p_date + p_end_time)
  ) then
    raise exception 'buffer_conflict';
  end if;
end;
$$;

revoke all on function public._assert_slot_bookable(uuid, date, time, time) from public, anon, authenticated;


-- create_booking -----------------------------------------------------------------------
-- Igual que la 0024, salvo que las validaciones de la cochera y del horario pasan al helper.

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


-- get_booked_intervals -----------------------------------------------------------------
-- Hallazgo 2.5: no validaba quién llama. Ahora exige sesión y que la cochera sea visible para
-- quien consulta, con el mismo criterio que la policy `parking_lots_select_public` (0040).
-- Misma firma y mismo tipo de retorno que la 0012.

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
    and b.date >= p_from_date
    and auth.uid() is not null
    and exists (
      select 1 from public.parking_lots p
      where p.id = p_parking_lot_id
        and (
          (p.is_active and p.approval_status = 'approved' and p.moderation_state = 'live')
          or p.owner_id = auth.uid()
          or public.is_admin(auth.uid())
        )
    );
$$;

revoke all on function public.get_booked_intervals(uuid, date) from public, anon;
grant execute on function public.get_booked_intervals(uuid, date) to authenticated;
