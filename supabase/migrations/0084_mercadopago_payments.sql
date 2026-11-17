-- GarageGo — Mercado Pago: pago de reservas, recarga de billetera y reembolsos.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE TABLE/INDEX IF NOT EXISTS, CREATE OR REPLACE
-- (mismas firmas que las funciones que reemplaza). Re-correr OK.
-- Verificación: supabase/tests/mercadopago_checks.sql.
--
-- ── Qué agrega ───────────────────────────────────────────────────────────────────────────
-- La base no habla con Mercado Pago: eso lo hacen las Edge Functions (supabase/functions/),
-- que guardan el access token y llaman a estas funciones con el rol de servicio. Acá vive la
-- regla de negocio:
--
--   * Reserva con Mercado Pago: se crea 'pending' (ya bloquea el lugar: _assert_slot_bookable
--     y el chequeo del vehículo cuentan pending y confirmed) con 10 minutos para pagar. Se
--     confirma cuando la Edge Function informa un pago aprobado. Si no llega, el cron la
--     cancela a los 10 + 5 minutos de gracia. El propietario no se entera hasta que se paga.
--   * Recarga de billetera con Mercado Pago: el saldo sube cuando llega el pago aprobado.
--   * Cancelación de una reserva pagada con Mercado Pago: la plata vuelve a la cuenta de
--     Mercado Pago del conductor (no a la billetera). La base deja el reembolso marcado como
--     'required' y la Edge Function lo ejecuta.
--   * Un pago aprobado que ya no se puede usar (reserva vencida o cancelada, intento ya pagado
--     por otro pago, monto distinto) también queda 'required': se reembolsa siempre.
--
-- ── Contabilidad (sin tipos de movimiento nuevos) ────────────────────────────────────────
--   * Recarga: 'topup' +monto, payment_gateway_ref = 'mp:<id del pago>'.
--   * Pago de reserva: 'topup' +total ('mp:<id>') y 'booking_payment' -total. El saldo no
--     cambia y toda reserva confirmada tiene su booking_payment (lo que miden el panel y el
--     índice único de la 0046).
--   * Cancelación de una reserva pagada con Mercado Pago: 'refund' +total y 'adjustment'
--     -total con payment_gateway_ref = 'mp-refund:<id>' (devolución a Mercado Pago). El saldo
--     tampoco cambia.
--
-- ── Orden de los locks ───────────────────────────────────────────────────────────────────
-- Siempre: reserva -> intento -> pago -> billetera. Lo respetan apply_mp_payment,
-- cancel_booking y expire_unpaid_bookings, así no se bloquean entre sí.


-- 1. Columnas en bookings ---------------------------------------------------------------

alter table public.bookings add column if not exists payment_method text not null default 'wallet';
alter table public.bookings add column if not exists payment_deadline timestamptz;
alter table public.bookings add column if not exists paid_at timestamptz;

alter table public.bookings drop constraint if exists bookings_payment_method_check;
alter table public.bookings add constraint bookings_payment_method_check
  check (payment_method in ('wallet', 'mercadopago'));

alter table public.bookings drop constraint if exists bookings_mp_deadline_check;
alter table public.bookings add constraint bookings_mp_deadline_check
  check (payment_method = 'wallet' or payment_deadline is not null);

comment on column public.bookings.payment_method is
  'Cómo se paga la reserva. Una reserva ''pending'' con mercadopago está esperando el pago (0084).';
comment on column public.bookings.payment_deadline is
  'Hasta cuándo se puede pagar una reserva con Mercado Pago. El cron la cancela 5 minutos después.';
comment on column public.bookings.paid_at is
  'Cuándo se aprobó el pago de Mercado Pago. Una reserva de Mercado Pago sin paid_at nunca se pagó: el propietario no la ve.';

create index if not exists bookings_mp_pending_idx
  on public.bookings (payment_deadline)
  where status = 'pending' and payment_method = 'mercadopago';


-- 2. Tablas -----------------------------------------------------------------------------
-- Las dos son internas: solo las leen y escriben las funciones de abajo y las Edge Functions
-- (rol de servicio). La app consulta el estado con get_booking_payment_status / get_topup_status.

create table if not exists public.mp_checkout_attempts (
  id uuid primary key default gen_random_uuid(),         -- es el external_reference de la orden
  kind text not null check (kind in ('booking', 'topup')),
  booking_id uuid references public.bookings (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  expires_at timestamptz not null,
  mp_order_id text,
  status text not null default 'created'
    check (status in ('created', 'approved', 'expired', 'superseded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'booking' or booking_id is null)
);

create index if not exists mp_checkout_attempts_booking_idx on public.mp_checkout_attempts (booking_id);
create index if not exists mp_checkout_attempts_open_idx
  on public.mp_checkout_attempts (user_id, kind) where status = 'created';

create table if not exists public.mp_payments (
  mp_payment_id text primary key,                         -- clave de idempotencia de los webhooks
  mp_order_id text,
  attempt_id uuid not null references public.mp_checkout_attempts (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  status text not null,
  status_detail text,
  amount numeric(12, 2),
  currency text,
  applied boolean not null default false,
  refund_status text not null default 'none'
    check (refund_status in ('none', 'required', 'done', 'failed')),
  refund_reason text,
  mp_refund_id text,
  refund_attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un solo pago aplicado por intento y por reserva: un segundo pago aprobado se reembolsa.
create unique index if not exists mp_payments_one_applied_per_attempt
  on public.mp_payments (attempt_id) where applied;
create unique index if not exists mp_payments_one_applied_per_booking
  on public.mp_payments (booking_id) where applied and booking_id is not null;
create index if not exists mp_payments_refund_pending_idx
  on public.mp_payments (refund_status) where refund_status in ('required', 'failed');

alter table public.mp_checkout_attempts enable row level security;
alter table public.mp_payments enable row level security;
revoke all on public.mp_checkout_attempts from anon, authenticated;
revoke all on public.mp_payments from anon, authenticated;

-- Red final contra acreditar dos veces el mismo pago o la misma devolución.
create unique index if not exists wallet_transactions_mp_ref_once
  on public.wallet_transactions (payment_gateway_ref)
  where payment_gateway_ref like 'mp:%' or payment_gateway_ref like 'mp-refund:%';


-- 3. create_booking_pending_payment -----------------------------------------------------
-- Mismas validaciones y locks que create_booking (0067), sin tocar la billetera ni avisar al
-- propietario. Un usuario puede tener hasta 2 reservas esperando pago, para que nadie bloquee
-- lugares sin pagar.

create or replace function public.create_booking_pending_payment(
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
  v_payment_window interval := interval '10 minutes';
  v_max_pending integer := 2;
  v_now_local timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_price_per_hour numeric;
  v_hours numeric;
  v_total_price numeric;
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

  -- Tope de reservas esperando pago. El lock por usuario va antes que el del vehículo y el de
  -- la cochera, y evita que dos pedidos simultáneos pasen los dos el conteo.
  perform pg_advisory_xact_lock(hashtextextended('garagego.mp_pending:' || v_user_id::text, 0));
  if (
    select count(*) from public.bookings
    where user_id = v_user_id and status = 'pending' and payment_method = 'mercadopago'
  ) >= v_max_pending then
    raise exception 'too_many_pending_payments';
  end if;

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

  insert into public.bookings
    (user_id, parking_lot_id, date, start_time, end_time, status, total_price, vehicle_id,
     payment_method, payment_deadline)
  values
    (v_user_id, p_parking_lot_id, p_date, p_start_time, p_end_time, 'pending', v_total_price, p_vehicle_id,
     'mercadopago', now() + v_payment_window)
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

revoke all on function public.create_booking_pending_payment(uuid, date, time, time, uuid) from public, anon, authenticated;
grant execute on function public.create_booking_pending_payment(uuid, date, time, time, uuid) to authenticated;


-- 4. begin_mp_payment_attempt -----------------------------------------------------------
-- Abre un intento de pago para una reserva pendiente propia. Lo llama la Edge Function
-- mp-create-preference con el JWT del usuario, antes de crear la orden en Mercado Pago.
-- Todos los intentos vencen con el plazo original de la reserva: reintentar no da tiempo extra.

create or replace function public.begin_mp_payment_attempt(p_booking_id uuid)
returns table (attempt_id uuid, amount numeric, expires_at timestamptz, lot_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_attempts integer := 5;
  v_min_left interval := interval '1 minute';
  v_user_id uuid := auth.uid();
  v_booking record;
  v_attempt_id uuid;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  select b.user_id, b.status, b.payment_method, b.payment_deadline, b.total_price, p.name as lot_name
  into v_booking
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id
  for update of b;

  if not found then
    raise exception 'Reserva no encontrada';
  end if;
  if v_booking.user_id <> v_user_id then
    raise exception 'Reserva no encontrada';
  end if;
  if v_booking.status <> 'pending' or v_booking.payment_method <> 'mercadopago' then
    raise exception 'booking_not_pending';
  end if;
  if now() > v_booking.payment_deadline - v_min_left then
    raise exception 'payment_window_over';
  end if;
  if (select count(*) from public.mp_checkout_attempts a where a.booking_id = p_booking_id) >= v_max_attempts then
    raise exception 'too_many_payment_attempts';
  end if;

  insert into public.mp_checkout_attempts (kind, booking_id, user_id, amount, expires_at)
  values ('booking', p_booking_id, v_user_id, v_booking.total_price, v_booking.payment_deadline)
  returning id into v_attempt_id;

  return query select v_attempt_id, v_booking.total_price, v_booking.payment_deadline, v_booking.lot_name;
end;
$$;

revoke all on function public.begin_mp_payment_attempt(uuid) from public, anon, authenticated;
grant execute on function public.begin_mp_payment_attempt(uuid) to authenticated;


-- 5. begin_mp_topup ---------------------------------------------------------------------
-- Abre un intento de recarga. Mismos topes que la recarga de prueba (0074): hasta $50.000 por
-- recarga y $200.000 de saldo. Los topes se controlan acá: si después llega un pago aprobado,
-- se acredita igual (la plata ya se cobró).

create or replace function public.begin_mp_topup(p_amount numeric)
returns table (attempt_id uuid, amount numeric, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_topup constant numeric := 100;
  v_max_topup constant numeric := 50000;
  v_max_balance constant numeric := 200000;
  v_max_open constant integer := 3;
  v_window constant interval := interval '30 minutes';
  v_user_id uuid := auth.uid();
  v_amount numeric := round(p_amount, 2);
  v_balance numeric;
  v_attempt_id uuid;
  v_expires_at timestamptz := now() + v_window;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if v_amount is null or v_amount < v_min_topup or v_amount > v_max_topup then
    raise exception 'invalid_topup_amount';
  end if;

  select balance into v_balance from public.wallets where user_id = v_user_id;
  if v_balance is null then
    raise exception 'No se encontró tu billetera';
  end if;
  if v_balance + v_amount > v_max_balance then
    raise exception 'topup_limit_reached';
  end if;

  if (
    select count(*) from public.mp_checkout_attempts a
    where a.user_id = v_user_id and a.kind = 'topup' and a.status = 'created' and a.expires_at > now()
  ) >= v_max_open then
    raise exception 'too_many_open_topups';
  end if;

  insert into public.mp_checkout_attempts (kind, user_id, amount, expires_at)
  values ('topup', v_user_id, v_amount, v_expires_at)
  returning id into v_attempt_id;

  return query select v_attempt_id, v_amount, v_expires_at;
end;
$$;

revoke all on function public.begin_mp_topup(numeric) from public, anon, authenticated;
grant execute on function public.begin_mp_topup(numeric) to authenticated;


-- 6. Consultas de estado para la app ----------------------------------------------------
-- Devuelven filas solo al dueño de la reserva o de la recarga; a cualquier otro, nada.

create or replace function public.get_booking_payment_status(p_booking_id uuid)
returns table (
  status text,
  payment_method text,
  payment_deadline timestamptz,
  seconds_left integer,
  last_payment_status text,
  last_payment_detail text,
  refund_status text,
  can_retry boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.status,
    b.payment_method,
    b.payment_deadline,
    greatest(0, floor(extract(epoch from (b.payment_deadline - now()))))::integer,
    lp.status,
    lp.status_detail,
    coalesce(rp.refund_status, 'none'),
    b.status = 'pending'
      and b.payment_method = 'mercadopago'
      and now() < b.payment_deadline - interval '1 minute'
      and (select count(*) from public.mp_checkout_attempts a where a.booking_id = b.id) < 5
  from public.bookings b
  left join lateral (
    select m.status, m.status_detail from public.mp_payments m
    where m.booking_id = b.id order by m.updated_at desc limit 1
  ) lp on true
  left join lateral (
    -- El reembolso que importa: el del pago aplicado (cancelación) o, si no hubo, el último
    -- pago que haya que devolver (aprobado tarde).
    select m.refund_status from public.mp_payments m
    where m.booking_id = b.id and m.refund_status <> 'none'
    order by m.applied desc, m.updated_at desc limit 1
  ) rp on true
  where b.id = p_booking_id and b.user_id = auth.uid();
$$;

revoke all on function public.get_booking_payment_status(uuid) from public, anon, authenticated;
grant execute on function public.get_booking_payment_status(uuid) to authenticated;

create or replace function public.get_topup_status(p_attempt_id uuid)
returns table (
  status text,
  amount numeric,
  expires_at timestamptz,
  last_payment_status text,
  last_payment_detail text,
  refund_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.status,
    a.amount,
    a.expires_at,
    lp.status,
    lp.status_detail,
    coalesce(lp.refund_status, 'none')
  from public.mp_checkout_attempts a
  left join lateral (
    select m.status, m.status_detail, m.refund_status from public.mp_payments m
    where m.attempt_id = a.id order by m.applied desc, m.updated_at desc limit 1
  ) lp on true
  where a.id = p_attempt_id and a.kind = 'topup' and a.user_id = auth.uid();
$$;

revoke all on function public.get_topup_status(uuid) from public, anon, authenticated;
grant execute on function public.get_topup_status(uuid) to authenticated;


-- 7. apply_mp_payment (solo rol de servicio) --------------------------------------------
-- La llama la Edge Function con un pago que acaba de consultar en la API de Mercado Pago
-- (nunca con datos del webhook sin verificar). Idempotente: el mismo pago dos veces no hace
-- nada la segunda. Devuelve:
--   'unknown_attempt'  el external_reference no es un intento nuestro
--   'recorded'         el pago no está aprobado (rechazado, en proceso…): solo se registra
--   'confirmed'        reserva confirmada
--   'credited'         recarga acreditada
--   'already_applied'  ese pago ya se había aplicado
--   'refund_required'  aprobado pero no se puede usar: la Edge Function tiene que reembolsarlo
--   'already_refunded' ya se reembolsó

create or replace function public.apply_mp_payment(
  p_attempt_id uuid,
  p_payment_id text,
  p_order_id text,
  p_status text,
  p_status_detail text,
  p_amount numeric,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_attempt public.mp_checkout_attempts%rowtype;
  v_booking record;
  v_payment public.mp_payments%rowtype;
  v_wallet_id uuid;
  v_amount_ok boolean;
  v_reason text;
  v_rows integer;
begin
  if p_payment_id is null or p_status is null then
    raise exception 'Pago inválido';
  end if;

  -- Orden de locks: primero la reserva (si es de reserva), después el intento.
  select booking_id into v_booking_id from public.mp_checkout_attempts where id = p_attempt_id;
  if not found then
    return 'unknown_attempt';
  end if;

  if v_booking_id is not null then
    select b.id, b.user_id, b.status, b.payment_method, b.total_price, p.owner_id
    into v_booking
    from public.bookings b
    join public.parking_lots p on p.id = b.parking_lot_id
    where b.id = v_booking_id
    for update of b;
  end if;

  select * into v_attempt from public.mp_checkout_attempts where id = p_attempt_id for update;

  insert into public.mp_payments
    (mp_payment_id, mp_order_id, attempt_id, booking_id, status, status_detail, amount, currency)
  values
    (p_payment_id, p_order_id, p_attempt_id, v_attempt.booking_id, p_status, p_status_detail, p_amount, p_currency)
  on conflict (mp_payment_id) do update
    set status = excluded.status,
        status_detail = excluded.status_detail,
        amount = coalesce(excluded.amount, mp_payments.amount),
        currency = coalesce(excluded.currency, mp_payments.currency),
        mp_order_id = coalesce(excluded.mp_order_id, mp_payments.mp_order_id),
        updated_at = now();

  select * into v_payment from public.mp_payments where mp_payment_id = p_payment_id for update;

  if v_payment.attempt_id <> p_attempt_id then
    raise exception 'El pago % pertenece a otro intento', p_payment_id;
  end if;
  if v_payment.applied then
    return 'already_applied';
  end if;
  if p_status <> 'approved' then
    return 'recorded';
  end if;
  if v_payment.refund_status = 'done' then
    return 'already_refunded';
  end if;
  if v_payment.refund_status in ('required', 'failed') then
    return 'refund_required';
  end if;

  v_amount_ok := upper(coalesce(p_currency, '')) = 'ARS' and round(p_amount, 2) = v_attempt.amount;

  -- Recarga.
  if v_attempt.kind = 'topup' then
    if v_amount_ok and not exists (
      select 1 from public.mp_payments m where m.attempt_id = p_attempt_id and m.applied
    ) then
      select id into v_wallet_id from public.wallets where user_id = v_attempt.user_id for update;
      if v_wallet_id is null then
        raise exception 'No se encontró la billetera del usuario';
      end if;

      update public.wallets set balance = balance + v_attempt.amount, updated_at = now() where id = v_wallet_id;
      insert into public.wallet_transactions (wallet_id, type, amount, status, payment_gateway_ref, is_demo)
      values (v_wallet_id, 'topup', v_attempt.amount, 'completed', 'mp:' || p_payment_id, false);

      update public.mp_payments set applied = true, updated_at = now() where mp_payment_id = p_payment_id;
      update public.mp_checkout_attempts set status = 'approved', updated_at = now() where id = p_attempt_id;

      insert into public.notifications (user_id, title, description, type, audience)
      values (
        v_attempt.user_id,
        'Recarga acreditada',
        format('Se acreditaron $%s a tu billetera con Mercado Pago.', v_attempt.amount),
        'topup_approved',
        'client'
      );
      return 'credited';
    end if;

    v_reason := case when not v_amount_ok then 'amount_mismatch' else 'duplicate' end;

  -- Reserva cuya fila ya no existe: no hay a qué aplicarlo.
  elsif v_booking_id is null then
    v_reason := 'late';

  -- Reserva.
  else
    if v_amount_ok
       and v_booking.status = 'pending'
       and v_booking.payment_method = 'mercadopago'
       and round(v_booking.total_price, 2) = v_attempt.amount
       and not exists (select 1 from public.mp_payments m where m.booking_id = v_booking.id and m.applied)
    then
      update public.bookings set status = 'confirmed', paid_at = now()
      where id = v_booking.id and status = 'pending';
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'booking_state_changed';
      end if;

      select id into v_wallet_id from public.wallets where user_id = v_booking.user_id for update;
      if v_wallet_id is null then
        raise exception 'No se encontró la billetera del usuario';
      end if;

      -- Entra y sale en el mismo instante: el saldo no cambia.
      insert into public.wallet_transactions
        (wallet_id, type, amount, related_booking_id, status, payment_gateway_ref, is_demo)
      values
        (v_wallet_id, 'topup', v_booking.total_price, v_booking.id, 'completed', 'mp:' || p_payment_id, false);
      insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
      values (v_wallet_id, 'booking_payment', -v_booking.total_price, v_booking.id, 'completed');

      update public.mp_payments set applied = true, updated_at = now() where mp_payment_id = p_payment_id;
      update public.mp_checkout_attempts set status = 'approved', updated_at = now() where id = p_attempt_id;
      update public.mp_checkout_attempts set status = 'superseded', updated_at = now()
      where booking_id = v_booking.id and id <> p_attempt_id and status = 'created';

      insert into public.notifications (user_id, title, description, type, related_booking_id)
      values (
        v_booking.owner_id,
        'Nueva reserva',
        format('Recibiste una reserva confirmada por $%s. El importe se acredita cuando finalice.', v_booking.total_price),
        'booking_created',
        v_booking.id
      );
      insert into public.notifications (user_id, title, description, type, related_booking_id)
      values (
        v_booking.user_id,
        'Pago aprobado',
        format('Pagaste $%s con Mercado Pago. Tu reserva está confirmada.', v_booking.total_price),
        'payment_approved',
        v_booking.id
      );
      return 'confirmed';
    end if;

    v_reason := case
      when not v_amount_ok or round(v_booking.total_price, 2) <> v_attempt.amount then 'amount_mismatch'
      when v_booking.status in ('pending', 'confirmed', 'completed')
        and exists (select 1 from public.mp_payments m where m.booking_id = v_booking.id and m.applied) then 'duplicate'
      else 'late'
    end;
  end if;

  update public.mp_payments
  set refund_status = 'required', refund_reason = v_reason, updated_at = now()
  where mp_payment_id = p_payment_id;
  return 'refund_required';
end;
$$;

revoke all on function public.apply_mp_payment(uuid, text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.apply_mp_payment(uuid, text, text, text, text, numeric, text) to service_role;


-- 8. record_mp_refund (solo rol de servicio) --------------------------------------------
-- Resultado del reembolso que intentó la Edge Function. El aviso al conductor sale una sola vez.

create or replace function public.record_mp_refund(
  p_payment_id text,
  p_refund_id text,
  p_ok boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.mp_payments%rowtype;
  v_user_id uuid;
begin
  select * into v_payment from public.mp_payments where mp_payment_id = p_payment_id for update;
  if not found then
    raise exception 'Pago % no encontrado', p_payment_id;
  end if;
  if v_payment.refund_status = 'done' then
    return;
  end if;
  if v_payment.refund_status = 'none' then
    raise exception 'El pago % no tiene un reembolso pendiente', p_payment_id;
  end if;

  if not p_ok then
    update public.mp_payments
    set refund_status = 'failed', refund_attempts = refund_attempts + 1, last_error = left(p_error, 500), updated_at = now()
    where mp_payment_id = p_payment_id;
    return;
  end if;

  update public.mp_payments
  set refund_status = 'done', mp_refund_id = p_refund_id, refund_attempts = refund_attempts + 1,
      last_error = null, updated_at = now()
  where mp_payment_id = p_payment_id;

  select user_id into v_user_id from public.mp_checkout_attempts where id = v_payment.attempt_id;

  insert into public.notifications (user_id, title, description, type, related_booking_id, audience)
  values (
    v_user_id,
    'Te devolvimos el dinero',
    case v_payment.refund_reason
      when 'cancelled' then format('La reserva se canceló. Te devolvimos $%s a tu cuenta de Mercado Pago.', v_payment.amount)
      when 'late' then format('Tu pago llegó cuando ya había vencido el tiempo para pagar la reserva. Te devolvimos $%s a tu cuenta de Mercado Pago.', v_payment.amount)
      else format('Te devolvimos $%s a tu cuenta de Mercado Pago.', v_payment.amount)
    end,
    'payment_refunded',
    v_payment.booking_id,
    'client'
  );
end;
$$;

revoke all on function public.record_mp_refund(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.record_mp_refund(text, text, boolean, text) to service_role;


-- 9. expire_unpaid_bookings (interna, la corre el cron) ---------------------------------
-- Cancela las reservas que no se pagaron a tiempo (plazo + 5 minutos de gracia) y vence los
-- intentos de recarga abandonados. No mueve plata: si después aparece un pago aprobado,
-- apply_mp_payment lo marca para reembolsar.

create or replace function public.expire_unpaid_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grace interval := interval '5 minutes';
  v_booking record;
  v_rows integer;
  v_expired integer := 0;
begin
  for v_booking in
    select b.id, b.user_id
    from public.bookings b
    where b.status = 'pending'
      and b.payment_method = 'mercadopago'
      and b.payment_deadline + v_grace < now()
    for update skip locked
  loop
    begin
      update public.bookings set status = 'cancelled'
      where id = v_booking.id and status = 'pending';
      get diagnostics v_rows = row_count;
      if v_rows = 1 then
        update public.mp_checkout_attempts set status = 'expired', updated_at = now()
        where booking_id = v_booking.id and status = 'created';

        insert into public.notifications (user_id, title, description, type, related_booking_id)
        values (
          v_booking.user_id,
          'Venció el tiempo para pagar',
          'No recibimos el pago de tu reserva a tiempo y se canceló. El lugar quedó libre para otros conductores.',
          'payment_expired',
          v_booking.id
        );
        v_expired := v_expired + 1;
      end if;
    exception when others then
      raise warning 'expire_unpaid_bookings: no se pudo vencer la reserva %: %', v_booking.id, sqlerrm;
    end;
  end loop;

  update public.mp_checkout_attempts set status = 'expired', updated_at = now()
  where kind = 'topup' and status = 'created' and expires_at + v_grace < now();

  return v_expired;
end;
$$;

revoke all on function public.expire_unpaid_bookings() from public, anon, authenticated;


-- 10. cancel_booking --------------------------------------------------------------------
-- Igual que la 0047, más dos casos de Mercado Pago:
--   * Pendiente sin pagar: no hay nada que devolver; se vencen los intentos y no se avisa al
--     propietario (nunca se enteró de la reserva).
--   * Pagada con Mercado Pago: la plata vuelve a Mercado Pago. En la billetera queda el
--     reintegro y la devolución (saldo igual) y el pago queda marcado para reembolsar.
-- Las reservas pagadas con billetera siguen exactamente igual.

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
  v_payment_method text;
  v_starts_at timestamp;
  v_total_price numeric;
  v_wallet_id uuid;
  v_mp_payment_id text;
  v_notify_user_id uuid;
  v_rows integer;
begin
  select p.owner_id, b.user_id, b.status, b.payment_method, b.total_price, b.date + b.start_time
  into v_owner_id, v_client_id, v_status, v_payment_method, v_total_price, v_starts_at
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

  -- Pendiente de Mercado Pago sin pagar.
  if v_status = 'pending' and v_payment_method = 'mercadopago' then
    update public.mp_checkout_attempts set status = 'expired', updated_at = now()
    where booking_id = p_booking_id and status = 'created';
    return;
  end if;

  select id into v_wallet_id from public.wallets where user_id = v_client_id for update;

  if v_payment_method = 'mercadopago' then
    select mp_payment_id into v_mp_payment_id
    from public.mp_payments
    where booking_id = p_booking_id and applied
    for update;
  end if;

  if v_mp_payment_id is not null then
    update public.mp_payments
    set refund_status = 'required', refund_reason = 'cancelled', updated_at = now()
    where mp_payment_id = v_mp_payment_id and refund_status = 'none';

    if v_wallet_id is not null then
      insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
      values (v_wallet_id, 'refund', v_total_price, p_booking_id, 'completed');
      insert into public.wallet_transactions
        (wallet_id, type, amount, related_booking_id, status, payment_gateway_ref)
      values
        (v_wallet_id, 'adjustment', -v_total_price, p_booking_id, 'completed', 'mp-refund:' || v_mp_payment_id);
    end if;
  elsif v_wallet_id is not null then
    -- Pagada con billetera (o, por si acaso, una de Mercado Pago sin pago registrado: la plata
    -- nunca se pierde, vuelve a la billetera).
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


-- 11. run_booking_jobs ------------------------------------------------------------------
-- El job de pg_cron por minuto (0066) ahora también vence las reservas sin pagar. Va primero:
-- libera lugares antes de los avisos y el cierre automático.

create or replace function public.run_booking_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.expire_unpaid_bookings();
  perform public.send_booking_day_before_reminders();
  perform public.send_booking_end_reminders();
  perform public.auto_close_stale_bookings();
end;
$$;

revoke all on function public.run_booking_jobs() from public, anon, authenticated;


-- 12. El propietario no ve las reservas de Mercado Pago que nunca se pagaron ---------------
-- Iguales a la 0059 y la 0062, más el filtro por paid_at (son SECURITY INVOKER: no pueden leer
-- mp_payments). Una reserva sin pagar todavía no es una reserva para el propietario: recién le
-- llega (con su aviso) cuando se confirma, y si vence sin pagar no le aparece nunca.

create or replace function public.list_owner_bookings(
  p_scope text,
  p_limit integer default 20,
  p_cursor_date date default null,
  p_cursor_start time default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  user_id uuid,
  parking_lot_id uuid,
  vehicle_id uuid,
  date date,
  start_time time,
  end_time time,
  status text,
  total_price numeric,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  overtime_minutes integer,
  overtime_charge numeric,
  created_at timestamptz,
  parking_lot_name text,
  client_name text,
  vehicle_plate text,
  vehicle_brand text,
  vehicle_model text
)
language sql
stable
set search_path = public
as $$
  select
    b.id, b.user_id, b.parking_lot_id, b.vehicle_id, b.date, b.start_time, b.end_time, b.status,
    b.total_price, b.actual_start_at, b.actual_end_at, b.overtime_minutes, b.overtime_charge, b.created_at,
    p.name,
    nullif(btrim(c.first_name || ' ' || c.last_name), ''),
    v.plate, v.brand, v.model
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id and p.owner_id = auth.uid()
  left join public.public_profiles c on c.id = b.user_id
  left join public.vehicles v on v.id = b.vehicle_id
  where case p_scope
      when 'active' then b.status in ('pending', 'confirmed')
      when 'history' then b.status in ('completed', 'cancelled')
        and not exists (
          select 1 from public.hidden_bookings h where h.booking_id = b.id and h.user_id = auth.uid()
        )
      else false
    end
    and not (b.payment_method = 'mercadopago' and b.paid_at is null)
    and (p_cursor_id is null or (b.date, b.start_time, b.id) < (p_cursor_date, p_cursor_start, p_cursor_id))
  order by b.date desc, b.start_time desc, b.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function public.list_owner_bookings(text, integer, date, time, uuid) from public, anon;
grant execute on function public.list_owner_bookings(text, integer, date, time, uuid) to authenticated;

create or replace function public.get_owner_booking(p_booking_id uuid)
returns table (
  id uuid,
  user_id uuid,
  parking_lot_id uuid,
  vehicle_id uuid,
  date date,
  start_time time,
  end_time time,
  status text,
  total_price numeric,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  overtime_minutes integer,
  overtime_charge numeric,
  created_at timestamptz,
  parking_lot_name text,
  parking_lot_address text,
  client_name text,
  vehicle_plate text,
  vehicle_brand text,
  vehicle_model text
)
language sql
stable
set search_path = public
as $$
  select
    b.id, b.user_id, b.parking_lot_id, b.vehicle_id, b.date, b.start_time, b.end_time, b.status,
    b.total_price, b.actual_start_at, b.actual_end_at, b.overtime_minutes, b.overtime_charge, b.created_at,
    p.name, p.address,
    nullif(btrim(c.first_name || ' ' || c.last_name), ''),
    v.plate, v.brand, v.model
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id and p.owner_id = auth.uid()
  left join public.public_profiles c on c.id = b.user_id
  left join public.vehicles v on v.id = b.vehicle_id
  where b.id = p_booking_id
    and not (b.payment_method = 'mercadopago' and b.paid_at is null);
$$;

revoke all on function public.get_owner_booking(uuid) from public, anon;
grant execute on function public.get_owner_booking(uuid) to authenticated;
